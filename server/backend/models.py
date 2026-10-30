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
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
