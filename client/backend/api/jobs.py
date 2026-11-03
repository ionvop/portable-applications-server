"""Install job endpoints.

``POST /api/apps/<id>/install`` starts a job and returns it; these two routes
let the UI follow it. Polling is deliberate: the client is a single-window
desktop app, and a one-second poll is simpler and more robust than a streaming
endpoint that has to survive a window reload.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..errors import ClientError
from ..services import job_service

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


@bp.get("")
def list_jobs():
    """Active jobs first, then finished history, newest first."""
    return jsonify(job_service.list_jobs(limit=_limit()))


@bp.get("/<int:job_id>")
def get_job(job_id: int):
    """One job, live or historical."""
    job = job_service.get_job(job_id)
    if job is None:
        raise ClientError("That install job does not exist.", status=404)
    return jsonify(job)


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status


def _limit(default: int = 100, maximum: int = 500) -> int:
    """Parse the ``limit`` query parameter, clamped to a sane range."""
    raw = request.args.get("limit", "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ClientError("The 'limit' parameter must be a whole number.") from None
    return max(1, min(value, maximum))
