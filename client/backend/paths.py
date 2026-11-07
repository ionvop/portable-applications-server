"""Portable path resolution.

Every path used by the backend is derived from either:

* the PyInstaller bundle (``sys._MEIPASS``) for read-only resources, or
* the directory containing the executable / the project root for writable data.

No absolute paths are hardcoded, so the application can be moved, copied or
backed up without reconfiguration.
"""

from __future__ import annotations

import sys
from pathlib import Path

from . import config


def is_frozen() -> bool:
    """Return ``True`` when running from a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def project_root() -> Path:
    """Repository root in development: the parent of the ``backend`` package."""
    return Path(__file__).resolve().parent.parent


def base_dir() -> Path:
    """Directory the application lives in; writable data is stored beside it."""
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return project_root()


def resource_root() -> Path:
    """Directory holding bundled read-only resources (the built frontend)."""
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", base_dir()))
    return project_root()


def data_dir() -> Path:
    return _ensure(base_dir() / config.DATA_DIR_NAME)


def apps_dir() -> Path:
    """Where downloaded applications and games are extracted."""
    return _ensure(data_dir() / config.APPS_DIR_NAME)


def thumbnails_dir() -> Path:
    """Cache of cover images proxied from the server."""
    return _ensure(data_dir() / config.THUMBNAILS_DIR_NAME)


def tmp_dir() -> Path:
    """Scratch space for in-flight downloads."""
    return _ensure(data_dir() / config.TMP_DIR_NAME)


def db_path() -> Path:
    return data_dir() / config.DB_FILE_NAME


def settings_path() -> Path:
    return data_dir() / config.SETTINGS_FILE_NAME


def web_dir() -> Path:
    """Location of the built frontend (Vite ``dist``)."""
    return resource_root() / config.WEB_DIR_NAME


def icon_path() -> Path:
    """Window and executable icon bundled with the application."""
    return resource_root() / config.RESOURCES_DIR_NAME / config.ICON_FILE_NAME


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
