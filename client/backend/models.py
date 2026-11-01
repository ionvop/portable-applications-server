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
