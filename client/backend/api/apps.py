"""Install, launch and remove endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..errors import ClientError
from ..services import install_service, job_service, launch_service, state_service

bp = Blueprint("apps", __name__, url_prefix="/api/apps")


@bp.get("/installed")
def list_installed():
    """Every application currently installed on this machine."""
    return jsonify([install.to_dict() for install in state_service.list_installs()])


@bp.post("/<int:entry_id>/install")
def install(entry_id: int):
    """Start a background install and return the job immediately.

    ``{"force": true}`` re-downloads even when the recorded version matches.
    A second request for an entry that is already installing returns the
    running job instead of starting a competing download into the same folder.
    """
    body = request.get_json(silent=True) or {}
    force = bool(body.get("force")) if isinstance(body, dict) else False
    job = job_service.start_install(entry_id, force=force)
    return jsonify(job), 202


@bp.post("/<int:entry_id>/launch")
def launch(entry_id: int):
    """Start the installed application."""
    return jsonify(launch_service.launch(entry_id))


@bp.delete("")
def reset():
    """Delete every install, cached cover and partial download.

    Backs the Settings screen's "Reset local storage" action. Refuses with
    ``409`` while an install is running, because the worker is writing into the
    directories this would delete.
    """
    return jsonify({"removed": install_service.reset_local_storage()})


@bp.delete("/<int:entry_id>")
def remove(entry_id: int):
    """Delete the install row and its directory."""
    if not install_service.remove_installed(entry_id):
        raise ClientError("This application is not installed.", status=404)
    return jsonify({"removed": entry_id})


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status
