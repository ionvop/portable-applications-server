"""Desktop entry point.

Starts the Flask server on a background thread, waits until it accepts
connections, then opens the PyWebView window. Closing the window shuts the
server down cleanly, so the close is intercepted and confirmed in the UI first:
the server is what every client on the local network talks to.
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
from .desktop import CloseGuard, DesktopApi
from .services import archive_service, network_service, transfer_service


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
    archive_service.sweep_stale_archives()
    transfer_service.reconcile_stale_transfers()
    transfer_service.prune_transfers()

    if not (paths.web_dir() / "index.html").is_file():
        print(
            "The frontend has not been built.\n"
            "Run 'npm run build' in the project root, then start the server again.",
            file=sys.stderr,
        )
        return 1

    # Clients find the server through this responder; a bind failure (firewall,
    # port already taken) only disables auto-discovery, so it is not fatal.
    discovery = network_service.DiscoveryResponder()
    if not discovery.start():
        print(discovery.error, file=sys.stderr)

    server = ServerThread(config.BIND_HOST, config.PORT)
    server.start()

    if not _wait_for_port(config.UI_HOST, config.PORT):
        print("The local server did not start in time.", file=sys.stderr)
        server.shutdown()
        discovery.stop()
        return 1

    import webview  # imported late so the API can be tested without a GUI

    # Closing the window stops the server, so the close is confirmed in the UI
    # instead of happening on the first click. The guard cancels the close and
    # asks the page; the page answers through ``window.pywebview.api``.
    guard = CloseGuard()
    api = DesktopApi(guard)

    window = webview.create_window(
        config.APP_NAME,
        f"http://{config.UI_HOST}:{config.PORT}/",
        width=1280,
        height=800,
        min_size=(960, 640),
        js_api=api,
    )
    window.events.closing += guard.on_closing
    guard.start(window)
    try:
        webview.start()
    finally:
        guard.stop()
        discovery.stop()
        server.shutdown()
        server.join(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
