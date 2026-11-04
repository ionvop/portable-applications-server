"""Downloading, extracting and removing applications.

The flow for one entry is:

1. Ask the server for the manifest (version + executable path).
2. Compare it with the local install row; skip everything when it matches.
3. Stream the ZIP into ``data/tmp``.
4. Extract into ``data/apps/<slug>``, rejecting any member that would escape
   that directory (zip-slip).
5. Record the install so the next launch is instant.

Extraction is staged: the archive is unpacked into a sibling temp directory and
only moved into place once every member has been written, so a failed download
never leaves a half-installed game that looks launchable.
"""

from __future__ import annotations

import shutil
import time
import zipfile
from pathlib import Path
from typing import Any, Callable

from .. import config, db, paths
from ..errors import ClientError
from ..models import Install
from . import server_client, state_service

#: Called with ``(bytes_received, total_bytes_or_None)`` during a download.
ProgressCallback = Callable[[int, "int | None"], None]

#: Called with a coarse phase name: ``"downloading"`` then ``"extracting"``.
PhaseCallback = Callable[[str], None]

#: Called with the manifest once the server answers, before any transfer starts.
ManifestCallback = Callable[[dict[str, Any]], None]


def ensure_installed(
    entry_id: int,
    server_url: str | None = None,
    progress: ProgressCallback | None = None,
    force: bool = False,
    phase: PhaseCallback | None = None,
    on_manifest: ManifestCallback | None = None,
) -> Install:
    """Make sure ``entry_id`` is installed and current; return its install row.

    ``force`` re-downloads even when the recorded version matches, which the UI
    uses for a "Repair" action. ``phase`` reports the coarse stage so a
    background job can distinguish downloading from extracting, and
    ``on_manifest`` hands the manifest over as soon as it arrives so a job can
    show the real title while the download is still running.
    """
    manifest = server_client.get_manifest(entry_id, server_url)
    title = str(manifest.get("title") or f"Application {entry_id}")
    version = str(manifest.get("version") or "")
    executable = str(manifest.get("executable") or "")

    if on_manifest is not None:
        on_manifest(manifest)

    existing = state_service.get_install(entry_id)
    if not force and existing is not None and _is_current(existing, version):
        return existing

    slug = slugify(title)
    target = paths.apps_dir() / slug
    archive = paths.tmp_dir() / f"{slug}-{entry_id}.zip"

    # The server streams the archive chunked, so ``Content-Length`` is usually
    # absent. The manifest's uncompressed size is the best available estimate
    # and keeps the progress bar meaningful instead of indeterminate.
    fallback_total = _manifest_size(manifest)
    reported = _with_fallback_total(progress, fallback_total)

    try:
        if phase is not None:
            phase("downloading")
        server_client.download_archive(entry_id, archive, server_url, reported)
        if phase is not None:
            phase("extracting")
        _extract(archive, target)
    finally:
        _remove_quietly(archive)

    return state_service.record_install(
        entry_id=entry_id,
        title=title,
        directory=slug,
        executable=executable,
        version=version,
    )


def remove_installed(entry_id: int) -> bool:
    """Delete the install row and its directory. Returns ``True`` if removed."""
    install = state_service.get_install(entry_id)
    if install is None:
        return False

    directory = paths.apps_dir() / install.directory
    # Guard against a corrupted row pointing outside the apps folder.
    if _is_inside(directory, paths.apps_dir()):
        shutil.rmtree(directory, ignore_errors=True)
    state_service.remove_install(entry_id)
    return True


