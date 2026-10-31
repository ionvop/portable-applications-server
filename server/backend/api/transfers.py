"""Transfer history and activity feed endpoints for the admin interface."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..services import transfer_service
from ..services.catalog_service import CatalogError

bp = Blueprint("transfers", __name__, url_prefix="/api")


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("/transfers")
def list_transfers():
    """Return recent transfers, newest first."""
    limit = _limit(default=100, maximum=500)
    return jsonify(transfer_service.list_transfers(limit=limit))


@bp.get("/activity")
def list_activity():
    """Return a merged feed of transfer and catalog events."""
    limit = _limit(default=20, maximum=100)
    return jsonify(transfer_service.list_activity(limit=limit))


def _limit(default: int, maximum: int) -> int:
    """Parse the ``limit`` query parameter, clamped to a sane range."""
    raw = request.args.get("limit", "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise CatalogError("The 'limit' parameter must be a whole number.")
    return max(1, min(value, maximum))
