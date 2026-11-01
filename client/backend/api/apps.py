"""Install, launch and remove endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..errors import ClientError
from ..services import install_service, launch_service, state_service

bp = Blueprint("apps", __name__, url_prefix="/api/apps")


@bp.get("/installed")
def list_installed():
    """Every application currently installed on this machine."""
    return jsonify([install.to_dict() for install in state_service.list_installs()])


@bp.post("/<int:entry_id>/install")
def install(entry_id: int):
    """Download and extract the entry, skipping the download when current.

    ``{"force": true}`` re-downloads even when the recorded version matches.
    """
    body = request.get_json(silent=True) or {}
    force = bool(body.get("force")) if isinstance(body, dict) else False
    install_row = install_service.ensure_installed(entry_id, force=force)
    return jsonify(install_row.to_dict()), 201


@bp.post("/<int:entry_id>/launch")
def launch(entry_id: int):
    """Start the installed application."""
    return jsonify(launch_service.launch(entry_id))


@bp.delete("/<int:entry_id>")
def remove(entry_id: int):
    """Delete the install row and its directory."""
    if not install_service.remove_installed(entry_id):
        raise ClientError("This application is not installed.", status=404)
    return jsonify({"removed": entry_id})


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status
