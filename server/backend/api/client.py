"""Read-only endpoints for client computers on the local network.

These endpoints deliberately expose only the fields a client needs to render a
catalog. The managed ``directory`` and ``executable`` values stay private to the
admin interface so clients cannot learn the server's filesystem layout.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify

from ..models import CatalogEntry
from ..services import catalog_service
from ..services.catalog_service import CatalogError

bp = Blueprint("client", __name__, url_prefix="/api/client")

#: Fields a client is allowed to see for each catalog entry.
PUBLIC_FIELDS = ("id", "title", "description", "thumbnail")


def to_public_dict(entry: CatalogEntry) -> dict[str, Any]:
    """Project a catalog entry onto the client-safe field set."""
    full = entry.to_dict()
    return {field: full[field] for field in PUBLIC_FIELDS}


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("/catalog")
def list_catalog():
    """List every catalog entry using only client-safe fields."""
    return jsonify([to_public_dict(entry) for entry in catalog_service.list_entries()])


@bp.get("/catalog/<int:entry_id>")
def get_catalog_entry(entry_id: int):
    """Return a single client-safe catalog entry."""
    return jsonify(to_public_dict(catalog_service.get_entry(entry_id)))
