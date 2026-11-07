"""CHU2PLAY — Python desktop backend.

The package hosts the PyWebView desktop shell, the local Flask API that serves
the built React frontend, and the services that talk to the Portable
Applications Server on the local network.

Every path is resolved relative to the executable (frozen) or the project root
(development), so the whole folder can be relocated without reconfiguration.
"""

from .config import APP_NAME, VERSION

__all__ = ["APP_NAME", "VERSION"]
