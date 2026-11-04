"""Smoke test for the client backend. Run: python backend/smoke_test.py

No real server is required: a stub HTTP server on loopback implements the
endpoints the client expects, so the whole download/extract/launch path is
exercised end to end.
"""

from __future__ import annotations

import base64
import io
import json
import shutil
import sys
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import db, paths, settings
from backend.app import create_app
from backend.errors import ClientError
from backend.models import Install
from backend.services import (
    install_service,
    job_service,
    launch_service,
    server_client,
    state_service,
)

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    if condition:
        print(f"  PASS  {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label} {detail}")


def wait_for_job(client, job_id: int, timeout: float = 10.0) -> dict:
    """Poll ``GET /api/jobs/<id>`` until the job reaches a terminal state.

    Installs run on a background thread, so the test has to wait for the worker
    rather than read the response body. A timeout returns the last snapshot so
    the caller's assertions report the real state instead of raising.
    """
    deadline = time.monotonic() + timeout
    job: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}")
        if response.status_code != 200:
            return {"status": "missing", "error": response.get_json()}
        job = response.get_json()
        if job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.02)
    return job


# --------------------------------------------------------------------------
# Stub server
# --------------------------------------------------------------------------

ENTRY_ID = 7
ENTRY_TITLE = "Smoke Game"
ENTRY_VERSION = "1.0.0"
ENTRY_EXECUTABLE = "bin/game.exe"
THUMBNAIL_NAME = "cover.png"

#: A 1x1 transparent PNG. Enough to prove the proxy round-trips bytes and
#: preserves the content type.
THUMBNAIL_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)


