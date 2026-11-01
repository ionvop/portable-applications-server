"""Domain models for catalog entries."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


@dataclass(slots=True)
class CatalogEntry:
    """A single application or game registered in the catalog."""

    id: int | None
    title: str
    description: str
    thumbnail: str
    directory: str
    executable: str
    version: str = "1.0.0"
    created_at: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "CatalogEntry":
        return cls(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            thumbnail=row["thumbnail"],
            directory=row["directory"],
            executable=row["executable"],
            version=row["version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Transfer:
    """A single ZIP download served to a client computer."""

    id: int | None
    entry_id: int | None
    client_ip: str
    size_bytes: int
    status: str
    bytes_processed: int = 0
    started_at: str | None = None
    finished_at: str | None = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Transfer":
        return cls(
            id=row["id"],
            entry_id=row["entry_id"],
            client_ip=row["client_ip"],
            size_bytes=row["size_bytes"],
            status=row["status"],
            bytes_processed=row["bytes_processed"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
