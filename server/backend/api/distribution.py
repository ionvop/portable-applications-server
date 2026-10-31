"""ZIP distribution endpoint used by client computers."""

from __future__ import annotations

import time
from typing import Iterator

from flask import Blueprint, Response, jsonify, request, stream_with_context

from .. import config
from ..services import archive_service, catalog_service, transfer_service
from ..services.archive_service import ArchivePlan
from ..services.catalog_service import CatalogError

bp = Blueprint("distribution", __name__, url_prefix="/api/distribution")


@bp.errorhandler(CatalogError)
def _handle_catalog_error(error: CatalogError):
    return jsonify({"error": error.message}), error.status


@bp.get("/<int:entry_id>/download")
def download(entry_id: int):
    """Stream the requested application as a ZIP, building it as it is sent.

    Only the directory walk happens before the response starts, so the first
    byte leaves within milliseconds even for a multi-gigabyte game. The
    response is chunked: the compressed size is not known in advance, so no
    ``Content-Length`` is sent.
    """
    entry = catalog_service.get_entry(entry_id)
    plan = archive_service.plan_archive(entry)

    # Record the transfer before the first byte leaves the server so the admin
    # UI can show it as active while the client is still downloading. The size
    # is the uncompressed source total, which is what progress is measured
    # against.
    transfer_id = transfer_service.start_transfer(
        entry_id=entry.id or entry_id,
        client_ip=request.remote_addr or "",
        size_bytes=plan.total_bytes,
    )

    response = Response(
        stream_with_context(_stream_archive(plan, transfer_id)),
        mimetype="application/zip",
        direct_passthrough=True,
    )
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{archive_service.slugify(entry.title)}.zip"'
    )
    return response


def _stream_archive(plan: ArchivePlan, transfer_id: int) -> Iterator[bytes]:
    """Yield the archive as it is built, recording progress and the outcome.

    ``send_file`` returns a direct-passthrough body whose ``close`` is never
    called by the WSGI server, so ``call_on_close`` cannot be used to detect
    completion. Driving the generator ourselves gives a reliable
    success/failure signal and a place to report byte progress.
    """
    completed = False
    consumed = 0
    last_update = 0.0
    try:
        for chunk, consumed in archive_service.iter_archive(plan):
            now = time.monotonic()
            if now - last_update >= config.PROGRESS_UPDATE_SECONDS:
                transfer_service.update_transfer_progress(transfer_id, consumed)
                last_update = now
            yield chunk
        completed = True
    finally:
        status = (
            transfer_service.COMPLETED if completed else transfer_service.FAILED
        )
        # Always write the final count: the last throttled update may have been
        # skipped, and a failed transfer should still report how far it got.
        transfer_service.finish_transfer(transfer_id, status, consumed)
