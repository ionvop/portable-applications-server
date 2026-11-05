"""End-to-end contract test against a real Portable Applications Server.

``smoke_test.py`` proves the client works against a *stub* that implements the
server contract. That is fast and hermetic, but it cannot catch a contract
drift: if the server renames a field or changes a status code, the stub would
happily keep answering the old shape.

This test closes that gap. It starts the **real** server package in a
subprocess (so the two ``backend`` packages never collide in ``sys.modules``),
publishes a fixture application through the server's own admin API, and then
drives the client's real services against it:

    catalog -> manifest -> download -> extract -> install row -> launch
            -> bump the published version -> re-install -> new version recorded

That is the roadmap's "done when" for Step 11: a fresh client machine can
install, launch and update an application entirely from the server.

It is skipped unless ``PAS_SERVER_DIR`` points at the server checkout, because
the two repositories are separate and CI may only have one of them::

    PAS_SERVER_DIR=../server python -m pytest backend/tests/test_integration.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from backend import db, paths, settings
from backend.errors import ClientError
from backend.services import install_service, launch_service, server_client, state_service

#: The server checkout, or ``None`` when the test cannot run.
SERVER_DIR = os.environ.get("PAS_SERVER_DIR", "").strip()

pytestmark = pytest.mark.skipif(
    not SERVER_DIR or not (Path(SERVER_DIR) / "backend" / "app.py").is_file(),
    reason=(
        "Set PAS_SERVER_DIR to the Portable Applications Server checkout to run "
        "the cross-repo contract test (e.g. PAS_SERVER_DIR=../server)."
    ),
)

#: Launcher written to a temp file and run as a subprocess. It imports the
#: server package from its own directory, binds an ephemeral port and prints it,
#: so the test never guesses a port or fights a running instance.
LAUNCHER = textwrap.dedent(
    """
    import sys
    from werkzeug.serving import make_server

    sys.path.insert(0, sys.argv[1])

    from backend import db
    from backend.app import create_app

    db.init_db()
    server = make_server("127.0.0.1", 0, create_app(), threaded=True)
    print(server.server_port, flush=True)
    server.serve_forever()
    """
)

#: The fixture application published through the server's admin API.
APP_TITLE = "Integration Fixture"
APP_DIRECTORY = "integration-fixture"
APP_EXECUTABLE = "bin/fixture.exe"
APP_VERSION = "1.0.0"
APP_UPDATED_VERSION = "2.0.0"


def _write_fixture_app(apps_root: Path) -> None:
    """Create the application directory the server will archive."""
    app_dir = apps_root / APP_DIRECTORY
    (app_dir / "bin").mkdir(parents=True, exist_ok=True)
    (app_dir / "bin" / "fixture.exe").write_bytes(b"MZ integration fixture")
    (app_dir / "data").mkdir(parents=True, exist_ok=True)
    (app_dir / "data" / "level1.dat").write_bytes(b"level data" * 512)


def _request(url: str, method: str = "GET", payload: object = None) -> object:
    """Minimal JSON request helper for the server's admin API."""
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _wait_for_server(url: str, timeout: float = 15.0) -> None:
    """Poll ``/api/health`` until the subprocess is accepting requests."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if _request(f"{url}/api/health") == {"status": "ok"}:
                return
        except (urllib.error.URLError, OSError, ValueError):
            pass
        time.sleep(0.05)
    raise AssertionError(f"The server at {url} did not become healthy in time.")


@pytest.fixture()
def live_server(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Start the real server on an ephemeral port with an isolated data folder.

    Yields ``(base_url, server_data_dir)``. The client's own data folder is
    redirected to a sibling temp directory, so neither side touches the
    developer's real ``data/``.
    """
    server_data = tmp_path / "server-data"
    server_data.mkdir()
    apps_root = server_data / "apps"
    apps_root.mkdir()
    _write_fixture_app(apps_root)

    launcher = tmp_path / "run_server.py"
    launcher.write_text(LAUNCHER, encoding="utf-8")

    env = dict(os.environ)
    env["PAS_DATA_DIR"] = str(server_data)
    # The server's own package must win over the client's ``backend`` when the
    # subprocess imports it, which the launcher's ``sys.path.insert`` handles.
    env.pop("PYTHONPATH", None)

    process = subprocess.Popen(
        [sys.executable, str(launcher), str(Path(SERVER_DIR).resolve())],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    try:
        assert process.stdout is not None
        port_line = process.stdout.readline().strip()
        if not port_line.isdigit():
            stderr = process.stderr.read() if process.stderr else ""
            raise AssertionError(
                f"The server subprocess did not report a port.\n"
                f"stdout: {port_line!r}\nstderr: {stderr}"
            )
        base_url = f"http://127.0.0.1:{int(port_line)}"
        _wait_for_server(base_url)

        # Isolate the client's writable state as well.
        client_data = tmp_path / "client-data"
        client_data.mkdir()
        monkeypatch.setattr(paths, "base_dir", lambda: client_data)
        # ``base_dir`` is patched after the module was imported, so the schema
        # has to be created against the new location explicitly.
        db.init_db()
        settings.set_server_url(base_url)

        yield base_url, server_data
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:  # pragma: no cover - defensive
            process.kill()
            process.wait(timeout=5)


def _publish(base_url: str, version: str) -> int:
    """Create the fixture catalog entry and return its id."""
    entry = _request(
        f"{base_url}/api/catalog",
        method="POST",
        payload={
            "title": APP_TITLE,
            "description": "Published by the integration test.",
            "directory": APP_DIRECTORY,
            "executable": APP_EXECUTABLE,
            "version": version,
        },
    )
    assert isinstance(entry, dict)
    return int(entry["id"])


def test_client_installs_launches_and_updates_from_a_real_server(
    live_server, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The roadmap's Step 11 "done when", driven through the client's services."""
    base_url, _server_data = live_server
    entry_id = _publish(base_url, APP_VERSION)

    # --- catalog ---------------------------------------------------------
    catalog = server_client.get_catalog()
    assert [entry.id for entry in catalog] == [entry_id]
    listed = catalog[0]
    assert listed.title == APP_TITLE
    assert listed.version == APP_VERSION
    # The listing must not disclose the executable; only the manifest may.
    assert listed.executable == ""

    # --- manifest --------------------------------------------------------
    manifest = server_client.get_manifest(entry_id)
    assert manifest["executable"] == APP_EXECUTABLE
    assert manifest["version"] == APP_VERSION
    assert manifest["size_bytes"] > 0
    assert "directory" not in manifest

    # --- install ---------------------------------------------------------
    install = install_service.ensure_installed(entry_id)
    assert install.version == APP_VERSION
    assert install.executable == APP_EXECUTABLE

    app_dir = paths.apps_dir() / install.directory
    assert (app_dir / APP_EXECUTABLE).is_file()
    assert (app_dir / "data" / "level1.dat").is_file()
    assert not list(paths.tmp_dir().glob("*.zip")), "the archive was not cleaned up"

    # --- launch ----------------------------------------------------------
    launched: list[list[str]] = []

    class FakeProcess:
        pid = 4242

    def fake_popen(args, **_kwargs):
        launched.append(list(args))
        return FakeProcess()

    monkeypatch.setattr(launch_service.subprocess, "Popen", fake_popen)
    result = launch_service.launch(entry_id)
    assert result["pid"] == 4242
    assert launched == [[str((app_dir / APP_EXECUTABLE).resolve())]]

    # --- update ----------------------------------------------------------
    # Bumping the published version must make the install stale, and a plain
    # install (no ``force``) must re-download and record the new version.
    _request(
        f"{base_url}/api/catalog/{entry_id}",
        method="PUT",
        payload={
            "title": APP_TITLE,
            "description": "Published by the integration test.",
            "directory": APP_DIRECTORY,
            "executable": APP_EXECUTABLE,
            "version": APP_UPDATED_VERSION,
        },
    )

    downloads: list[int] = []
    original_download = server_client.download_archive

    def counting_download(*args, **kwargs):
        downloads.append(1)
        return original_download(*args, **kwargs)

    monkeypatch.setattr(server_client, "download_archive", counting_download)
    updated = install_service.ensure_installed(entry_id)

    assert downloads == [1], "a version bump must trigger exactly one re-download"
    assert updated.version == APP_UPDATED_VERSION
    assert state_service.get_install(entry_id).version == APP_UPDATED_VERSION

    # A second call must now be a no-op: the install is current again.
    downloads.clear()
    again = install_service.ensure_installed(entry_id)
    assert again.version == APP_UPDATED_VERSION
    assert downloads == [], "a current install must not re-download"


def test_client_reports_a_missing_entry_readably(live_server) -> None:
    """A server-side 404 must reach the user as a message, not a traceback."""
    base_url, _server_data = live_server
    _publish(base_url, APP_VERSION)

    with pytest.raises(ClientError) as caught:
        server_client.get_manifest(999_999)
    assert "not found" in caught.value.message.lower()
    assert caught.value.status == 404
