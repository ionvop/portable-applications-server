"""Startup auto-connect: verify the stored server, else rediscover it.

The client persists the server address in ``data/settings.json``, but that
address goes stale whenever the server moves to a new DHCP lease or the client
is copied to a different machine. Rather than making the user open Settings and
press *Discover on LAN*, the UI calls this service once at startup.

The order is deliberate:

1. A stored address that still answers ``/api/health`` is kept as-is. No
   broadcast is sent, so a healthy client starts instantly and never disturbs
   the network.
2. Otherwise a discovery probe is broadcast. A reply is only persisted after it
   passes the same health check, so a half-started or hostile responder cannot
   overwrite a working address.
3. When nothing answers, the stored value is left untouched and the caller is
   told the server is not connected. That is a normal state, not an error: the
   UI still offers manual configuration.

This module exists separately from :mod:`server_client` because that module
already imports :mod:`discovery_service`; putting the orchestration there would
create an import cycle.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .. import config, settings
from ..errors import ClientError
from . import discovery_service, server_client


def auto_connect(force_discovery: bool = False) -> dict[str, Any]:
    """Resolve a usable server URL, rediscovering it when the stored one fails.

    Returns ``{"server_url", "changed", "connected", "discovered"}``:

    - ``server_url`` — the address the client should use now (the stored one
      when nothing better was found, possibly empty).
    - ``changed`` — whether the persisted address was replaced.
    - ``connected`` — whether a server answered a health check.
    - ``discovered`` — whether a discovery reply was received at all, even if
      it then failed the health check.

    ``force_discovery`` skips the stored-address probe. The UI uses it after a
    catalog request fails, when the stored address is known to be dead and
    probing it again would only add latency.
    """
    stored = settings.get_server_url()

    if stored and not force_discovery and _healthy(stored):
        return {
            "server_url": stored,
            "changed": False,
            "connected": True,
            "discovered": False,
        }

    reply = discovery_service.discover()
    if reply is None:
        return {
            "server_url": stored,
            "changed": False,
            "connected": False,
            "discovered": False,
        }

    discovered_url = reply["server_url"]
    if not _healthy(discovered_url):
        # A responder that cannot serve health is not a usable server. Keep the
        # stored address so the user's manual choice is never silently lost.
        return {
            "server_url": stored,
            "changed": False,
            "connected": False,
            "discovered": True,
        }

    settings.set_server_url(
        discovered_url,
        discovered_at=datetime.now(timezone.utc).isoformat(),
    )
    return {
        "server_url": discovered_url,
        "changed": discovered_url != stored,
        "connected": True,
        "discovered": True,
    }


def _healthy(server_url: str) -> bool:
    """Health-check ``server_url`` with the short startup timeout."""
    try:
        server_client.check_health(
            server_url, timeout=config.AUTO_CONNECT_TIMEOUT_SECONDS
        )
    except ClientError:
        return False
    return True
