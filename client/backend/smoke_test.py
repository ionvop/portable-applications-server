"""Smoke test for the client backend. Run: python backend/smoke_test.py

No real server is required: a stub HTTP server on loopback implements the
endpoints the client expects, so the whole download/extract/launch path is
exercised end to end.
"""

from __future__ import annotations

import io
import json
import shutil
import sys
import threading
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


# --------------------------------------------------------------------------
# Stub server
# --------------------------------------------------------------------------

ENTRY_ID = 7
ENTRY_TITLE = "Smoke Game"
ENTRY_VERSION = "1.0.0"
ENTRY_EXECUTABLE = "bin/game.exe"


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
        if self.path == "/api/client/catalog":
            self._json(
                [
                    {
                        "id": ENTRY_ID,
                        "title": ENTRY_TITLE,
                        "description": "Test entry",
                        "thumbnail": "",
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

        print("install")
        response = client.post(f"/api/apps/{ENTRY_ID}/install")
        check("install returns 201", response.status_code == 201, response.status_code)
        install = response.get_json()
        check("install records version", install["version"] == ENTRY_VERSION, install)
        check("install records executable", install["executable"] == ENTRY_EXECUTABLE)

        app_dir = paths.apps_dir() / install["directory"]
        check("app directory created", app_dir.is_dir())
        check("executable extracted", (app_dir / ENTRY_EXECUTABLE).is_file())
        check("nested data extracted", (app_dir / "data" / "level1.dat").is_file())
        check("no temp archive left", not list(paths.tmp_dir().glob("*.zip")))

        response = client.get("/api/apps/installed")
        check("installed list has one", len(response.get_json()) == 1, response.get_json())

        response = client.get("/api/catalog")
        check("catalog now reports installed", response.get_json()[0]["installed"] is True)

        # A second install with the same version must not re-download.
        calls: list[int] = []
        original_download = server_client.download_archive

        def counting_download(*args, **kwargs):
            calls.append(1)
            return original_download(*args, **kwargs)

        server_client.download_archive = counting_download
        try:
            response = client.post(f"/api/apps/{ENTRY_ID}/install")
            check("reinstall returns 201", response.status_code == 201, response.status_code)
            check("current install skips download", calls == [], calls)

            response = client.post(f"/api/apps/{ENTRY_ID}/install", json={"force": True})
            check("forced install re-downloads", calls == [1], calls)
        finally:
            server_client.download_archive = original_download

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
                        directory=install["directory"],
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
        for leftover in paths.tmp_dir().glob("*.zip"):
            leftover.unlink(missing_ok=True)
        state_service.remove_install(ENTRY_ID)
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
