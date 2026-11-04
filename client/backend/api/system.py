"""Health and system information endpoints."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify

from .. import config, paths, settings
from ..services import state_service

bp = Blueprint("system", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/system/info")
def system_info():
    """Snapshot of client state for the desktop interface."""
    installs = state_service.list_installs()
    return jsonify(
        {
            "app_name": config.APP_NAME,
            "version": config.VERSION,
            "ui_host": config.UI_HOST,
            "port": current_app.config.get("CLIENT_PORT", config.PORT),
            "server_url": settings.get_server_url(),
            "data_dir": str(paths.data_dir()),
            "apps_dir": str(paths.apps_dir()),
            "installed_count": len(installs),
        }
    )
