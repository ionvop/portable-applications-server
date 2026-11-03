"""Desktop entry point.

Starts the local Flask app on a background thread, waits until it accepts
connections, then opens the PyWebView window. Closing the window shuts the
server down cleanly.
"""

from __future__ import annotations

import socket
import sys
import threading
import time

if __package__ in (None, ""):
    # Allow ``python backend/main.py`` by making the project root importable.
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
    __package__ = "backend"

from werkzeug.serving import make_server

from . import config, db, paths
from .app import create_app
from .services import install_service, job_service


class ServerThread(threading.Thread):
    """Runs the WSGI server in the background so the UI thread stays free."""

    def __init__(self, host: str, port: int) -> None:
        super().__init__(daemon=True, name="flask-server")
        self._server = make_server(host, port, create_app(), threaded=True)

    def run(self) -> None:
        self._server.serve_forever()

    def shutdown(self) -> None:
        self._server.shutdown()


def _wait_for_port(host: str, port: int, timeout: float = 10.0) -> bool:
    """Poll until the server accepts connections or the timeout elapses."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.25)
            if probe.connect_ex((host, port)) == 0:
                return True
        time.sleep(0.05)
    return False


def main() -> int:
    db.init_db()
    install_service.sweep_stale_downloads()
    # Worker threads do not survive a restart, so any row still marked running
    # is a leftover from the previous process.
    job_service.reconcile_stale_jobs()
    job_service.prune_jobs()

    if not (paths.web_dir() / "index.html").is_file():
        print(
            "The frontend has not been built.\n"
            "Run 'npm run build' in the project root, then start the client again.",
            file=sys.stderr,
        )
        return 1

    server = ServerThread(config.UI_HOST, config.PORT)
    server.start()

    if not _wait_for_port(config.UI_HOST, config.PORT):
        print("The local server did not start in time.", file=sys.stderr)
        server.shutdown()
        return 1

    import webview  # imported late so the API can be tested without a GUI

    window = webview.create_window(
        config.APP_NAME,
        f"http://{config.UI_HOST}:{config.PORT}/",
        width=1280,
        height=800,
        min_size=(960, 640),
    )
    try:
        webview.start()
    finally:
        server.shutdown()
        server.join(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
