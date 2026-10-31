"""Health, system information and storage endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify

from ..services import catalog_service, network_service, storage_service

bp = Blueprint("system", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/system/info")
def system_info():
    entry_count = len(catalog_service.list_entries())
    return jsonify(network_service.get_system_info(entry_count))


@bp.get("/system/storage")
def system_storage():
    """Sizes of the managed folders and free space on the data volume."""
    return jsonify(storage_service.get_storage())
