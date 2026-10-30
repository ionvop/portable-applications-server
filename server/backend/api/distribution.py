"""ZIP distribution endpoint used by client computers."""

from __future__ import annotations

from flask import Blueprint, jsonify, send_file

from ..services import archive_service, catalog_service
from ..services.catalog_service import CatalogError

bp = Blueprint("distribution", __name__, url_prefix="/api/distribution")


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("/<int:entry_id>/download")
def download(entry_id: int):
    """Package the requested application and stream it to the client."""
    entry = catalog_service.get_entry(entry_id)
    archive_path = archive_service.build_archive(entry)

    response = send_file(
        archive_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{archive_service.slugify(entry.title)}.zip",
    )
    # ``call_on_close`` fires once the response has been fully streamed, which
    # is the only safe moment to delete the file on Windows.
    response.call_on_close(lambda: archive_service.cleanup_archive(archive_path))
    return response
