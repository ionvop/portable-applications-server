"""Static configuration values for CHU2PLAY."""

from __future__ import annotations

APP_NAME = "CHU2PLAY"
VERSION = "0.1.0"

# The local Flask app only ever serves this machine, so it binds to loopback.
# Nothing about the client is exposed to the LAN.
UI_HOST = "127.0.0.1"

# Deliberately different from the server's 8756 so both applications can run
# on the same machine during development without a port clash.
PORT = 8757

# Default port of CHU2CORE on the LAN. Discovery may
# report a different one; this is only the fallback used when probing.
SERVER_PORT = 8756

# UDP port used for LAN auto-discovery. The server is expected to listen here
# and answer the probe payload below (see ``services/discovery_service.py``).
DISCOVERY_PORT = 8758
DISCOVERY_MAGIC = b"PORTABLE_APPS_DISCOVER_V1"
DISCOVERY_TIMEOUT_SECONDS = 2.0

# Timeout for ordinary JSON requests to the server.
HTTP_TIMEOUT_SECONDS = 10.0

# Timeout for the startup auto-connect health probe. Deliberately short: a
# stale address can black-hole the connection, and the user is waiting on the
# window, so a dead server must be ruled out quickly before discovery runs.
AUTO_CONNECT_TIMEOUT_SECONDS = 3.0

# Timeout for a cover image. Covers are small, so a slow reply is a failure.
THUMBNAIL_TIMEOUT_SECONDS = 15.0

# Timeout for the archive download. Generous: a multi-gigabyte game over a
# 100 Mbit LAN can legitimately take many minutes.
DOWNLOAD_TIMEOUT_SECONDS = 60 * 60

# Names of the directories created inside the portable data folder.
DATA_DIR_NAME = "data"
APPS_DIR_NAME = "apps"
TMP_DIR_NAME = "tmp"
THUMBNAILS_DIR_NAME = "thumbnails"
DB_FILE_NAME = "client.db"
SETTINGS_FILE_NAME = "settings.json"

# Startup log, written beside the executable. The packaged build is windowed,
# so this file is the only record of a failure that happens before the window
# opens. Rotated once at LOG_MAX_BYTES so a long-lived install cannot grow it
# without bound.
LOG_FILE_NAME = "client.log"
LOG_MAX_BYTES = 1024 * 1024

# Report written by ``CHU2PLAY.exe --selftest``. The build
# script reads it to prove the frozen bundle serves the frontend and can write
# its data folder.
SELFTEST_LOG_FILE_NAME = "selftest.log"

# Upper bound on a proxied cover image. Covers are small; anything larger is
# either a mistake or a hostile response, and is refused rather than cached.
MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024

# Location of the built frontend, relative to the resource root.
WEB_DIR_NAME = "dist"

# Window and executable icon, relative to the resource root. Bundled by
# ``pyinstaller.spec`` and passed to ``webview.start(icon=...)``.
RESOURCES_DIR_NAME = "resources"
ICON_FILE_NAME = "app.ico"

# Streaming chunk size used while downloading and extracting archives. Bounds
# memory to one chunk regardless of the archive size.
ZIP_CHUNK_SIZE = 1024 * 1024

# Partial downloads older than this are removed on startup.
TEMP_MAX_AGE_SECONDS = 60 * 60

# How many transfer rows to keep; older rows are pruned on startup. Mirrors the
# server's constant so both sides of the system age out history the same way.
TRANSFER_HISTORY_LIMIT = 500
