"""HTTP client for the Portable Applications Server.

Uses ``urllib.request`` from the standard library so the client adds no
dependency beyond Flask and PyWebView. Every failure is translated into a
:class:`~backend.errors.ClientError` carrying a message the UI can display.

Endpoints used (see ``backend/README.md`` for the full contract)::

    GET /api/client/catalog                  -> [{id, title, description, thumbnail}]
    GET /api/client/catalog/<id>/manifest    -> {id, title, version, executable, size_bytes}
    GET /api/distribution/<id>/download      -> application/zip stream
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Iterator

from .. import config
from ..errors import ClientError
from ..models import CatalogEntry
from . import discovery_service

#: Called with ``(bytes_received, total_bytes_or_None)`` during a download.
ProgressCallback = Callable[[int, "int | None"], None]

#: Hard cap on a proxied cover image, so a hostile response cannot fill the disk.
MAX_COVER_BYTES = config.MAX_THUMBNAIL_BYTES


def check_health(server_url: str | None = None) -> dict[str, Any]:
    """Probe the server's ``/api/health`` and return its payload.

    Used by ``POST /api/settings/test``: the browser cannot call the server
    directly (it sends no CORS headers), so the probe runs here instead. A
    reachable server that answers anything other than ``{"status": "ok"}`` is
    reported as an upstream failure rather than a success.
    """
    payload = _get_json("/api/health", server_url)
    if not isinstance(payload, dict) or payload.get("status") != "ok":
        raise ClientError(
            "The server answered, but not with a healthy status.", status=502
        )
    return payload


def get_catalog(server_url: str | None = None) -> list[CatalogEntry]:
    """Fetch the public catalog listing."""
    payload = _get_json("/api/client/catalog", server_url)
    if not isinstance(payload, list):
        raise ClientError("The server returned an unexpected catalog payload.", 502)
    return [CatalogEntry.from_payload(item) for item in payload if isinstance(item, dict)]


def get_manifest(entry_id: int, server_url: str | None = None) -> dict[str, Any]:
    """Fetch the per-entry manifest (version, executable, size).

    The catalog listing deliberately omits ``executable``; the client must ask
    for it per entry so the server can decide what to disclose.
    """
    payload = _get_json(f"/api/client/catalog/{entry_id}/manifest", server_url)
    if not isinstance(payload, dict):
        raise ClientError("The server returned an unexpected manifest payload.", 502)
    return payload


def fetch_thumbnail(
    name: str, server_url: str | None = None
) -> tuple[bytes, str]:
    """Fetch a cover image from the server.

    Returns ``(body, content_type)``. The server serves covers from
    ``/api/files/thumbnail/<name>`` without CORS headers, so the browser cannot
    load them directly; the client proxies and caches them instead.
    """
    base = _base_url(server_url)
    quoted = urllib.parse.quote(name, safe="")
    request = urllib.request.Request(
        f"{base}/api/files/thumbnail/{quoted}", headers={"Accept": "image/*"}
    )
    try:
        with urllib.request.urlopen(
            request, timeout=config.THUMBNAIL_TIMEOUT_SECONDS
        ) as response:
            content_type = response.headers.get("Content-Type") or ""
            content_type = content_type.split(";")[0].strip()
            if not content_type.startswith("image/"):
                raise ValueError("not an image")
            data = response.read(MAX_COVER_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise _thumbnail_http_error(exc) from exc
    except urllib.error.URLError as exc:
        raise ClientError(
            f"Could not reach the server at {base}: {exc.reason}", status=503
        ) from exc
    except ValueError as exc:
        raise ClientError(
            "The server did not return an image for that thumbnail.", status=502
        ) from exc
    except OSError as exc:
        raise ClientError(f"The thumbnail could not be read: {exc}", status=502) from exc

    if len(data) > MAX_COVER_BYTES:
        raise ClientError("The thumbnail is too large to cache.", status=502)
    if not data:
        raise ClientError("The server sent an empty thumbnail.", status=502)
    return data, content_type


def download_archive(
    entry_id: int,
    destination: Path,
    server_url: str | None = None,
    progress: ProgressCallback | None = None,
) -> Path:
    """Stream the entry's ZIP to ``destination`` and return the path.

    The file is written incrementally, so a multi-gigabyte game never sits in
    memory. ``progress`` is called after every chunk with the running byte
    count and the total when the server supplied ``Content-Length``.
    """
    base = _base_url(server_url)
    url = f"{base}/api/distribution/{entry_id}/download"
    request = urllib.request.Request(url, headers={"Accept": "application/zip"})

    destination.parent.mkdir(parents=True, exist_ok=True)
    received = 0
    try:
        with urllib.request.urlopen(
            request, timeout=config.DOWNLOAD_TIMEOUT_SECONDS
        ) as response:
            total = _content_length(response)
            with destination.open("wb") as stream:
                while chunk := response.read(config.ZIP_CHUNK_SIZE):
                    stream.write(chunk)
                    received += len(chunk)
                    if progress is not None:
                        progress(received, total)
    except urllib.error.HTTPError as error:
        _remove_quietly(destination)
        raise _http_error(error) from error
    except urllib.error.URLError as error:
        _remove_quietly(destination)
        raise ClientError(
            f"Could not reach the server at {base}: {error.reason}", status=503
        ) from error
    except OSError as error:
        _remove_quietly(destination)
        raise ClientError(f"The download could not be saved: {error}", status=500) from error

    if received == 0:
        _remove_quietly(destination)
        raise ClientError("The server sent an empty archive.", status=502)
    return destination


def iter_download(
    entry_id: int,
    server_url: str | None = None,
) -> Iterator[bytes]:
    """Yield the archive as a stream of chunks (used by the smoke test)."""
    base = _base_url(server_url)
    url = f"{base}/api/distribution/{entry_id}/download"
    request = urllib.request.Request(url, headers={"Accept": "application/zip"})
    try:
        with urllib.request.urlopen(
            request, timeout=config.DOWNLOAD_TIMEOUT_SECONDS
        ) as response:
            while chunk := response.read(config.ZIP_CHUNK_SIZE):
                yield chunk
    except urllib.error.HTTPError as error:
        raise _http_error(error) from error
    except urllib.error.URLError as error:
        raise ClientError(
            f"Could not reach the server at {base}: {error.reason}", status=503
        ) from error


def _get_json(path: str, server_url: str | None) -> Any:
    """GET ``path`` and decode the JSON body."""
    base = _base_url(server_url)
    request = urllib.request.Request(
        f"{base}{path}", headers={"Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(
            request, timeout=config.HTTP_TIMEOUT_SECONDS
        ) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        raise _http_error(error) from error
    except urllib.error.URLError as error:
        raise ClientError(
            f"Could not reach the server at {base}: {error.reason}", status=503
        ) from error

    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise ClientError("The server returned a malformed response.", status=502) from error


def _base_url(server_url: str | None) -> str:
    """Resolve the base URL, falling back to discovery/settings."""
    return (server_url or discovery_service.resolve_server_url()).rstrip("/")


def _content_length(response: Any) -> int | None:
    """Read ``Content-Length`` when present; the server streams chunked."""
    raw = response.headers.get("Content-Length")
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _http_error(error: urllib.error.HTTPError) -> ClientError:
    """Turn an HTTP error into a ClientError, preferring the server's message."""
    message = ""
    try:
        body = error.read()
        payload = json.loads(body.decode("utf-8"))
        if isinstance(payload, dict):
            message = str(payload.get("error") or "")
    except (OSError, UnicodeDecodeError, ValueError):
        message = ""

    if not message:
        message = f"The server responded with HTTP {error.code}."
    # 4xx from the server is a client-visible problem; 5xx is upstream.
    status = error.code if 400 <= error.code < 500 else 502
    return ClientError(message, status=status)


def _thumbnail_http_error(error: urllib.error.HTTPError) -> ClientError:
    """Map a thumbnail HTTP failure, keeping 404 distinct from upstream errors."""
    if error.code == 404:
        return ClientError("That thumbnail does not exist on the server.", status=404)
    return _http_error(error)


def _remove_quietly(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass
