"""Read-only endpoints for client computers on the local network.

These endpoints deliberately expose only the fields a client needs to render a
catalog. The managed ``directory`` and ``executable`` values stay private to the
admin interface so clients cannot learn the server's filesystem layout.

The one exception is the per-entry manifest, which discloses ``executable`` to
a client that has chosen to install that specific application. It is a relative
path inside the entry's own directory, so it reveals nothing about the rest of
the machine.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify

from ..models import CatalogEntry
from ..services import archive_service, catalog_service
from ..services.catalog_service import CatalogError

bp = Blueprint("client", __name__, url_prefix="/api/client")

#: Fields a client is allowed to see in the catalog listing.
PUBLIC_FIELDS = ("id", "title", "description", "thumbnail", "version")


def to_public_dict(entry: CatalogEntry) -> dict[str, Any]:
    """Project a catalog entry onto the client-safe field set."""
    full = entry.to_dict()
    return {field: full[field] for field in PUBLIC_FIELDS}


def to_manifest_dict(entry: CatalogEntry) -> dict[str, Any]:
    """Project an entry onto the install-time manifest field set.

    ``size_bytes`` is the uncompressed size of the application directory, so a
    client can decide whether it has room before starting the download.
    """
    plan = archive_service.plan_archive(entry)
    return {
        "id": entry.id,
        "title": entry.title,
        "version": entry.version,
        "executable": entry.executable,
        "size_bytes": plan.total_bytes,
    }


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


@bp.get("/catalog/<int:entry_id>/manifest")
def get_catalog_manifest(entry_id: int):
    """Return the install manifest for one entry.

    Clients call this immediately before downloading so they learn the version
    to record and the relative executable to launch. A missing catalog entry
    and a missing application directory both answer 404 with a readable
    message, which the client surfaces to the user verbatim.
    """
    return jsonify(to_manifest_dict(catalog_service.get_entry(entry_id)))
