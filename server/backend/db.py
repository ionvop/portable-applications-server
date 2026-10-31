"""SQLite access helpers and schema management."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from . import paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS catalog (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    thumbnail   TEXT    NOT NULL DEFAULT '',
    directory   TEXT    NOT NULL,
    executable  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_title ON catalog (title);

CREATE TABLE IF NOT EXISTS transfers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id    INTEGER REFERENCES catalog (id) ON DELETE SET NULL,
    client_ip   TEXT    NOT NULL DEFAULT '',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'active',
    started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
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
