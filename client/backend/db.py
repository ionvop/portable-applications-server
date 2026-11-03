"""SQLite access helpers and schema management.

The client keeps a small local database of what it has installed, so it can
decide whether a download is needed without re-hashing the files on disk.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from . import paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS installs (
    entry_id     INTEGER PRIMARY KEY,
    title        TEXT    NOT NULL DEFAULT '',
    directory    TEXT    NOT NULL,
    executable   TEXT    NOT NULL DEFAULT '',
    version      TEXT    NOT NULL DEFAULT '',
    installed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per install attempt, mirroring the server's ``transfers`` table so
-- the Downloads screen has history that survives a restart. ``title`` is
-- denormalized because the client has no catalog table to join against, and
-- ``error`` carries the failure message the UI shows verbatim.
CREATE TABLE IF NOT EXISTS transfers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        INTEGER NOT NULL,
    title           TEXT    NOT NULL DEFAULT '',
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    bytes_processed INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'active',
    error           TEXT    NOT NULL DEFAULT '',
    started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers (status);
CREATE INDEX IF NOT EXISTS idx_transfers_started ON transfers (started_at);
"""


def connect() -> sqlite3.Connection:
    """Open a connection configured for row-name access."""
    connection = sqlite3.connect(paths.db_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Yield a connection that commits on success and rolls back on error."""
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Create the schema if it does not exist yet. Safe to call repeatedly."""
    with get_connection() as connection:
        connection.executescript(SCHEMA)
        _ensure_column(
            connection,
            table="installs",
            column="version",
            definition="TEXT NOT NULL DEFAULT ''",
        )


def _ensure_column(
    connection: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    """Add a column to an existing table when it is missing.

    ``CREATE TABLE IF NOT EXISTS`` never alters a table that already exists, so
    databases created by an older version need an explicit migration.
    """
    existing = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in existing:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
