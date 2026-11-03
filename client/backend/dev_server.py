"""Headless API server for frontend development.

Runs the local Flask API on ``config.UI_HOST:config.PORT`` without opening a
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
from .services import install_service, job_service


def main() -> int:
    db.init_db()
    install_service.sweep_stale_downloads()
    # Worker threads do not survive a restart, so any row still marked running
    # is a leftover from the previous process.
    job_service.reconcile_stale_jobs()
    job_service.prune_jobs()

    print(f"API listening on http://{config.UI_HOST}:{config.PORT} (Ctrl+C to stop)")
    create_app().run(
        host=config.UI_HOST,
        port=config.PORT,
        threaded=True,
        use_reloader=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
