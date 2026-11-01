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

# Streaming chunk size used when reading source files into the archive stream.
# This bounds the memory used per transfer regardless of file size.
ZIP_CHUNK_SIZE = 1024 * 1024

# How often (in seconds) a streaming transfer writes its byte progress to the
# database. Every chunk would mean thousands of writes per second; this keeps
# the admin UI responsive without hammering SQLite.
PROGRESS_UPDATE_SECONDS = 0.5

# Temporary archives older than this are removed on startup. Archives are no
# longer created by the download path (it streams), but older versions left
# files behind and a crash can still strand one.
TEMP_MAX_AGE_SECONDS = 60 * 60

# Transfers still marked ``active`` after this long are treated as failed.
# ``call_on_close`` does not fire when a client disconnects mid-stream, so a
# startup reconciliation pass is the only way to clear those rows.
TRANSFER_STALE_SECONDS = 60 * 30

# How many transfer rows to keep; older rows are pruned on startup.
TRANSFER_HISTORY_LIMIT = 500

# --- LAN discovery -----------------------------------------------------------

#: UDP port the server listens on for discovery probes. Deliberately different
#: from the HTTP ``PORT`` so the two never collide, and it is the client's
#: ``DISCOVERY_PORT``.
DISCOVERY_PORT = 8758

#: Exact payload a client broadcasts to be recognised. Anything else is
#: ignored so unrelated UDP traffic on this port is never answered.
DISCOVERY_MAGIC = b"PORTABLE_APPS_DISCOVER_V1"

#: Replies are a few dozen bytes; this bounds a single ``recvfrom``.
DISCOVERY_REPLY_MAX_BYTES = 1024
