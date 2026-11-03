"""Settings and server-discovery endpoints."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from .. import settings
from ..errors import ClientError
from ..services import discovery_service, server_client

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
def get_settings():
    return jsonify(settings.load())


@bp.put("")
def update_settings():
    """Persist a new server URL.

    The value is validated as an ``http(s)://host[:port]`` base URL; the client
    never accepts a scheme it cannot talk to.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ClientError("Expected a JSON object.", status=400)

    url = body.get("server_url")
    if not isinstance(url, str):
        raise ClientError("'server_url' must be a string.", status=400)

    url = url.strip().rstrip("/")
    if url and not _looks_like_url(url):
        raise ClientError(
            "The server address must look like http://192.168.1.10:8756.", status=400
        )
    return jsonify(settings.set_server_url(url))


@bp.post("/test")
def test_connection():
    """Probe a server's ``/api/health`` without changing the stored address.

    The body may carry ``{"server_url": "..."}`` so the UI can verify an address
    *before* saving it. An empty or absent value falls back to the configured
    URL. This endpoint is deliberately read-only: only ``PUT`` and ``/discover``
    persist anything.
    """
    body = request.get_json(silent=True)
    url = ""
    if isinstance(body, dict):
        raw = body.get("server_url")
        if raw is not None and not isinstance(raw, str):
            raise ClientError("'server_url' must be a string.", status=400)
        url = (raw or "").strip().rstrip("/")

    if url and not _looks_like_url(url):
        raise ClientError(
            "The server address must look like http://192.168.1.10:8756.", status=400
        )
    if not url:
        url = settings.get_server_url()
    if not url:
        raise ClientError(
            "No server address is configured. Enter one or discover a server on the LAN.",
            status=400,
        )

    server_client.check_health(url)
    return jsonify({"status": "ok", "server_url": url})


@bp.post("/discover")
def discover():
    """Broadcast a discovery probe and remember the server that answers."""
    reply = discovery_service.discover_and_remember()
    if reply is None:
        raise ClientError(
            "No server answered the discovery broadcast. "
            "Check that the server is running and on the same network.",
            status=404,
        )
    return jsonify(reply)


@bp.errorhandler(ClientError)
def _handle_client_error(error: ClientError):
    return jsonify({"error": error.message}), error.status


def _looks_like_url(value: str) -> bool:
    """Minimal structural check: scheme, host, optional port."""
    if not value.startswith(("http://", "https://")):
        return False
    remainder = value.split("://", 1)[1]
    if not remainder or remainder.startswith("/"):
        return False
    host = remainder.split("/", 1)[0]
    if not host:
        return False
    if ":" in host:
        _, _, port = host.rpartition(":")
        if not port.isdigit() or not 0 < int(port) < 65536:
            return False
    return True
