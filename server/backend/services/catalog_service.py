"""Catalog CRUD with path validation.

All directory values are resolved against ``data/apps`` so a malicious or
mistaken API payload cannot escape the managed storage area.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .. import db, paths
from ..models import CatalogEntry


class CatalogError(Exception):
    """Raised for invalid catalog input; translated to a 4xx by the API."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def list_entries() -> list[CatalogEntry]:
    with db.get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM catalog ORDER BY title COLLATE NOCASE"
        ).fetchall()
    return [CatalogEntry.from_row(row) for row in rows]


def get_entry(entry_id: int) -> CatalogEntry:
    with db.get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM catalog WHERE id = ?", (entry_id,)
        ).fetchone()
    if row is None:
        raise CatalogError(f"Catalog entry {entry_id} not found.", status=404)
    return CatalogEntry.from_row(row)


def create_entry(payload: Mapping[str, Any]) -> CatalogEntry:
    fields = _validate(payload)
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO catalog (title, description, thumbnail, directory, executable)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                fields["title"],
                fields["description"],
                fields["thumbnail"],
                fields["directory"],
                fields["executable"],
            ),
        )
        entry_id = int(cursor.lastrowid)
    return get_entry(entry_id)


def update_entry(entry_id: int, payload: Mapping[str, Any]) -> CatalogEntry:
    get_entry(entry_id)  # raises 404 when missing
    fields = _validate(payload)
    with db.get_connection() as connection:
        connection.execute(
            """
            UPDATE catalog
               SET title = ?, description = ?, thumbnail = ?,
                   directory = ?, executable = ?, updated_at = datetime('now')
             WHERE id = ?
            """,
            (
                fields["title"],
                fields["description"],
                fields["thumbnail"],
                fields["directory"],
                fields["executable"],
                entry_id,
            ),
        )
    return get_entry(entry_id)


def delete_entry(entry_id: int) -> None:
    get_entry(entry_id)  # raises 404 when missing
    with db.get_connection() as connection:
        connection.execute("DELETE FROM catalog WHERE id = ?", (entry_id,))


def resolve_directory(entry: CatalogEntry) -> Path:
    """Return the absolute directory for an entry, validated against ``apps``."""
    return _safe_directory(entry.directory)


def _validate(payload: Mapping[str, Any]) -> dict[str, str]:
    title = str(payload.get("title", "")).strip()
    if not title:
        raise CatalogError("A title is required.")

    directory = str(payload.get("directory", "")).strip()
    if not directory:
        raise CatalogError("An application directory is required.")
    _safe_directory(directory)

    executable = str(payload.get("executable", "")).strip()
    if not executable:
        raise CatalogError("A relative executable path is required.")
    if Path(executable).is_absolute():
        raise CatalogError("The executable path must be relative to the directory.")

    return {
        "title": title,
        "description": str(payload.get("description", "")).strip(),
        "thumbnail": str(payload.get("thumbnail", "")).strip(),
        "directory": directory,
        "executable": executable,
    }


def _safe_directory(directory: str) -> Path:
    """Resolve ``directory`` inside ``data/apps`` or raise ``CatalogError``."""
    apps_root = paths.apps_dir().resolve()
    candidate = (apps_root / directory).resolve()
    if candidate != apps_root and apps_root not in candidate.parents:
        raise CatalogError("The directory must stay inside the managed apps folder.")
    return candidate
