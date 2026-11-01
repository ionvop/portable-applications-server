"""Downloading, extracting and removing applications.

The flow for one entry is:

1. Ask the server for the manifest (version + executable path).
2. Compare it with the local install row; skip everything when it matches.
3. Stream the ZIP into ``data/tmp``.
4. Extract into ``data/apps/<slug>``, rejecting any member that would escape
   that directory (zip-slip).
5. Record the install so the next launch is instant.

Extraction is staged: the archive is unpacked into a sibling temp directory and
only moved into place once every member has been written, so a failed download
never leaves a half-installed game that looks launchable.
"""

from __future__ import annotations

import shutil
import time
import zipfile
from pathlib import Path
from typing import Any, Callable

from .. import config, paths
from ..errors import ClientError
from ..models import Install
from . import server_client, state_service

#: Called with ``(bytes_received, total_bytes_or_None)`` during a download.
ProgressCallback = Callable[[int, "int | None"], None]


def ensure_installed(
    entry_id: int,
    server_url: str | None = None,
    progress: ProgressCallback | None = None,
    force: bool = False,
) -> Install:
    """Make sure ``entry_id`` is installed and current; return its install row.

    ``force`` re-downloads even when the recorded version matches, which the UI
    uses for a "Repair" action.
    """
    manifest = server_client.get_manifest(entry_id, server_url)
    title = str(manifest.get("title") or f"Application {entry_id}")
    version = str(manifest.get("version") or "")
    executable = str(manifest.get("executable") or "")

    existing = state_service.get_install(entry_id)
    if not force and existing is not None and _is_current(existing, version):
        return existing

    slug = slugify(title)
    target = paths.apps_dir() / slug
    archive = paths.tmp_dir() / f"{slug}-{entry_id}.zip"

    try:
        server_client.download_archive(entry_id, archive, server_url, progress)
        _extract(archive, target)
    finally:
        _remove_quietly(archive)

    return state_service.record_install(
        entry_id=entry_id,
        title=title,
        directory=slug,
        executable=executable,
        version=version,
    )


def remove_installed(entry_id: int) -> bool:
    """Delete the install row and its directory. Returns ``True`` if removed."""
    install = state_service.get_install(entry_id)
    if install is None:
        return False

    directory = paths.apps_dir() / install.directory
    # Guard against a corrupted row pointing outside the apps folder.
    if _is_inside(directory, paths.apps_dir()):
        shutil.rmtree(directory, ignore_errors=True)
    state_service.remove_install(entry_id)
    return True


def sweep_stale_downloads() -> int:
    """Delete partial downloads older than the configured age. Returns count."""
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


def _is_current(install: Install, version: str) -> bool:
    """Whether the installed copy matches the server's manifest.

    A server that publishes no version cannot be compared, so the install is
    trusted as-is rather than re-downloading on every launch.
    """
    if not version:
        return True
    return install.version == version


def _extract(archive: Path, target: Path) -> None:
    """Extract ``archive`` into ``target``, replacing any previous contents.

    Members are validated before anything is written: an entry whose resolved
    path escapes ``target`` aborts the whole extraction.
    """
    staging = target.with_name(f"{target.name}.extracting")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                destination = _safe_member_path(staging, member.filename)
                if member.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, destination.open("wb") as sink:
                    shutil.copyfileobj(source, sink, config.ZIP_CHUNK_SIZE)
    except zipfile.BadZipFile as error:
        shutil.rmtree(staging, ignore_errors=True)
        raise ClientError(
            "The downloaded archive is corrupt. Try installing again.", status=502
        ) from error
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    # Swap the staged tree into place only after a complete extraction.
    shutil.rmtree(target, ignore_errors=True)
    staging.replace(target)


def _safe_member_path(root: Path, name: str) -> Path:
    """Resolve an archive member inside ``root`` or raise on traversal."""
    candidate = (root / name).resolve()
    if not _is_inside(candidate, root.resolve()):
        raise ClientError(
            f"The archive contains an unsafe path: {name}", status=502
        )
    return candidate


def _is_inside(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def slugify(value: str) -> str:
    """Turn a title into a filesystem-safe slug (mirrors the server's helper)."""
    cleaned = "".join(
        character if character.isalnum() else "-" for character in value.lower()
    )
    return "-".join(part for part in cleaned.split("-") if part) or "application"


def _remove_quietly(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def install_summary(entry_id: int) -> dict[str, Any] | None:
    """Install row as a dict, or ``None`` when not installed."""
    install = state_service.get_install(entry_id)
    return install.to_dict() if install is not None else None
