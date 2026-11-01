"""Headless API server for frontend development.

Runs the Flask API on ``config.BIND_HOST:config.PORT`` without opening a
PyWebView window and without requiring a built frontend. Vite serves the UI on
port 5173 and proxies ``/api`` here (see ``vite.config.ts``).

Usage::

    python backend/dev_server.py      # or: npm run dev:api
"""

from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ""):
    # Allow ``python backend/dev_server.py`` by making the project root importable.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "backend"

from . import config, db
from .app import create_app
from .services import archive_service, network_service, transfer_service


def main() -> int:
    db.init_db()
    archive_service.sweep_stale_archives()
    transfer_service.reconcile_stale_transfers()
    transfer_service.prune_transfers()

    # Keep the API and the discovery responder in step: a client that finds this
    # machine during development behaves exactly as it will in production.
    discovery = network_service.DiscoveryResponder()
    if not discovery.start():
        print(discovery.error, file=sys.stderr)

    lan_ip = network_service.get_lan_ip()
    print(f"API listening on http://{config.UI_HOST}:{config.PORT} (Ctrl+C to stop)")
    print(f"Client catalog: http://{lan_ip}:{config.PORT}/client")
    print(f"LAN discovery: UDP {config.DISCOVERY_PORT}")
    try:
        create_app().run(
            host=config.BIND_HOST,
            port=config.PORT,
            threaded=True,
            use_reloader=False,
        )
    finally:
        discovery.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
