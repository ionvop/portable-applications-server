"""Headless verification of a packaged (or source) build.

``build.bat`` runs ``PortableApplicationsClient.exe --selftest`` after
PyInstaller finishes, and again from a copy of the release folder in ``%TEMP%``.
That is the only way to prove the things Step 11 asks for from *inside* the
frozen process:

* the bundle serves the built frontend (``_internal/dist``),
* writable state lands beside the executable, not inside the bundle,
* the API answers, and a real socket can be bound.

The build is windowed, so there is no stdout to read. Every check is written to
a report file (``data/selftest.log`` by default) and the exit code carries the
verdict: ``0`` all passed, ``1`` something failed.
"""

from __future__ import annotations

import json
import logging
import sys
import urllib.request
from pathlib import Path
from typing import Any

from . import config, db, paths

#: Marker the build script greps for, so a truncated report cannot look green.
PASS_MARKER = "SELFTEST: PASS"
FAIL_MARKER = "SELFTEST: FAIL"


class _Report:
    """Collects check results and writes them to the report file."""

    def __init__(self, destination: Path) -> None:
        self.destination = destination
        self.lines: list[str] = []
        self.failures: list[str] = []

    def check(self, label: str, condition: bool, detail: object = "") -> bool:
        if condition:
            self.lines.append(f"  PASS  {label}")
        else:
            self.failures.append(label)
            self.lines.append(f"  FAIL  {label} {detail}")
        return condition

    def note(self, text: str) -> None:
        self.lines.append(text)

    def write(self) -> None:
        verdict = FAIL_MARKER if self.failures else PASS_MARKER
        body = "\n".join(
            [
                f"{config.APP_NAME} {config.VERSION} selftest",
                f"frozen: {paths.is_frozen()}",
                f"executable: {sys.executable}",
                f"base_dir: {paths.base_dir()}",
                f"resource_root: {paths.resource_root()}",
                f"web_dir: {paths.web_dir()}",
                f"data_dir: {paths.data_dir()}",
                "",
                *self.lines,
                "",
                verdict,
                "",
            ]
        )
        try:
            self.destination.parent.mkdir(parents=True, exist_ok=True)
            self.destination.write_text(body, encoding="utf-8")
        except OSError:
            # The report is the only channel, so a failure to write it is
            # itself a failure — but there is nowhere left to say so.
            pass


def run(log_path: str | Path | None = None) -> int:
    """Run every check and return ``0`` when they all pass."""
    destination = Path(log_path) if log_path else paths.data_dir() / config.SELFTEST_LOG_FILE_NAME
    report = _Report(destination)

    # The socket check drives a real WSGI server, which logs every request to
    # stderr. The report is the only output that matters here.
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    _check_paths(report)
    _check_data_dir(report)
    _check_frontend(report)
    _check_api(report)
    _check_socket(report)

    report.write()
    return 1 if report.failures else 0


def _check_paths(report: _Report) -> None:
    """Read-only resources come from the bundle; data comes from beside the exe."""
    report.note("paths")
    if paths.is_frozen():
        expected = Path(sys.executable).resolve().parent
        report.check(
            "data folder is beside the executable",
            paths.base_dir().resolve() == expected,
            f"{paths.base_dir()} != {expected}",
        )
        report.check(
            "resources are not read from the data folder",
            paths.resource_root().resolve() != expected,
            paths.resource_root(),
        )
    else:
        report.note("  SKIP  frozen path checks (running from source)")

    report.check(
        "frontend directory exists",
        paths.web_dir().is_dir(),
        paths.web_dir(),
    )
    report.check(
        "index.html is bundled",
        (paths.web_dir() / "index.html").is_file(),
        paths.web_dir() / "index.html",
    )


def _check_data_dir(report: _Report) -> None:
    """The data folder must be writable, or installs and settings cannot work."""
    report.note("data folder")
    try:
        data = paths.data_dir()
        probe = data / ".selftest-probe"
        probe.write_text("ok", encoding="utf-8")
        readable = probe.read_text(encoding="utf-8") == "ok"
        probe.unlink()
    except OSError as error:
        report.check("data folder is writable", False, error)
        return
    report.check("data folder is writable", readable, data)

    try:
        db.init_db()
        report.check("database can be opened", paths.db_path().is_file(), paths.db_path())
    except Exception as error:  # noqa: BLE001 - report, never raise
        report.check("database can be opened", False, error)


