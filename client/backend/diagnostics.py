"""Startup diagnostics: logging, fatal-error dialogs and crash hooks.

The packaged build is a *windowed* executable (``console=False``), so there is
no console to print to: ``sys.stdout`` and ``sys.stderr`` are ``None`` and any
``print`` raises ``AttributeError`` instead of being ignored. Every startup
failure therefore has to be recorded in a log file and, when a user is
watching, shown in a message box.

Dialogs use ``MessageBoxW`` from ``user32`` rather than ``tkinter``, because
``tkinter`` is excluded from the bundle (see ``pyinstaller.spec``) and pulling
it in would add several megabytes for one dialog.
"""

from __future__ import annotations

import ctypes
import logging
import os
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

from . import config, paths

#: Name of the logger every module should use.
LOGGER_NAME = "client"

_configured = False


def get_logger() -> logging.Logger:
    """The application logger (configured by :func:`setup_logging`)."""
    return logging.getLogger(LOGGER_NAME)


def log_path() -> Path:
    """Where the log file lives: ``data/client.log`` beside the executable."""
    return paths.data_dir() / config.LOG_FILE_NAME


def setup_logging(level: int = logging.INFO) -> Path | None:
    """Configure file logging and make ``print`` safe in a windowed build.

    Returns the log path, or ``None`` when the file could not be opened (a
    read-only folder, for instance). Logging is best-effort: a client that
    cannot write a log should still try to start.
    """
    _guard_std_streams()
    global _configured
    if _configured:
        return log_path()

    logger = get_logger()
    logger.setLevel(level)
    # Keep the app's records out of the root logger, which werkzeug also uses.
    logger.propagate = False

    try:
        path = log_path()
        handler = RotatingFileHandler(
            path,
            maxBytes=config.LOG_MAX_BYTES,
            backupCount=1,
            encoding="utf-8",
        )
    except OSError:
        return None

    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    )
    logger.addHandler(handler)
    _configured = True
    return path


def show_message(title: str, message: str, error: bool = False) -> None:
    """Show a blocking message box, falling back to stderr off Windows."""
    if sys.platform == "win32":
        try:
            # MB_ICONERROR = 0x10, MB_ICONINFORMATION = 0x40
            flags = 0x10 if error else 0x40
            ctypes.windll.user32.MessageBoxW(None, message, title, flags)
            return
        except Exception:  # noqa: BLE001 - a dialog must never mask the error
            pass
    try:
        print(f"{title}: {message}", file=sys.stderr)
    except (AttributeError, OSError):
        pass


def fatal(title: str, message: str) -> int:
    """Log a startup failure, tell the user, and return an exit code of 1."""
    get_logger().error("%s: %s", title, message)
    show_message(title, message, error=True)
    return 1


def install_excepthooks() -> None:
    """Route unhandled exceptions to the log instead of a silent death.

    A windowed build has no console, so an uncaught exception in the main
    thread would otherwise close the process with no trace at all.
    """

    def _main_hook(exc_type, exc_value, exc_traceback) -> None:
        get_logger().critical(
            "Unhandled exception", exc_info=(exc_type, exc_value, exc_traceback)
        )
        show_message(
            config.APP_NAME,
            "An unexpected error occurred:\n\n"
            f"{exc_value}\n\n"
            f"Details were written to:\n{_safe_log_path()}",
            error=True,
        )

    def _thread_hook(args: threading.ExceptHookArgs) -> None:
        if args.exc_type is SystemExit:
            return
        name = args.thread.name if args.thread is not None else "unknown"
        get_logger().critical(
            "Unhandled exception in thread %s",
            name,
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback),
        )

    sys.excepthook = _main_hook
    threading.excepthook = _thread_hook


def _safe_log_path() -> str:
    try:
        return str(log_path())
    except OSError:
        return "(unavailable)"


def _guard_std_streams() -> None:
    """Point ``None`` std streams at the null device.

    A windowed PyInstaller build has no console, so ``sys.stdout`` and
    ``sys.stderr`` are ``None``. Anything that writes to them — including a
    stray ``print`` in a library — would raise instead of being ignored.
    """
    for name in ("stdout", "stderr"):
        if getattr(sys, name, None) is None:
            try:
                setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))
            except OSError:
                pass


__all__ = [
    "LOGGER_NAME",
    "fatal",
    "get_logger",
    "install_excepthooks",
    "log_path",
    "setup_logging",
    "show_message",
]
