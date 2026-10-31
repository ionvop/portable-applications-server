"""Disk usage reporting for the managed data folders.

The numbers are computed on demand by walking the filesystem, so they always
match what the OS reports. Nothing is cached: the folders are small enough that
a walk is instant, and a cache would drift from reality.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .. import paths


def folder_usage(root: Path) -> dict[str, int]:
    """Total bytes and file count under ``root``.

    Unreadable entries are skipped rather than raising, so a locked file in a
    running application cannot break the whole report.
    """
    total_bytes = 0
    file_count = 0

    for entry in root.rglob("*"):
        try:
            if not entry.is_file():
                continue
            total_bytes += entry.stat().st_size
            file_count += 1
        except OSError:
            continue

    return {"bytes": total_bytes, "files": file_count}


def get_storage() -> dict[str, Any]:
    """Sizes of the managed folders plus free space on the data volume."""
    apps = folder_usage(paths.apps_dir())
    thumbnails = folder_usage(paths.thumbnails_dir())
    tmp = folder_usage(paths.tmp_dir())

    usage = shutil.disk_usage(paths.data_dir())

    return {
        "apps": apps,
        "thumbnails": thumbnails,
        "tmp": tmp,
        "total_bytes": apps["bytes"] + thumbnails["bytes"] + tmp["bytes"],
        "disk": {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
        },
    }
