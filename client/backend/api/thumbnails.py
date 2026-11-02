"""Thumbnail proxy.

The server serves cover images from ``GET /api/files/thumbnail/<name>``, but it
sends no CORS headers, so the browser cannot load them from the UI origin. This
blueprint fetches each cover through :mod:`backend.services.server_client` and
caches it under ``data/thumbnails/``, so the UI can use a same-origin URL:

    <img src="/api/thumbnails/<filename>">

Caching is permanent: the server names uploads with a random hex prefix, so a
replaced cover always arrives under a new filename and a stale entry can never
be served for a new name.
"""

from __future__ import annotations

import mimetypes
import os
import tempfile
from pathlib import Path

from flask import Blueprint, jsonify, send_file

from .. import paths
from ..errors import ClientError
from ..services import server_client

bp = Blueprint("thumbnails", __name__, url_prefix="/api/thumbnails")

#: One year, in seconds. Safe because a filename never changes meaning.
CACHE_MAX_AGE = 60 * 60 * 24 * 365

#: Fallback type when the extension is unknown; the proxy only stores images.
DEFAULT_MIMETYPE = "application/octet-stream"


@bp.get("/<path:name>")
def get_thumbnail(name: str):
    """Serve a cover from the local cache, fetching it on first request."""
    filename = _safe_name(name)
    cached = paths.thumbnails_dir() / filename

    if not cached.is_file():
        body, content_type = server_client.fetch_thumbnail(filename)
        _store(cached, body)
        mimetype = content_type or _guess_type(filename)
    else:
        mimetype = _guess_type(filename)

    return send_file(
        cached,
        mimetype=mimetype,
        max_age=CACHE_MAX_AGE,
        conditional=True,
    )


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status


def _safe_name(name: str) -> str:
    """Reject anything that is not a bare filename.

    The catalog's ``thumbnail`` is a bare filename, so a value containing a
    separator, a drive letter or ``..`` is either a bug or an attack. Refusing
    it here keeps the cache directory from being used as a read primitive.
    """
    candidate = name.strip()
    if not candidate:
        raise ClientError("A thumbnail name is required.", status=400)
    if candidate != Path(candidate).name:
        raise ClientError("The thumbnail name must be a bare filename.", status=400)
    if candidate in {".", ".."} or ":" in candidate:
        raise ClientError("The thumbnail name must be a bare filename.", status=400)
    return candidate


def _guess_type(filename: str) -> str:
    guessed, _encoding = mimetypes.guess_type(filename)
    return guessed or DEFAULT_MIMETYPE


def _store(destination: Path, body: bytes) -> None:
    """Write the image atomically so a reader never sees a partial file."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        dir=str(destination.parent), prefix=".thumb-", suffix=".tmp"
    )
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(body)
        os.replace(temp_name, destination)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise
