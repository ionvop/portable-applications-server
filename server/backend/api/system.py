"""Health and system information endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify

from ..services import catalog_service, network_service

bp = Blueprint("system", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/system/info")
def system_info():
    entry_count = len(catalog_service.list_entries())
    return jsonify(network_service.get_system_info(entry_count))
