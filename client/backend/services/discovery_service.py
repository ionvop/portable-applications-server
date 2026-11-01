"""LAN auto-discovery of the Portable Applications Server.

The client broadcasts a fixed magic payload to the subnet broadcast address on
``config.DISCOVERY_PORT`` and waits for a JSON reply::

    request   b"PORTABLE_APPS_DISCOVER_V1"
    response  {"app": "Portable Applications Server", "version": "0.1.0",
               "port": 8756}

The responder is **not implemented in the server yet** — see
``backend/README.md`` ("Server contract required"). Until it exists, discovery
fails cleanly and the caller falls back to the URL persisted in
``data/settings.json``.

Discovery is best-effort by design: a net café may have several servers, a
firewall may block broadcast, or the server may be on another subnet. Every
failure path returns ``None`` rather than raising, so the UI can always offer
manual configuration.
"""

from __future__ import annotations

import json
import socket
from datetime import datetime, timezone
from typing import Any

from .. import config, settings


def discover(timeout: float | None = None) -> dict[str, Any] | None:
    """Broadcast a probe and return the first valid reply, or ``None``.

    The returned dict is ``{"server_url", "app", "version", "host"}``.
    """
    timeout = config.DISCOVERY_TIMEOUT_SECONDS if timeout is None else timeout
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    probe.settimeout(timeout)
    try:
        probe.sendto(config.DISCOVERY_MAGIC, ("255.255.255.255", config.DISCOVERY_PORT))
        while True:
            try:
                data, address = probe.recvfrom(4096)
            except socket.timeout:
                return None
            reply = _parse_reply(data, address)
            if reply is not None:
                return reply
    except OSError:
        # No network interface, broadcast blocked, or the socket was closed.
        return None
    finally:
        probe.close()


def discover_and_remember(timeout: float | None = None) -> dict[str, Any] | None:
    """Run :func:`discover` and persist the result when one is found."""
    reply = discover(timeout)
    if reply is None:
        return None
    settings.set_server_url(
        reply["server_url"],
        discovered_at=datetime.now(timezone.utc).isoformat(),
    )
    return reply


def resolve_server_url() -> str:
    """The server URL to use: the configured one, else a fresh discovery.

    Raises :class:`~backend.errors.ClientError` when neither is available, with
    a message the UI can show directly.
    """
    from ..errors import ClientError

    configured = settings.get_server_url()
    if configured:
        return configured

    reply = discover_and_remember()
    if reply is not None:
        return reply["server_url"]

    raise ClientError(
        "No server is configured and none was found on the local network. "
        "Enter the server address in Settings.",
        status=503,
    )


def _parse_reply(data: bytes, address: tuple[str, int]) -> dict[str, Any] | None:
    """Validate a discovery reply; return ``None`` for anything unexpected."""
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None

    port = payload.get("port", config.SERVER_PORT)
    if not isinstance(port, int) or not 0 < port < 65536:
        port = config.SERVER_PORT

    host = address[0]
    return {
        "server_url": f"http://{host}:{port}",
        "app": str(payload.get("app") or ""),
        "version": str(payload.get("version") or ""),
        "host": host,
    }