def _check_frontend(report: _Report) -> None:
    """The SPA must be served from the bundle, assets included."""
    report.note("frontend")
    client = _client()
    response = client.get("/")
    report.check("GET / returns 200", response.status_code == 200, response.status_code)
    body = response.get_data(as_text=True)
    report.check("index.html mounts the app", '<div id="root">' in body, body[:120])

    asset = _first_asset(body)
    if asset is None:
        report.check("index.html references a built asset", False, "no /assets/ reference")
    else:
        asset_response = client.get(asset)
        report.check(
            f"GET {asset} returns 200",
            asset_response.status_code == 200,
            asset_response.status_code,
        )
        report.check(
            "asset is not empty",
            len(asset_response.get_data()) > 0,
            len(asset_response.get_data()),
        )

    fallback = client.get("/library")
    report.check(
        "unknown route falls back to the SPA",
        fallback.status_code == 200 and '<div id="root">' in fallback.get_data(as_text=True),
        fallback.status_code,
    )
    missing = client.get("/api/does-not-exist")
    report.check(
        "unknown API route returns JSON 404",
        missing.status_code == 404 and "error" in (missing.get_json() or {}),
        missing.status_code,
    )


def _check_api(report: _Report) -> None:
    """Every read-only endpoint the UI needs on first paint."""
    report.note("api")
    client = _client()

    health = client.get("/api/health")
    report.check(
        "GET /api/health is ok",
        health.status_code == 200 and (health.get_json() or {}).get("status") == "ok",
        health.status_code,
    )

    info = client.get("/api/system/info")
    payload: dict[str, Any] = info.get_json() or {}
    report.check("GET /api/system/info returns 200", info.status_code == 200, info.status_code)
    report.check(
        "system info names the application",
        payload.get("app_name") == config.APP_NAME,
        payload.get("app_name"),
    )
    report.check(
        "system info reports the data folder",
        str(payload.get("data_dir", "")).endswith(config.DATA_DIR_NAME),
        payload.get("data_dir"),
    )

    installed = client.get("/api/apps/installed")
    report.check(
        "GET /api/apps/installed returns a list",
        installed.status_code == 200 and isinstance(installed.get_json(), list),
        installed.status_code,
    )

    settings = client.get("/api/settings")
    report.check(
        "GET /api/settings returns an object",
        settings.status_code == 200 and isinstance(settings.get_json(), dict),
        settings.status_code,
    )

    jobs = client.get("/api/jobs")
    report.check(
        "GET /api/jobs returns a list",
        jobs.status_code == 200 and isinstance(jobs.get_json(), list),
        jobs.status_code,
    )

    # The catalog needs a server. Unconfigured is a 503 with a readable message;
    # configured-but-unreachable is also a 503. Either way it must not be a 500.
    catalog = client.get("/api/catalog")
    report.check(
        "GET /api/catalog degrades cleanly",
        catalog.status_code in (200, 503),
        catalog.status_code,
    )


def _check_socket(report: _Report) -> None:
    """A real socket must bind and answer, not just the in-process test client."""
    report.note("socket")
    from werkzeug.serving import make_server

    try:
        server = make_server(config.UI_HOST, 0, _client().application, threaded=True)
    except OSError as error:
        report.check("local server can bind a port", False, error)
        return

    port = server.server_port
    report.check("local server can bind a port", port > 0, port)

    import threading

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://{config.UI_HOST}:{port}/api/health"
        with urllib.request.urlopen(url, timeout=5) as reply:
            payload = json.loads(reply.read().decode("utf-8"))
        report.check(
            "local server answers over HTTP",
            payload.get("status") == "ok",
            payload,
        )
    except Exception as error:  # noqa: BLE001 - report, never raise
        report.check("local server answers over HTTP", False, error)
    finally:
        server.shutdown()
        thread.join(timeout=5)


def _client():
    """A Flask test client over a freshly built app."""
    from .app import create_app

    return create_app().test_client()


def _first_asset(html: str) -> str | None:
    """Return the first ``/assets/...`` reference in ``index.html``."""
    marker = "/assets/"
    start = html.find(marker)
    if start == -1:
        return None
    end = start
    while end < len(html) and html[end] not in "\"'":
        end += 1
    return html[start:end]


__all__ = ["FAIL_MARKER", "PASS_MARKER", "run"]
