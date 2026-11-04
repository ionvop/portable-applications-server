"""Background install jobs with live progress.

An install can take minutes for a multi-gigabyte game, so the HTTP request must
not wait for it. ``start_install`` records a row, registers the job in memory
and returns immediately; a daemon thread does the download and extraction while
the UI polls ``GET /api/jobs``.

Two stores are involved, deliberately:

* **Memory** holds only *non-terminal* jobs. That is what the progress bar
  reads, and it is why a restart cannot resurrect a phantom "downloading" row.
* **SQLite** (``transfers``) holds every job, so the Downloads history survives
  a restart. The row is inserted before the thread starts, so the id the API
  returns is the same id the history will show.

Job ids are ``transfers.id`` values, so live and historical jobs share one id
space and ``GET /api/jobs/<id>`` needs no lookup table.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from .. import config, db
from ..errors import ClientError
from ..models import Job
from . import install_service

#: The job has been recorded but the worker has not started downloading yet.
QUEUED = "queued"
#: The archive is streaming to ``data/tmp``.
DOWNLOADING = "downloading"
#: The archive is being unpacked into ``data/apps``.
EXTRACTING = "extracting"
#: The install finished and the install row is current.
COMPLETED = "completed"
#: The install failed; ``error`` explains why.
FAILED = "failed"

#: Statuses that will never change again.
TERMINAL = frozenset({COMPLETED, FAILED})

#: How often a running job writes its byte progress to SQLite. Every chunk
#: would mean thousands of writes per second; this keeps the history row
#: roughly current without hammering the database.
PROGRESS_UPDATE_SECONDS = 0.5

#: Guards ``_jobs`` and ``_by_entry``. Flask serves requests on several threads,
#: so the registry is read and written concurrently.
_lock = threading.Lock()

#: Non-terminal jobs, keyed by job id.
_jobs: dict[int, Job] = {}

#: ``entry_id -> job id`` for the running job, so a second install request for
#: the same entry attaches to the existing download instead of starting another.
_by_entry: dict[int, int] = {}


def start_install(entry_id: int, force: bool = False, title: str = "") -> Job:
    """Record a job, start its worker thread and return a snapshot of it.

    A second request for an entry that is already installing returns the
    running job rather than starting a competing download into the same
    directory. ``title`` is only a display hint; the worker replaces it with the
    manifest's title once the server answers.
    """
    with _lock:
        running_id = _by_entry.get(entry_id)
        if running_id is not None:
            running = _jobs.get(running_id)
            if running is not None:
                return _snapshot(running)
            # The worker finished between the two lookups; fall through.
            _by_entry.pop(entry_id, None)

        job = _insert_job(entry_id, title)
        _jobs[job.id] = job
        _by_entry[entry_id] = job.id

    thread = threading.Thread(
        target=_run,
        args=(job, force),
        daemon=True,
        name=f"install-{job.id}",
    )
    thread.start()
    return _snapshot(job)


def list_jobs(limit: int = 100) -> list[dict[str, Any]]:
    """Active jobs first (newest first), then finished history (newest first)."""
    with _lock:
        live = [_snapshot(job).to_dict() for job in _jobs.values()]
    live.sort(key=lambda item: item["id"], reverse=True)
    return live + _list_history(limit)


def has_active_jobs() -> bool:
    """Whether any install is still running.

    A bulk reset must not delete directories out from under a worker, so the
    caller checks this first and refuses instead of racing the download.
    """
    with _lock:
        return bool(_jobs)


def get_job(job_id: int) -> dict[str, Any] | None:
    """One job by id, live or historical, or ``None`` when unknown."""
    with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            return _snapshot(job).to_dict()

    with db.get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM transfers WHERE id = ?", (job_id,)
        ).fetchone()
    return Job.from_row(row).to_dict() if row is not None else None


def reconcile_stale_jobs() -> int:
    """Mark jobs left running by a previous process as failed.

    Worker threads do not survive a restart, so any row still in a non-terminal
    state is a leftover. Without this pass the Downloads screen would show a
    progress bar that can never advance.
    """
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE transfers
               SET status = ?,
                   error = ?,
                   finished_at = datetime('now')
             WHERE status NOT IN (?, ?)
            """,
            (
                FAILED,
                "The client stopped before this install finished.",
                COMPLETED,
                FAILED,
            ),
        )
        return cursor.rowcount


