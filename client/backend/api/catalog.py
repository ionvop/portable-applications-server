"""Catalog endpoints.

The client proxies the server's public catalog and annotates each entry with
its local install state, so the UI can render "Install" / "Play" / "Update"
without a second round trip.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify

from ..errors import ClientError
from ..services import server_client, state_service

bp = Blueprint("catalog", __name__, url_prefix="/api/catalog")

#: Fields the catalog listing exposes. ``executable`` is deliberately absent:
#: it is only disclosed per entry by the manifest endpoint. ``version`` is the
#: server's published version, which the UI shows next to the installed one so
#: an update is legible without opening the detail view.
PUBLIC_FIELDS = ("id", "title", "description", "thumbnail", "version")


@bp.get("")
def list_catalog():
    """List the server catalog with local install state attached."""
    entries = server_client.get_catalog()
    installs = state_service.install_map()

    payload: list[dict[str, Any]] = []
    for entry in entries:
        full = entry.to_dict()
        item: dict[str, Any] = {field: full[field] for field in PUBLIC_FIELDS}
        install = installs.get(entry.id)
        item["installed"] = install is not None
        item["installed_version"] = install["version"] if install else ""
        item["update_available"] = bool(
            install and entry.version and install["version"] != entry.version
        )
        payload.append(item)
    return jsonify(payload)


@bp.get("/<int:entry_id>")
def get_catalog_entry(entry_id: int):
    """One catalog entry, including the manifest fields the UI needs."""
    manifest = server_client.get_manifest(entry_id)
    install = state_service.get_install(entry_id)
    payload = dict(manifest)
    payload["installed"] = install is not None
    payload["installed_version"] = install.version if install else ""
    return jsonify(payload)


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status
