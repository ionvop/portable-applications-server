"""Persisted client settings.

Settings live in ``data/settings.json`` beside the executable so they survive a
restart but travel with the portable folder. Writes are atomic: a crash mid-save
must never leave a truncated file that makes the client unstartable.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any

from . import paths

#: Keys the settings file may contain, with their defaults.
DEFAULTS: dict[str, Any] = {
    # Base URL of the Portable Applications Server, e.g. "http://192.168.1.10:8756".
    "server_url": "",
    # ISO timestamp of the last successful discovery, for display only.
    "discovered_at": "",
}


def load() -> dict[str, Any]:
    """Return the stored settings merged over the defaults.

    A missing or corrupt file yields the defaults rather than an error: the
    client must always be able to start and let the user fix the address.
    """
    settings = dict(DEFAULTS)
    path = paths.settings_path()
    if not path.is_file():
        return settings
    try:
        stored = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return settings
    if isinstance(stored, dict):
        for key in DEFAULTS:
            value = stored.get(key)
            if isinstance(value, str):
                settings[key] = value
    return settings


def save(settings: dict[str, Any]) -> dict[str, Any]:
    """Merge ``settings`` into the stored values and write them atomically."""
    merged = load()
    for key in DEFAULTS:
        value = settings.get(key)
        if isinstance(value, str):
            merged[key] = value
    _write(merged)
    return merged


def get_server_url() -> str:
    """The configured server base URL, or an empty string when unset."""
    return load()["server_url"].rstrip("/")


def set_server_url(url: str, discovered_at: str = "") -> dict[str, Any]:
    """Persist a new server base URL (trailing slash stripped)."""
    payload: dict[str, Any] = {"server_url": url.rstrip("/")}
    if discovered_at:
        payload["discovered_at"] = discovered_at
    return save(payload)


def _write(settings: dict[str, Any]) -> None:
    """Write via a temp file in the same directory, then replace.

    ``os.replace`` is atomic on Windows and POSIX, so a reader never observes a
    half-written file.
    """
    path = paths.settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=".settings-", suffix=".tmp"
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(settings, stream, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(temp_name, path)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


__all__ = [
    "DEFAULTS",
    "get_server_url",
    "load",
    "save",
    "set_server_url",
]
