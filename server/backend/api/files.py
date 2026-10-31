"""Directory browsing, reveal and thumbnail management endpoints."""

from __future__ import annotations

import os
import sys
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


def _resolve_inside_apps(relative: str) -> Path:
    """Resolve a browse-relative path, refusing anything outside ``data/apps``."""
    apps_root = paths.apps_dir().resolve()
    target = (apps_root / relative).resolve()
    if target != apps_root and apps_root not in target.parents:
        raise CatalogError("The path must stay inside the managed apps folder.")
    return target


@bp.get("/browse")
def browse():
    """List subdirectories and files inside the managed apps folder."""
    relative = request.args.get("path", "").strip()
    target = _resolve_inside_apps(relative)

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


@bp.post("/reveal")
def reveal():
    """Open a folder from the managed apps area in the OS file explorer.

    Only meaningful on the server machine, so the endpoint is Windows-only and
    is already restricted to loopback callers by the admin API guard.
    """
    if sys.platform != "win32":
        raise CatalogError(
            "Opening the file explorer is only supported on Windows.",
            status=501,
        )

    payload = request.get_json(silent=True) or {}
    relative = str(payload.get("path", "")).strip()
    target = _resolve_inside_apps(relative)

    if not target.is_dir():
        raise CatalogError(f"Directory not found: {relative}", status=404)

    try:
        os.startfile(str(target))  # type: ignore[attr-defined]
    except OSError as error:
        raise CatalogError(
            f"Could not open the file explorer: {error}", status=500
        )

    return jsonify({"revealed": str(target)})


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
