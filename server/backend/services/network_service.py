"""Local network discovery helpers.

Two directions of discovery live here:

* :func:`get_lan_ip` / :func:`get_client_url` tell the *administrator* which
  address clients should open.
* :class:`DiscoveryResponder` answers the *client application's* UDP broadcast
  so it can find this server without manual configuration.
"""

from __future__ import annotations

import json
import socket
import threading
from datetime import datetime, timezone
from typing import Any

from .. import config, paths

# Captured once when the module is first imported, i.e. when the server starts.
_STARTED_AT = datetime.now(timezone.utc)


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


def get_client_url(lan_ip: str | None = None) -> str:
    """URL a client computer on the LAN should open to browse the catalog."""
    return f"http://{lan_ip or get_lan_ip()}:{config.PORT}/client"


def get_system_info(entry_count: int = 0) -> dict[str, Any]:
    """Snapshot of server state for display in the desktop interface."""
    lan_ip = get_lan_ip()
    return {
        "app_name": config.APP_NAME,
        "version": config.VERSION,
        "bind_host": config.BIND_HOST,
        "ui_host": config.UI_HOST,
        "port": config.PORT,
        "lan_ip": lan_ip,
        "client_url": get_client_url(lan_ip),
        "discovery_port": config.DISCOVERY_PORT,
        "data_dir": str(paths.data_dir()),
        "apps_dir": str(paths.apps_dir()),
        "entry_count": entry_count,
        "started_at": _STARTED_AT.isoformat(),
    }


def get_discovery_reply() -> dict[str, Any]:
    """The JSON body sent back to a discovering client.

    ``port`` must be a JSON integer: the client validates it with
    ``isinstance(port, int)`` and silently falls back to 8756 for a string or
    float, so it is passed through unformatted.
    """
    return {
        "app": config.APP_NAME,
        "version": config.VERSION,
        "port": config.PORT,
    }


class DiscoveryResponder:
    """Answer client discovery broadcasts on :data:`config.DISCOVERY_PORT`.

    Runs on a daemon thread with a short socket timeout so :meth:`stop` takes
    effect promptly instead of waiting on a blocking ``recvfrom``. Every
    failure path (no interface, port in use, firewall) is reported through
    :attr:`error` and leaves the HTTP server untouched: discovery is a
    convenience, not a requirement.
    """

    def __init__(self, port: int | None = None) -> None:
        self.port = config.DISCOVERY_PORT if port is None else port
        self.error: str | None = None
        self._socket: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._running = threading.Event()

    @property
    def running(self) -> bool:
        return self._running.is_set()

    def start(self, timeout: float = 5.0) -> bool:
        """Bind the port and start listening. Returns ``False`` on failure.

        ``timeout`` only bounds how long the caller waits for the socket to
        bind; the listening thread itself runs until :meth:`stop`.
        """
        if self._thread is not None:
            return self.running

        try:
            listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            # SO_REUSEADDR is set before bind so the socket also receives
            # datagrams addressed to the broadcast address on Windows.
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.settimeout(0.5)
            listener.bind(("", self.port))
        except OSError as error:
            self.error = f"Discovery responder could not bind UDP {self.port}: {error}"
            return False

        self._socket = listener
        self._running.set()
        self._thread = threading.Thread(
            target=self._serve,
            args=(listener,),
            name="discovery-responder",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self, timeout: float = 2.0) -> None:
        """Ask the thread to finish and release the socket."""
        self._running.clear()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=timeout)
        self._thread = None
        listener = self._socket
        self._socket = None
        if listener is not None:
            try:
                listener.close()
            except OSError:
                pass

    def _serve(self, listener: socket.socket) -> None:
        """Receive probes until :meth:`stop` clears the running flag."""
        payload = json.dumps(get_discovery_reply()).encode("utf-8")
        while self._running.is_set():
            try:
                data, address = listener.recvfrom(config.DISCOVERY_REPLY_MAX_BYTES)
            except socket.timeout:
                continue
            except OSError:
                # Socket closed by ``stop`` or the interface went away.
                break
            if data.strip() != config.DISCOVERY_MAGIC:
                continue
            try:
                listener.sendto(payload, address)
            except OSError:
                continue
        self._running.clear()