def reset_local_storage() -> int:
    """Delete every install, cached cover and partial download.

    This is the bulk counterpart of :func:`remove_installed`, backing the
    Settings screen's "Reset local storage" action. It refuses to run while an
    install is in flight: the worker is writing into ``data/apps`` and
    ``data/tmp``, so deleting those trees mid-transfer would fail the job with
    a confusing error instead of a clear one.

    Returns the number of install rows removed.
    """
    # Imported here because ``job_service`` imports this module at load time;
    # a module-level import would be circular.
    from . import job_service

    if job_service.has_active_jobs():
        raise ClientError(
            "An install is still running. Wait for it to finish, then reset.",
            status=409,
        )

    installs = state_service.list_installs()
    apps_root = paths.apps_dir()
    for install in installs:
        directory = apps_root / install.directory
        # Guard against a corrupted row pointing outside the apps folder.
        if _is_inside(directory, apps_root):
            shutil.rmtree(directory, ignore_errors=True)

    removed = state_service.clear_installs()

    # Cached covers are keyed by a server-generated filename, so they are pure
    # cache: dropping them costs one re-fetch and nothing else.
    thumbnails = paths.thumbnails_dir()
    shutil.rmtree(thumbnails, ignore_errors=True)
    thumbnails.mkdir(parents=True, exist_ok=True)

    for leftover in paths.tmp_dir().glob("*.zip"):
        _remove_quietly(leftover)

    # Transfer history describes installs that no longer exist, so it goes too.
    with db.get_connection() as connection:
        connection.execute("DELETE FROM transfers")

    return removed


def sweep_stale_downloads() -> int:
    """Delete partial downloads older than the configured age. Returns count."""
    cutoff = time.time() - config.TEMP_MAX_AGE_SECONDS
    removed = 0
    for candidate in paths.tmp_dir().glob("*.zip"):
        try:
            if candidate.stat().st_mtime < cutoff:
                candidate.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def _manifest_size(manifest: dict[str, Any]) -> int:
    """Read the manifest's ``size_bytes`` as a non-negative int, or ``0``."""
    raw = manifest.get("size_bytes")
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


def _with_fallback_total(
    progress: ProgressCallback | None, fallback_total: int
) -> ProgressCallback | None:
    """Substitute ``fallback_total`` whenever the download reports no total."""
    if progress is None or fallback_total <= 0:
        return progress

    def report(received: int, total: "int | None") -> None:
        progress(received, total if total else fallback_total)

    return report


def _is_current(install: Install, version: str) -> bool:
    """Whether the installed copy matches the server's manifest.

    A server that publishes no version cannot be compared, so the install is
    trusted as-is rather than re-downloading on every launch.
    """
    if not version:
        return True
    return install.version == version


def _extract(archive: Path, target: Path) -> None:
    """Extract ``archive`` into ``target``, replacing any previous contents.

    Members are validated before anything is written: an entry whose resolved
    path escapes ``target`` aborts the whole extraction.
    """
    staging = target.with_name(f"{target.name}.extracting")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                destination = _safe_member_path(staging, member.filename)
                if member.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, destination.open("wb") as sink:
                    shutil.copyfileobj(source, sink, config.ZIP_CHUNK_SIZE)
    except zipfile.BadZipFile as error:
        shutil.rmtree(staging, ignore_errors=True)
        raise ClientError(
            "The downloaded archive is corrupt. Try installing again.", status=502
        ) from error
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    # Swap the staged tree into place only after a complete extraction.
    shutil.rmtree(target, ignore_errors=True)
    staging.replace(target)


def _safe_member_path(root: Path, name: str) -> Path:
    """Resolve an archive member inside ``root`` or raise on traversal."""
    candidate = (root / name).resolve()
    if not _is_inside(candidate, root.resolve()):
        raise ClientError(
            f"The archive contains an unsafe path: {name}", status=502
        )
    return candidate


def _is_inside(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def slugify(value: str) -> str:
    """Turn a title into a filesystem-safe slug (mirrors the server's helper)."""
    cleaned = "".join(
        character if character.isalnum() else "-" for character in value.lower()
    )
    return "-".join(part for part in cleaned.split("-") if part) or "application"


def _remove_quietly(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def install_summary(entry_id: int) -> dict[str, Any] | None:
    """Install row as a dict, or ``None`` when not installed."""
    install = state_service.get_install(entry_id)
    return install.to_dict() if install is not None else None
