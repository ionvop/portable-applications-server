"""Portable Applications Server — Python desktop backend.

The package hosts the PyWebView desktop shell, the Flask API, the SQLite
catalog and the ZIP distribution service. Every path is resolved relative to
the executable (frozen) or the project root (development), so the whole
folder can be relocated without reconfiguration.
"""

from .config import APP_NAME, VERSION

__all__ = ["APP_NAME", "VERSION"]
