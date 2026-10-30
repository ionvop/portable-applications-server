"""Local network discovery helpers."""

from __future__ import annotations

import socket
from typing import Any

from .. import config, paths


def get_lan_ip() -> str:
    """Best-effort LAN address of this machine.

    Opens a UDP socket toward a public address to discover the outbound
    interface; no packets are actually sent. Falls back to loopback.
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def get_system_info(entry_count: int = 0) -> dict[str, Any]:
    """Snapshot of server state for display in the desktop interface."""
    return {
        "app_name": config.APP_NAME,
        "version": config.VERSION,
        "host": config.HOST,
        "port": config.PORT,
        "lan_ip": get_lan_ip(),
        "data_dir": str(paths.data_dir()),
        "apps_dir": str(paths.apps_dir()),
        "entry_count": entry_count,
    }
