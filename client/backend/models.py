"""Domain models for the client."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


@dataclass(slots=True)
class CatalogEntry:
    """A catalog entry as published by the server.

    ``executable`` and ``version`` come from the per-entry manifest endpoint,
    not from the catalog listing, which only exposes public display fields.
    """

    id: int
    title: str
    description: str = ""
    thumbnail: str = ""
    executable: str = ""
    version: str = ""

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "CatalogEntry":
        return cls(
            id=int(payload["id"]),
            title=str(payload.get("title") or ""),
            description=str(payload.get("description") or ""),
            thumbnail=str(payload.get("thumbnail") or ""),
            executable=str(payload.get("executable") or ""),
            version=str(payload.get("version") or ""),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Job:
    """One install attempt, live or historical.

    The wire shape is deliberately flat so the UI can render a progress bar
    without knowing whether the job is still running: ``received_bytes`` and
    ``total_bytes`` are meaningful in every state, and ``error`` is empty
    unless ``status`` is ``failed``.

    ``total_bytes`` is the archive size when the server sent a
    ``Content-Length``, otherwise the manifest's uncompressed ``size_bytes``.
    The two can disagree, so the UI clamps the ratio at 100%.
    """

    id: int
    entry_id: int
    title: str
    status: str
    received_bytes: int = 0
    total_bytes: int = 0
    error: str = ""
    started_at: str | None = None
    finished_at: str | None = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Job":
        return cls(
            id=row["id"],
            entry_id=row["entry_id"],
            title=row["title"],
            status=row["status"],
            received_bytes=row["bytes_processed"],
            total_bytes=row["size_bytes"],
            error=row["error"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Install:
    """A locally installed application or game."""

    entry_id: int
    title: str
    directory: str
    executable: str
    version: str
    installed_at: str | None = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Install":
        return cls(
            entry_id=row["entry_id"],
            title=row["title"],
            directory=row["directory"],
            executable=row["executable"],
            version=row["version"],
            installed_at=row["installed_at"],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
