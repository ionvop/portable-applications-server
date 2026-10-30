"""Static configuration values for the Portable Applications Server."""

from __future__ import annotations

APP_NAME = "Portable Applications Server"
VERSION = "0.1.0"

# The API and the built frontend are served from the same local origin so the
# PyWebView window can call ``/api/...`` without any CORS configuration.
HOST = "127.0.0.1"
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