def prune_jobs() -> int:
    """Delete the oldest rows beyond the configured history limit."""
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM transfers
             WHERE id NOT IN (
                   SELECT id FROM transfers
                    ORDER BY id DESC
                    LIMIT ?
             )
            """,
            (config.TRANSFER_HISTORY_LIMIT,),
        )
        return cursor.rowcount


# --------------------------------------------------------------------------
# Worker
# --------------------------------------------------------------------------


def _run(job: Job, force: bool) -> None:
    """Download and extract ``job``, recording progress and the final state."""
    last_write = 0.0

    def progress(received: int, total: "int | None") -> None:
        nonlocal last_write
        with _lock:
            job.received_bytes = received
            if total:
                job.total_bytes = total
        now = time.monotonic()
        if now - last_write >= PROGRESS_UPDATE_SECONDS:
            last_write = now
            _write_progress(job)

    def phase(name: str) -> None:
        with _lock:
            job.status = name
        _write_status(job)

    def on_manifest(manifest: dict[str, Any]) -> None:
        """Adopt the server's title so the bar is labelled while it runs."""
        title = str(manifest.get("title") or "")
        if not title:
            return
        with _lock:
            job.title = title
        _write_title(job)

    try:
        install = install_service.ensure_installed(
            job.entry_id,
            progress=progress,
            force=force,
            phase=phase,
            on_manifest=on_manifest,
        )
    except ClientError as error:
        _finish(job, FAILED, error.message)
    except Exception as error:  # noqa: BLE001 - a worker must never die silently
        _finish(job, FAILED, f"The install failed unexpectedly: {error}")
    else:
        with _lock:
            job.title = install.title or job.title
        _finish(job, COMPLETED, "")


def _finish(job: Job, status: str, error: str) -> None:
    """Move ``job`` to a terminal state, in memory and in the database."""
    with _lock:
        job.status = status
        job.error = error
        # ``total_bytes`` is the manifest's *uncompressed* size, which is larger
        # than the compressed archive actually transferred. Once the job is done
        # the real byte count is known, so the finished row reads 100% instead
        # of stalling at the compression ratio.
        if status == COMPLETED:
            job.total_bytes = job.received_bytes
        _jobs.pop(job.id, None)
        if _by_entry.get(job.entry_id) == job.id:
            _by_entry.pop(job.entry_id, None)
        snapshot = _snapshot(job)

    _write_finish(snapshot, status, error)


def _snapshot(job: Job) -> Job:
    """Copy ``job`` so a caller never serializes a half-updated object."""
    return Job(**job.to_dict())


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------


def _insert_job(entry_id: int, title: str) -> Job:
    """Insert the ``queued`` row and return it, ``started_at`` included.

    Reading the row back keeps the live job's wire shape identical to a
    historical one, so the UI never has to special-case a missing timestamp.
    """
    with db.get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO transfers (entry_id, title, status) VALUES (?, ?, ?)",
            (entry_id, title, QUEUED),
        )
        row = connection.execute(
            "SELECT * FROM transfers WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return Job.from_row(row)


def _write_progress(job: Job) -> None:
    """Persist the running byte counts (throttled by the caller)."""
    with db.get_connection() as connection:
        connection.execute(
            """
            UPDATE transfers
               SET bytes_processed = ?, size_bytes = ?
             WHERE id = ?
            """,
            (job.received_bytes, job.total_bytes, job.id),
        )


def _write_status(job: Job) -> None:
    """Persist a phase change (``downloading`` / ``extracting``)."""
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE transfers SET status = ? WHERE id = ?",
            (job.status, job.id),
        )


def _write_title(job: Job) -> None:
    """Persist the title learned from the manifest."""
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE transfers SET title = ? WHERE id = ?",
            (job.title, job.id),
        )


def _write_finish(job: Job, status: str, error: str) -> None:
    """Persist the terminal state, including the exact final byte counts."""
    with db.get_connection() as connection:
        connection.execute(
            """
            UPDATE transfers
               SET status = ?,
                   error = ?,
                   bytes_processed = ?,
                   size_bytes = ?,
                   finished_at = datetime('now')
             WHERE id = ?
            """,
            (status, error, job.received_bytes, job.total_bytes, job.id),
        )


def _list_history(limit: int) -> list[dict[str, Any]]:
    """Finished jobs, newest first. Live jobs are excluded to avoid duplicates."""
    with db.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM transfers
             WHERE status IN (?, ?)
             ORDER BY id DESC
             LIMIT ?
            """,
            (COMPLETED, FAILED, limit),
        ).fetchall()
    return [Job.from_row(row).to_dict() for row in rows]
