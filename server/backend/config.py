"""Static configuration values for the Portable Applications Server."""

from __future__ import annotations

APP_NAME = "Portable Applications Server"
VERSION = "0.1.0"

# The WSGI server binds to every interface so client computers on the local
# network can reach the distribution endpoints.
BIND_HOST = "0.0.0.0"

# The PyWebView window (and the admin UI) always talks to the loopback address,
# so the desktop interface never depends on the machine's LAN configuration.
UI_HOST = "127.0.0.1"

PORT = 8756

# Names of the directories created inside the portable data folder.
DATA_DIR_NAME = "data"
APPS_DIR_NAME = "apps"
THUMBNAILS_DIR_NAME = "thumbnails"
TMP_DIR_NAME = "tmp"
DB_FILE_NAME = "catalog.db"

# Location of the built frontend, relative to the resource root.
WEB_DIR_NAME = "dist"

# Streaming chunk size used when transferring archives to clients.
ZIP_CHUNK_SIZE = 1024 * 1024

# Temporary archives older than this are removed on startup.
TEMP_MAX_AGE_SECONDS = 60 * 60

# Transfers still marked ``active`` after this long are treated as failed.
# ``call_on_close`` does not fire when a client disconnects mid-stream, so a
# startup reconciliation pass is the only way to clear those rows.
TRANSFER_STALE_SECONDS = 60 * 30

# How many transfer rows to keep; older rows are pruned on startup.
TRANSFER_HISTORY_LIMIT = 500
