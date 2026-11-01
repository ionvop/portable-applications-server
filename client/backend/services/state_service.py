"""Local install state.

Records which catalog entries are installed, at which version, and where. The
install service consults this to decide whether a download is needed, so the
client never re-downloads a game that is already on disk and current.
"""

from __future__ import annotations

from typing import Any

from .. import db
from ..models import Install


def list_installs() -> list[Install]:
    with db.get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM installs ORDER BY title COLLATE NOCASE"
        ).fetchall()
    return [Install.from_row(row) for row in rows]


def get_install(entry_id: int) -> Install | None:
    with db.get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM installs WHERE entry_id = ?", (entry_id,)
        ).fetchone()
    return Install.from_row(row) if row is not None else None


def record_install(
    entry_id: int,
    title: str,
    directory: str,
    executable: str,
    version: str,
) -> Install:
    """Insert or replace the install row for ``entry_id``."""
    with db.get_connection() as connection:
        connection.execute(
            """
            INSERT INTO installs (entry_id, title, directory, executable, version)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (entry_id) DO UPDATE SET
                title = excluded.title,
                directory = excluded.directory,
                executable = excluded.executable,
                version = excluded.version,
                installed_at = datetime('now')
            """,
            (entry_id, title, directory, executable, version),
        )
    install = get_install(entry_id)
    assert install is not None  # just written
    return install


def remove_install(entry_id: int) -> bool:
    """Delete the install row. Returns ``True`` when a row existed."""
    with db.get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM installs WHERE entry_id = ?", (entry_id,)
        )
        return cursor.rowcount > 0


def install_map() -> dict[int, dict[str, Any]]:
    """``{entry_id: install_dict}`` for annotating a catalog listing."""
    return {install.entry_id: install.to_dict() for install in list_installs()}
