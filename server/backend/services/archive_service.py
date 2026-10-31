"""Streaming ZIP archive creation.

Archives are built *while* they are sent. Nothing is written to disk, so the
first byte leaves the server immediately instead of after a multi-gigabyte
compression pass, and memory stays bounded by ``config.ZIP_CHUNK_SIZE`` no
matter how large the application is.

``zipfile`` supports non-seekable sinks: when ``seek`` raises ``OSError`` it
switches to data descriptors and writes the central directory at the end. That
is exactly the behaviour a chunked HTTP response needs, so ``_StreamBuffer``
below is all the plumbing required.
"""

from __future__ import annotations

import io
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from .. import config, paths
from ..models import CatalogEntry
from .catalog_service import CatalogError, resolve_directory


@dataclass(slots=True)
class ArchivePlan:
    """The files that will be streamed, resolved before the first byte.

    Walking the tree up front means the total size is known when the transfer
    row is created, so the UI can show a real percentage from the start.
    """

    source: Path
    files: list[tuple[Path, str]] = field(default_factory=list)
    total_bytes: int = 0


class _StreamBuffer:
    """A write-only sink that hands buffered bytes to the response generator.

    ``zipfile`` only needs ``write``, ``tell`` and ``flush``; ``seek`` must
    raise ``OSError`` so the archive is written with data descriptors instead
    of seeking back to patch local headers.
    """

    __slots__ = ("_chunks", "_offset")

    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self._offset = 0

    def write(self, data: bytes) -> int:
        if data:
            self._chunks.append(bytes(data))
            self._offset += len(data)
        return len(data)

    def tell(self) -> int:
        return self._offset

    def seek(self, *_args: object) -> int:
        raise io.UnsupportedOperation("the archive stream is not seekable")

    def flush(self) -> None:
        """No-op: the generator drains the buffer itself."""

    def drain(self) -> bytes:
        """Return everything buffered since the last drain and clear it."""
        if not self._chunks:
            return b""
        data = b"".join(self._chunks)
        self._chunks.clear()
        return data


def plan_archive(entry: CatalogEntry) -> ArchivePlan:
    """Resolve the entry's directory into a sorted file list and total size."""
    source = resolve_directory(entry)
    if not source.is_dir():
        raise CatalogError(
            f"The directory for '{entry.title}' does not exist: {entry.directory}",
            status=404,
        )

    plan = ArchivePlan(source=source)
    for file_path in sorted(source.rglob("*")):
        if not file_path.is_file():
            continue
        try:
            size = file_path.stat().st_size
        except OSError:
            # A file vanished or is unreadable between the walk and the stat;
            # skip it rather than failing the whole download.
            continue
        plan.files.append((file_path, str(file_path.relative_to(source))))
        plan.total_bytes += size
    return plan


def iter_archive(plan: ArchivePlan) -> Iterator[tuple[bytes, int]]:
    """Yield ``(chunk, bytes_consumed)`` pairs for the planned archive.

    ``bytes_consumed`` is the cumulative number of *uncompressed* source bytes
    read so far, which is what the progress bar compares against
    ``plan.total_bytes``. The buffer is drained after every source chunk, so a
    single 4 GB file never accumulates in memory.
    """
    buffer = _StreamBuffer()
    consumed = 0

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path, arcname in plan.files:
            try:
                info = zipfile.ZipInfo.from_file(
                    file_path, arcname, strict_timestamps=False
                )
            except OSError:
                continue
            info.compress_type = zipfile.ZIP_DEFLATED

            try:
                source = file_path.open("rb")
            except OSError:
                continue

            with source, archive.open(info, "w") as target:
                while chunk := source.read(config.ZIP_CHUNK_SIZE):
                    target.write(chunk)
                    consumed += len(chunk)
                    data = buffer.drain()
                    if data:
                        yield data, consumed

            data = buffer.drain()
            if data:
                yield data, consumed

    # The central directory is written when the ``with`` block exits.
    data = buffer.drain()
    if data:
        yield data, consumed


def sweep_stale_archives() -> int:
    """Delete leftover archives older than the configured age. Returns count.

    Downloads no longer create temporary archives, but older versions did and a
    crash can still strand one, so the sweep is kept as a safety net.
    """
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
