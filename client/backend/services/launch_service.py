"""Launching installed applications and games.

The executable path comes from the server manifest and is always *relative* to
the application's own directory. It is resolved inside ``data/apps/<slug>`` and
rejected if it escapes, so a compromised or mistaken catalog entry cannot make
the client run an arbitrary program elsewhere on the machine.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

from .. import paths
from ..errors import ClientError
from ..models import Install
from . import state_service


def launch(entry_id: int) -> dict[str, Any]:
    """Start the installed application and return its PID and path.

    The process is detached: the client must stay responsive while the game
    runs, and closing the client window must not kill the game.
    """
    install = state_service.get_install(entry_id)
    if install is None:
        raise ClientError(
            "This application is not installed yet. Install it first.", status=404
        )

    executable = resolve_executable(install)
    if not executable.is_file():
        raise ClientError(
            f"The executable is missing: {install.executable}. "
            "Reinstall the application to repair it.",
            status=404,
        )

    try:
        process = subprocess.Popen(  # noqa: S603 - path is validated above
            [str(executable)],
            cwd=str(executable.parent),
            close_fds=True,
            **_detach_options(),
        )
    except OSError as error:
        raise ClientError(
            f"The application could not be started: {error}", status=500
        ) from error

    return {
        "entry_id": entry_id,
        "pid": process.pid,
        "executable": str(executable),
    }


def resolve_executable(install: Install) -> Path:
    """Resolve the manifest's relative executable inside the install directory.

    Raises :class:`ClientError` for absolute paths, traversal, or a directory
    that no longer exists.
    """
    app_dir = paths.apps_dir() / install.directory
    if not _is_inside(app_dir, paths.apps_dir()):
        raise ClientError(
            "The install record points outside the applications folder.", status=500
        )
    if not app_dir.is_dir():
        raise ClientError(
            "The application folder is missing. Reinstall the application.",
            status=404,
        )

    relative = install.executable.strip()
    if not relative:
        raise ClientError(
            "The server did not provide an executable path for this application.",
            status=502,
        )

    candidate = Path(relative)
    if candidate.is_absolute() or candidate.drive:
        raise ClientError(
            "The executable path must be relative to the application folder.",
            status=502,
        )

    resolved = (app_dir / candidate).resolve()
    if not _is_inside(resolved, app_dir.resolve()):
        raise ClientError(
            "The executable path escapes the application folder.", status=502
        )
    return resolved


def _detach_options() -> dict[str, Any]:
    """Platform flags that let the child outlive the client process."""
    if sys.platform == "win32":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        return {"creationflags": 0x00000008 | 0x00000200}
    return {"start_new_session": True}


def _is_inside(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True
