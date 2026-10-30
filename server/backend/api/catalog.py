"""Catalog CRUD endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..services import catalog_service
from ..services.catalog_service import CatalogError

bp = Blueprint("catalog", __name__, url_prefix="/api/catalog")


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("")
def list_entries():
    entries = catalog_service.list_entries()
    return jsonify([entry.to_dict() for entry in entries])


@bp.get("/<int:entry_id>")
def get_entry(entry_id: int):
    return jsonify(catalog_service.get_entry(entry_id).to_dict())


@bp.post("")
def create_entry():
    payload = request.get_json(silent=True) or {}
    entry = catalog_service.create_entry(payload)
    return jsonify(entry.to_dict()), 201


@bp.put("/<int:entry_id>")
def update_entry(entry_id: int):
    payload = request.get_json(silent=True) or {}
    entry = catalog_service.update_entry(entry_id, payload)
    return jsonify(entry.to_dict())


@bp.delete("/<int:entry_id>")
def delete_entry(entry_id: int):
    catalog_service.delete_entry(entry_id)
    return "", 204
