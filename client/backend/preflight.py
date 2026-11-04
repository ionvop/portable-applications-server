"""Environment checks that must pass before the desktop window opens.

PyWebView needs two things on Windows that a freshly imaged net café machine
may not have:

* the **Microsoft Edge WebView2 runtime**, which renders the React UI. Without
  it pywebview silently falls back to MSHTML (Internet Explorer 11), which
  cannot run the modern bundle at all — the window would open blank.
* the **.NET Framework 4.6.2+**, which pythonnet uses to host WinForms.

Both are checked up front so the user gets an actionable message instead of a
blank window. The module also answers "is this client already running?" and
picks a free port when the preferred one is taken.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any

from . import config

#: Registry client ids used by the Edge updater.
WEBVIEW2_CLIENT = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
EDGE_CLIENT = "{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}"

#: .NET Framework 4.6.2, the minimum pythonnet 3.x supports.
DOTNET_MIN_RELEASE = 394802

#: Short timeout: these probes run before the window opens.
PROBE_TIMEOUT_SECONDS = 1.0


def webview2_available() -> bool:
    """True when the WebView2 runtime (or Edge, which bundles it) is present."""
    return bool(_edge_build(WEBVIEW2_CLIENT) or _edge_build(EDGE_CLIENT))


def dotnet_available() -> bool:
    """True when .NET Framework 4.6.2 or newer is installed."""
    try:
        import winreg
    except ImportError:
        return True  # not Windows; nothing to check

    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full",
        ) as key:
            release, _ = winreg.QueryValueEx(key, "Release")
    except OSError:
        return False
    try:
        return int(release) >= DOTNET_MIN_RELEASE
    except (TypeError, ValueError):
        return False


def port_in_use(port: int, host: str = config.UI_HOST) -> bool:
    """True when something already accepts connections on ``host:port``."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.25)
        return probe.connect_ex((host, port)) == 0


def existing_instance(port: int = config.PORT) -> dict[str, Any] | None:
    """Return this client's ``/api/system/info`` when it already owns ``port``.

    A different program on the same port is *not* an existing instance: the
    caller should pick another port rather than refuse to start.
    """
    if not port_in_use(port):
        return None
    try:
        payload = _get_json(f"http://{config.UI_HOST}:{port}/api/system/info")
    except (OSError, ValueError):
        return None
    if isinstance(payload, dict) and payload.get("app_name") == config.APP_NAME:
        return payload
    return None


def choose_port(preferred: int = config.PORT) -> int:
    """Return ``preferred`` when free, otherwise an ephemeral free port.

    The UI is loaded from the same origin as the API, so the port number is an
    implementation detail — nothing breaks when it changes.
    """
    if not port_in_use(preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((config.UI_HOST, 0))
        return int(probe.getsockname()[1])


def _edge_build(client_id: str) -> str:
    """Read the installed version of an Edge updater client, or ``""``."""
    try:
        import winreg
    except ImportError:
        return ""

    candidates = (
        (
            winreg.HKEY_LOCAL_MACHINE,
            rf"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{client_id}",
        ),
        (
            winreg.HKEY_LOCAL_MACHINE,
            rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{client_id}",
        ),
        (
            winreg.HKEY_CURRENT_USER,
            rf"Software\Microsoft\EdgeUpdate\Clients\{client_id}",
        ),
    )
    for root, path in candidates:
        try:
            with winreg.OpenKey(root, path) as key:
                value, _ = winreg.QueryValueEx(key, "pv")
        except OSError:
            continue
        text = str(value or "").strip()
        if text and text != "0.0.0.0":
            return text
    return ""


def _get_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT_SECONDS) as reply:
            return json.loads(reply.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise OSError(f"HTTP {error.code}") from error


__all__ = [
    "choose_port",
    "dotnet_available",
    "existing_instance",
    "port_in_use",
    "webview2_available",
]