def _build_archive() -> bytes:
    """A small ZIP with a nested executable and a data file."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr(ENTRY_EXECUTABLE, b"MZ fake executable")
        bundle.writestr("data/level1.dat", b"level data")
    return buffer.getvalue()


ARCHIVE = _build_archive()


class StubHandler(BaseHTTPRequestHandler):
    """Minimal implementation of the server contract the client depends on."""

    def log_message(self, *_args: object) -> None:
        """Silence request logging."""

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/api/health":
            self._json({"status": "ok"})
        elif self.path == "/api/client/catalog":
            self._json(
                [
                    {
                        "id": ENTRY_ID,
                        "title": ENTRY_TITLE,
                        "description": "Test entry",
                        "thumbnail": THUMBNAIL_NAME,
                    }
                ]
            )
        elif self.path == f"/api/client/catalog/{ENTRY_ID}/manifest":
            self._json(
                {
                    "id": ENTRY_ID,
                    "title": ENTRY_TITLE,
                    "version": ENTRY_VERSION,
                    "executable": ENTRY_EXECUTABLE,
                    "size_bytes": len(ARCHIVE),
                }
            )
        elif self.path == f"/api/distribution/{ENTRY_ID}/download":
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(ARCHIVE)))
            self.end_headers()
            self.wfile.write(ARCHIVE)
        elif self.path == f"/api/files/thumbnail/{THUMBNAIL_NAME}":
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(THUMBNAIL_BYTES)))
            self.end_headers()
            self.wfile.write(THUMBNAIL_BYTES)
        elif self.path == "/api/client/catalog/999/manifest":
            self._json({"error": "Catalog entry 999 not found."}, status=404)
        else:
            self._json({"error": "Not found."}, status=404)

    def _json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_stub() -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------


def main() -> int:
    db.init_db()
    install_service.sweep_stale_downloads()

    stub, server_url = start_stub()
    settings.set_server_url(server_url)
    client = create_app().test_client()

    try:
        print("system")
        response = client.get("/api/health")
        check("health returns 200", response.status_code == 200, response.status_code)
        check("health body", response.get_json() == {"status": "ok"})

        response = client.get("/api/system/info")
        info = response.get_json()
        check("system info returns 200", response.status_code == 200)
        check("system info has server_url", info["server_url"] == server_url)
        check("system info data_dir exists", Path(info["data_dir"]).is_dir())
        check("system info installed_count", info["installed_count"] == 0, info)

        print("settings")
        response = client.get("/api/settings")
        check("settings returns 200", response.status_code == 200)
        check("settings has server_url", "server_url" in response.get_json())

        response = client.put("/api/settings", json={"server_url": "not a url"})
        check("bad url rejected", response.status_code == 400, response.status_code)

        response = client.put("/api/settings", json={"server_url": "http://10.0.0.5:8756/"})
        check("url accepted", response.status_code == 200, response.status_code)
        check(
            "trailing slash stripped",
            response.get_json()["server_url"] == "http://10.0.0.5:8756",
            response.get_json(),
        )
        settings.set_server_url(server_url)  # restore for the rest of the run

        print("settings/test")
        response = client.post("/api/settings/test", json={"server_url": server_url})
        check("test connection returns 200", response.status_code == 200, response.status_code)
        check(
            "test connection reports ok",
            response.get_json() == {"status": "ok", "server_url": server_url},
            response.get_json(),
        )

        # An empty body must fall back to the stored address.
        response = client.post("/api/settings/test")
        check("test connection uses stored url", response.status_code == 200, response.status_code)

        response = client.post("/api/settings/test", json={"server_url": "not a url"})
        check("test connection rejects bad url", response.status_code == 400, response.status_code)

        response = client.post("/api/settings/test", json={"server_url": 42})
        check("test connection rejects non-string", response.status_code == 400, response.status_code)

        # A closed port must surface the unreachable message, not a crash.
        response = client.post(
            "/api/settings/test", json={"server_url": "http://127.0.0.1:1"}
        )
        check("test connection dead port returns 503", response.status_code == 503, response.status_code)
        check(
            "test connection dead port explains itself",
            "could not reach" in response.get_json()["error"].lower(),
            response.get_json(),
        )

        # With nothing stored and nothing supplied there is nothing to probe.
        settings.set_server_url("")
        response = client.post("/api/settings/test")
        check("test connection without url returns 400", response.status_code == 400, response.status_code)
        settings.set_server_url(server_url)

        # Testing must never persist: the stored address is unchanged.
        client.post("/api/settings/test", json={"server_url": "http://10.0.0.9:8756"})
        check(
            "test connection does not persist",
            settings.get_server_url() == server_url,
            settings.get_server_url(),
        )

        print("catalog")
        response = client.get("/api/catalog")
        entries = response.get_json()
        check("catalog returns 200", response.status_code == 200, response.status_code)
        check("catalog has one entry", len(entries) == 1, entries)
        check("catalog entry not installed", entries[0]["installed"] is False)
        check("catalog entry has no executable", "executable" not in entries[0])

        response = client.get(f"/api/catalog/{ENTRY_ID}")
        manifest = response.get_json()
        check("manifest returns 200", response.status_code == 200, response.status_code)
        check("manifest exposes executable", manifest["executable"] == ENTRY_EXECUTABLE)

        response = client.get("/api/catalog/999")
        check("missing manifest returns 404", response.status_code == 404, response.status_code)
        check(
            "missing manifest carries server message",
            "not found" in response.get_json()["error"].lower(),
            response.get_json(),
        )

        print("thumbnails")
        cached = paths.thumbnails_dir() / THUMBNAIL_NAME
        cached.unlink(missing_ok=True)

        response = client.get(f"/api/thumbnails/{THUMBNAIL_NAME}")
        check("thumbnail proxy returns 200", response.status_code == 200, response.status_code)
        check("thumbnail proxy serves the image", response.data == THUMBNAIL_BYTES)
        check(
            "thumbnail proxy keeps the content type",
            response.headers.get("Content-Type", "").startswith("image/png"),
            response.headers.get("Content-Type"),
        )
        check("thumbnail cached on disk", cached.is_file())

        # A second request must be served from the cache, not the server.
        original_fetch = server_client.fetch_thumbnail
        fetches: list[str] = []

        def counting_fetch(name, *args, **kwargs):
            fetches.append(name)
            return original_fetch(name, *args, **kwargs)

        server_client.fetch_thumbnail = counting_fetch
        try:
            response = client.get(f"/api/thumbnails/{THUMBNAIL_NAME}")
            check("cached thumbnail returns 200", response.status_code == 200)
            check("cached thumbnail skips the server", fetches == [], fetches)
        finally:
            server_client.fetch_thumbnail = original_fetch

        response = client.get("/api/thumbnails/..%2F..%2Fsettings.json")
        check("thumbnail traversal rejected", response.status_code == 400, response.status_code)

        response = client.get("/api/thumbnails/missing.png")
        check("missing thumbnail returns 404", response.status_code == 404, response.status_code)

        print("install")
        response = client.post(f"/api/apps/{ENTRY_ID}/install")
        check("install returns 202", response.status_code == 202, response.status_code)
        job = response.get_json()
        check("install returns a job", isinstance(job.get("id"), int), job)
        check("job starts queued or running", job["status"] in {"queued", "downloading", "extracting"}, job)
        check("job carries the entry id", job["entry_id"] == ENTRY_ID, job)

        job = wait_for_job(client, job["id"])
        check("job completes", job["status"] == "completed", job)
        check("job reports no error", job["error"] == "", job)
        check("job received bytes", job["received_bytes"] == len(ARCHIVE), job)
        check("job total bytes", job["total_bytes"] == len(ARCHIVE), job)
        check("job has a finish time", bool(job["finished_at"]), job)

        install = state_service.get_install(ENTRY_ID)
        check("install recorded", install is not None)
        assert install is not None
        check("install records version", install.version == ENTRY_VERSION, install)
        check("install records executable", install.executable == ENTRY_EXECUTABLE, install)

        app_dir = paths.apps_dir() / install.directory
        check("app directory created", app_dir.is_dir())
        check("executable extracted", (app_dir / ENTRY_EXECUTABLE).is_file())
        check("nested data extracted", (app_dir / "data" / "level1.dat").is_file())
        check("no temp archive left", not list(paths.tmp_dir().glob("*.zip")))

        response = client.get("/api/apps/installed")
        check("installed list has one", len(response.get_json()) == 1, response.get_json())

        response = client.get("/api/catalog")
        check("catalog now reports installed", response.get_json()[0]["installed"] is True)

        print("jobs")
        response = client.get("/api/jobs")
        jobs = response.get_json()
        check("jobs returns 200", response.status_code == 200, response.status_code)
        check("jobs lists the finished install", any(item["id"] == job["id"] for item in jobs), jobs)
        check("finished job is not active", all(item["status"] in {"completed", "failed"} for item in jobs), jobs)

        response = client.get(f"/api/jobs/{job['id']}")
        check("job by id returns 200", response.status_code == 200, response.status_code)
        check("job by id matches", response.get_json()["id"] == job["id"])

        response = client.get("/api/jobs/999999")
        check("unknown job returns 404", response.status_code == 404, response.status_code)

        response = client.get("/api/jobs?limit=abc")
        check("bad job limit rejected", response.status_code == 400, response.status_code)

        # A second install with the same version must not re-download.
        calls: list[int] = []
        original_download = server_client.download_archive

        def counting_download(*args, **kwargs):
            calls.append(1)
            return original_download(*args, **kwargs)

        server_client.download_archive = counting_download
        try:
            response = client.post(f"/api/apps/{ENTRY_ID}/install")
            check("reinstall returns 202", response.status_code == 202, response.status_code)
            skipped = wait_for_job(client, response.get_json()["id"])
            check("current install completes", skipped["status"] == "completed", skipped)
            check("current install skips download", calls == [], calls)

            response = client.post(f"/api/apps/{ENTRY_ID}/install", json={"force": True})
            forced = wait_for_job(client, response.get_json()["id"])
            check("forced install completes", forced["status"] == "completed", forced)
            check("forced install re-downloads", calls == [1], calls)
        finally:
            server_client.download_archive = original_download

        print("job progress")
        # A slow download proves two things at once: the request returns before
        # the transfer finishes, and a second request attaches to the running
        # job instead of starting a competing one.
        slow_calls: list[int] = []
        release = threading.Event()

        def slow_download(entry_id, destination, server_url=None, progress=None):
            slow_calls.append(1)
            total = len(ARCHIVE)
            if progress is not None:
                progress(total // 4, total)
            # Hold the worker until the test has observed the running job.
            release.wait(timeout=5)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(ARCHIVE)
            if progress is not None:
                progress(total, total)
            return destination

        server_client.download_archive = slow_download
        try:
            response = client.post(f"/api/apps/{ENTRY_ID}/install", json={"force": True})
            check("slow install returns 202", response.status_code == 202, response.status_code)
            running = response.get_json()

            # The worker is parked, so the job must still be in flight. Poll
            # until it has actually reported progress: the thread may not have
            # been scheduled yet when the POST returns.
            observed = running
            deadline = time.monotonic() + 5.0
            while time.monotonic() < deadline:
                observed = client.get(f"/api/jobs/{running['id']}").get_json()
                if observed["received_bytes"] > 0:
                    break
                time.sleep(0.02)
            check(
                "job is still running while downloading",
                observed["status"] in {"queued", "downloading", "extracting"},
                observed,
            )
            check("job reports partial progress", observed["received_bytes"] > 0, observed)
            check("job reports a total", observed["total_bytes"] == len(ARCHIVE), observed)

            # A duplicate request must attach to the same job.
            duplicate = client.post(f"/api/apps/{ENTRY_ID}/install", json={"force": True})
            check("duplicate install returns 202", duplicate.status_code == 202, duplicate.status_code)
            check(
                "duplicate install reuses the running job",
                duplicate.get_json()["id"] == running["id"],
                duplicate.get_json(),
            )
            check("duplicate install starts no second download", len(slow_calls) == 1, slow_calls)

            release.set()
            finished = wait_for_job(client, running["id"])
            check("slow install completes", finished["status"] == "completed", finished)
            check("slow install reports full size", finished["received_bytes"] == len(ARCHIVE), finished)
        finally:
            release.set()
            server_client.download_archive = original_download

        print("job failures")
        # A manifest 404 must surface as a failed job, not a hung one.
        response = client.post("/api/apps/999/install")
        check("install of a missing entry returns 202", response.status_code == 202, response.status_code)
        failed = wait_for_job(client, response.get_json()["id"])
        check("missing entry job fails", failed["status"] == "failed", failed)
        check("failed job explains itself", "not found" in failed["error"].lower(), failed)

        # A job left running by a previous process must be reconciled on startup.
        with db.get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO transfers (entry_id, title, status) VALUES (?, ?, 'downloading')",
                (ENTRY_ID, "Leftover"),
            )
            leftover_id = int(cursor.lastrowid)
        job_service.reconcile_stale_jobs()
        leftover = job_service.get_job(leftover_id)
        check("stale job reconciled", leftover is not None and leftover["status"] == "failed", leftover)
        check(
            "stale job explains itself",
            leftover is not None and "stopped" in leftover["error"].lower(),
            leftover,
        )

        print("launch")
        launched: list[dict[str, object]] = []

        class FakeProcess:
            pid = 4242

        original_popen = launch_service.subprocess.Popen

        def fake_popen(args, **kwargs):
            launched.append({"args": args, "kwargs": kwargs})
            return FakeProcess()

        launch_service.subprocess.Popen = fake_popen
        try:
            response = client.post(f"/api/apps/{ENTRY_ID}/launch")
            check("launch returns 200", response.status_code == 200, response.status_code)
            check("launch reports pid", response.get_json()["pid"] == 4242)
            check("launch ran once", len(launched) == 1, launched)
            check(
                "launch used the resolved executable",
                launched[0]["args"] == [str((app_dir / ENTRY_EXECUTABLE).resolve())],
                launched[0]["args"],
            )
            check(
                "launch set cwd to the app folder",
                launched[0]["kwargs"]["cwd"] == str((app_dir / ENTRY_EXECUTABLE).resolve().parent),
                launched[0]["kwargs"],
            )
        finally:
            launch_service.subprocess.Popen = original_popen

        response = client.post("/api/apps/999/launch")
        check("launch uninstalled returns 404", response.status_code == 404, response.status_code)

        print("path guards")
        for bad in ("../escape.exe", "C:/Windows/system32/cmd.exe", "/abs/path.exe"):
            try:
                launch_service.resolve_executable(
                    Install(
                        entry_id=1,
                        title="Bad",
                        directory=install.directory,
                        executable=bad,
                        version="1",
                    )
                )
                check(f"rejects executable {bad!r}", False, "no error raised")
            except ClientError:
                check(f"rejects executable {bad!r}", True)

        try:
            install_service._safe_member_path(paths.tmp_dir(), "../../evil.exe")
            check("rejects zip-slip member", False, "no error raised")
        except ClientError:
            check("rejects zip-slip member", True)

        print("remove")
        response = client.delete(f"/api/apps/{ENTRY_ID}")
        check("remove returns 200", response.status_code == 200, response.status_code)
        check("app directory deleted", not app_dir.exists())
        check("install row deleted", state_service.get_install(ENTRY_ID) is None)

        response = client.delete(f"/api/apps/{ENTRY_ID}")
        check("remove twice returns 404", response.status_code == 404, response.status_code)

        print("reset local storage")
        # Reinstall so the bulk reset has something to delete.
        response = client.post(f"/api/apps/{ENTRY_ID}/install")
        reinstalled = wait_for_job(client, response.get_json()["id"])
        check("reinstall before reset completes", reinstalled["status"] == "completed", reinstalled)
        check("install row exists before reset", state_service.get_install(ENTRY_ID) is not None)
        check("app directory exists before reset", app_dir.is_dir())
        check("thumbnail cache is populated", any(paths.thumbnails_dir().iterdir()))

        # A reset must refuse while a worker is writing into the same trees.
        reset_release = threading.Event()

        def parked_download(entry_id, destination, server_url=None, progress=None):
            reset_release.wait(timeout=5)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(ARCHIVE)
            return destination

        server_client.download_archive = parked_download
        try:
            response = client.post(f"/api/apps/{ENTRY_ID}/install", json={"force": True})
            parked = response.get_json()
            response = client.delete("/api/apps")
            check("reset during an install returns 409", response.status_code == 409, response.status_code)
            check(
                "reset during an install explains itself",
                "still running" in response.get_json()["error"].lower(),
                response.get_json(),
            )
            check("refused reset keeps the install row", state_service.get_install(ENTRY_ID) is not None)
        finally:
            reset_release.set()
            server_client.download_archive = original_download
            wait_for_job(client, parked["id"])

        response = client.delete("/api/apps")
        check("reset returns 200", response.status_code == 200, response.status_code)
        check("reset reports one removal", response.get_json()["removed"] == 1, response.get_json())
        check("reset deletes the install row", state_service.get_install(ENTRY_ID) is None)
        check("reset deletes the app directory", not app_dir.exists())
        check("reset clears the thumbnail cache", not any(paths.thumbnails_dir().iterdir()))
        check("reset clears the transfer history", client.get("/api/jobs").get_json() == [])
        check("reset keeps the server address", settings.get_server_url() == server_url)

        response = client.delete("/api/apps")
        check("reset twice returns 200", response.status_code == 200, response.status_code)
        check("second reset removes nothing", response.get_json()["removed"] == 0, response.get_json())

        print("frontend")
        response = client.get("/api/does-not-exist")
        check("unknown api returns 404", response.status_code == 404, response.status_code)
        check("unknown api is json", response.get_json() == {"error": "Not found."})

    finally:
        stub.shutdown()
        stub.server_close()
        # Leave no state behind for the next run.
        shutil.rmtree(paths.apps_dir(), ignore_errors=True)
        paths.apps_dir()
        shutil.rmtree(paths.thumbnails_dir(), ignore_errors=True)
        paths.thumbnails_dir()
        for leftover in paths.tmp_dir().glob("*.zip"):
            leftover.unlink(missing_ok=True)
        state_service.remove_install(ENTRY_ID)
        # Transfer history is persistent by design, so the test clears it to
        # keep repeated runs from accumulating rows.
        with db.get_connection() as connection:
            connection.execute("DELETE FROM transfers")
        settings.set_server_url("")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed:")
        for label in failures:
            print(f"  - {label}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
