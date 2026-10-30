"""ZIP archive creation and temporary file management."""

from __future__ import annotations

import time
import uuid
import zipfile
from pathlib import Path

from .. import config, paths
from ..models import CatalogEntry
from .catalog_service import CatalogError, resolve_directory


def build_archive(entry: CatalogEntry) -> Path:
    """Package the entry's directory into a ZIP inside the temp folder."""
    source = resolve_directory(entry)
    if not source.is_dir():
        raise CatalogError(
            f"The directory for '{entry.title}' does not exist: {entry.directory}",
            status=404,
        )

    destination = paths.tmp_dir() / f"{slugify(entry.title)}-{uuid.uuid4().hex}.zip"
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(source.rglob("*")):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(source))
    return destination


def cleanup_archive(path: Path) -> None:
    """Remove a temporary archive, ignoring races and missing files."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # On Windows the file may still be held open by the response stream;
        # the startup sweep will collect it on the next run.
        pass


def sweep_stale_archives() -> int:
    """Delete leftover archives older than the configured age. Returns count."""
    cutoff = time.time() - config.TEMP_MAX_AGE_SECONDS
    removed = 0
    for candidate in paths.tmp_dir().glob("*.zip"):
        try:
            if candidate.stat().st_mtime < cutoff:
                candidate.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def slugify(value: str) -> str:
    """Turn a title into a filesystem- and URL-safe slug."""
    cleaned = "".join(
        character if character.isalnum() else "-" for character in value.lower()
    )
    return "-".join(part for part in cleaned.split("-") if part) or "application"
