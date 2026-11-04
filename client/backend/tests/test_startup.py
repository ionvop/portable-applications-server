"""Tests for the startup hardening added in Step 11.

These cover the pieces that only matter on a clean machine: the log file, the
fatal-error path, the "already running" probe and the port fallback. None of
them open a window.
"""

from __future__ import annotations

import logging
import socket
from pathlib import Path

import pytest

from backend import config, diagnostics, paths, preflight


@pytest.fixture()
def isolated_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(paths, "base_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def reset_logging():
    """Give every test a clean logger.

    ``setup_logging`` is deliberately idempotent via a module-level flag, so a
    handler installed by an earlier test would otherwise survive into the next
    one and point at a deleted temporary folder.
    """
    logger = logging.getLogger(diagnostics.LOGGER_NAME)

    def clear() -> None:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
            handler.close()
        diagnostics._configured = False

    clear()
    yield
    clear()


def test_setup_logging_writes_beside_the_executable(isolated_data: Path) -> None:
    path = diagnostics.setup_logging()

    assert path == isolated_data / "data" / config.LOG_FILE_NAME
    diagnostics.get_logger().info("hello from the test")
    for handler in diagnostics.get_logger().handlers:
        handler.flush()

    assert "hello from the test" in path.read_text(encoding="utf-8")


def test_setup_logging_is_idempotent(isolated_data: Path) -> None:
    diagnostics.setup_logging()
    diagnostics.setup_logging()

    assert len(diagnostics.get_logger().handlers) == 1


def test_fatal_logs_and_returns_one(isolated_data: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    shown: list[tuple[str, str, bool]] = []
    monkeypatch.setattr(
        diagnostics, "show_message", lambda title, message, error=False: shown.append((title, message, error))
    )
    diagnostics.setup_logging()

    assert diagnostics.fatal("Title", "Something broke") == 1

    assert shown == [("Title", "Something broke", True)]
    for handler in diagnostics.get_logger().handlers:
        handler.flush()
    assert "Something broke" in diagnostics.log_path().read_text(encoding="utf-8")


def test_show_message_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dialog failure must not mask the error it is reporting."""
    monkeypatch.setattr(diagnostics.sys, "platform", "linux")
    monkeypatch.setattr(diagnostics.sys, "stderr", None)

    diagnostics.show_message("Title", "Message")  # must not raise


def test_port_in_use_detects_a_bound_socket() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((config.UI_HOST, 0))
        listener.listen(1)
        port = listener.getsockname()[1]

        assert preflight.port_in_use(port) is True

    assert preflight.port_in_use(port) is False


def test_choose_port_returns_the_preferred_port_when_free() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((config.UI_HOST, 0))
        free = probe.getsockname()[1]

    assert preflight.choose_port(free) == free


def test_choose_port_falls_back_when_the_preferred_port_is_taken() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((config.UI_HOST, 0))
        listener.listen(1)
        taken = listener.getsockname()[1]

        chosen = preflight.choose_port(taken)

    assert chosen != taken
    assert chosen > 0


def test_existing_instance_ignores_a_foreign_service() -> None:
    """Something else on the port is not "our client already running"."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((config.UI_HOST, 0))
        listener.listen(1)
        port = listener.getsockname()[1]

        assert preflight.existing_instance(port) is None


def test_existing_instance_returns_none_when_nothing_listens() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((config.UI_HOST, 0))
        free = probe.getsockname()[1]

    assert preflight.existing_instance(free) is None


def test_runtime_probes_do_not_raise() -> None:
    """Both probes must answer, not explode, on any machine."""
    assert isinstance(preflight.webview2_available(), bool)
    assert isinstance(preflight.dotnet_available(), bool)
