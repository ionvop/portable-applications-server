"""Static configuration values for the Portable Applications Client."""

from __future__ import annotations

APP_NAME = "Portable Applications Client"
VERSION = "0.1.0"

# The local Flask app only ever serves this machine, so it binds to loopback.
# Nothing about the client is exposed to the LAN.
UI_HOST = "127.0.0.1"

# Deliberately different from the server's 8756 so both applications can run
# on the same machine during development without a port clash.
PORT = 8757

# Default port of the Portable Applications Server on the LAN. Discovery may
# report a different one; this is only the fallback used when probing.
SERVER_PORT = 8756

# UDP port used for LAN auto-discovery. The server is expected to listen here
# and answer the probe payload below (see ``services/discovery_service.py``).
DISCOVERY_PORT = 8758
DISCOVERY_MAGIC = b"PORTABLE_APPS_DISCOVER_V1"
DISCOVERY_TIMEOUT_SECONDS = 2.0

# Timeout for ordinary JSON requests to the server.
HTTP_TIMEOUT_SECONDS = 10.0

# Timeout for the archive download. Generous: a multi-gigabyte game over a
# 100 Mbit LAN can legitimately take many minutes.
DOWNLOAD_TIMEOUT_SECONDS = 60 * 60

# Names of the directories created inside the portable data folder.
DATA_DIR_NAME = "data"
APPS_DIR_NAME = "apps"
TMP_DIR_NAME = "tmp"
DB_FILE_NAME = "client.db"
SETTINGS_FILE_NAME = "settings.json"

# Location of the built frontend, relative to the resource root.
WEB_DIR_NAME = "dist"

# Streaming chunk size used while downloading and extracting archives. Bounds
# memory to one chunk regardless of the archive size.
ZIP_CHUNK_SIZE = 1024 * 1024

# Partial downloads older than this are removed on startup.
TEMP_MAX_AGE_SECONDS = 60 * 60
