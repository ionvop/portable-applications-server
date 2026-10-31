"""ZIP distribution endpoint used by client computers."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

from flask import Blueprint, Response, jsonify, request, stream_with_context

from .. import config
from ..services import archive_service, catalog_service, transfer_service
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

    # Record the transfer before the first byte leaves the server so the admin
    # UI can show it as active while the client is still downloading.
    transfer_id = transfer_service.start_transfer(
        entry_id=entry.id or entry_id,
        client_ip=request.remote_addr or "",
        size_bytes=archive_path.stat().st_size,
    )

    response = Response(
        stream_with_context(_stream_archive(archive_path, transfer_id)),
        mimetype="application/zip",
        direct_passthrough=True,
    )
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{archive_service.slugify(entry.title)}.zip"'
    )
    response.headers["Content-Length"] = str(archive_path.stat().st_size)
    return response


def _stream_archive(archive_path: Path, transfer_id: int) -> Iterator[bytes]:
    """Yield the archive in chunks, recording the outcome when the stream ends.

    ``send_file`` returns a direct-passthrough body whose ``close`` is never
    called by the WSGI server, so ``call_on_close`` cannot be used to detect
    completion. Driving the file ourselves gives a reliable success/failure
    signal and lets the temporary archive be deleted at the right moment.
    """
    completed = False
    try:
        with archive_path.open("rb") as handle:
            while chunk := handle.read(config.ZIP_CHUNK_SIZE):
                yield chunk
        completed = True
    finally:
        status = (
            transfer_service.COMPLETED if completed else transfer_service.FAILED
        )
        transfer_service.finish_transfer(transfer_id, status)
        archive_service.cleanup_archive(archive_path)
