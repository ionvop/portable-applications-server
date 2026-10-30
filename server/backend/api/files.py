"""Directory browsing and thumbnail management endpoints."""

from __future__ import annotations

import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory

from .. import paths
from ..services.catalog_service import CatalogError

bp = Blueprint("files", __name__, url_prefix="/api/files")

ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("/browse")
def browse():
    """List subdirectories and files inside the managed apps folder."""
    relative = request.args.get("path", "").strip()
    apps_root = paths.apps_dir().resolve()
    target = (apps_root / relative).resolve()

    if target != apps_root and apps_root not in target.parents:
        raise CatalogError("The path must stay inside the managed apps folder.")
    if not target.is_dir():
        raise CatalogError(f"Directory not found: {relative}", status=404)

    directories = sorted(
        (item.name for item in target.iterdir() if item.is_dir()),
        key=str.lower,
    )
    files = sorted(
        (item.name for item in target.iterdir() if item.is_file()),
        key=str.lower,
    )
    return jsonify(
        {
            "path": relative,
            "directories": directories,
            "files": files,
        }
    )


@bp.post("/thumbnail")
def upload_thumbnail():
    """Store an uploaded cover image and return its generated filename."""
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        raise CatalogError("No image file was provided.")

    suffix = Path(upload.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise CatalogError(
            "Unsupported image type. Use PNG, JPG, WEBP, GIF or SVG."
        )

    filename = f"{uuid.uuid4().hex}{suffix}"
    upload.save(paths.thumbnails_dir() / filename)
    return jsonify({"thumbnail": filename}), 201


@bp.get("/thumbnail/<path:filename>")
def serve_thumbnail(filename: str):
    return send_from_directory(paths.thumbnails_dir(), filename)
