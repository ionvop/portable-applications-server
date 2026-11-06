"""Tests for the desktop close confirmation guard.

The guard is deliberately free of ``webview`` imports so it can be exercised
with a fake window: the real one needs a GUI and a display.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from backend.desktop import CLOSE_REQUEST_EVENT, CloseGuard, DesktopApi


class FakeEvent:
    """Stand-in for a pywebview ``Event``."""

    def __init__(self, is_set: bool = True) -> None:
        self._is_set = is_set

    def is_set(self) -> bool:
        return self._is_set


class FakeEvents:
    def __init__(self, loaded: bool = True, ready: bool = True) -> None:
        self.loaded = FakeEvent(loaded)
        self._pywebviewready = FakeEvent(ready)


class FakeWindow:
    """Records the JS the guard evaluates and whether it was destroyed."""

    def __init__(
        self, loaded: bool = True, fail_evaluate: bool = False, ready: bool = True
    ) -> None:
        self.events = FakeEvents(loaded, ready)
        self.scripts: list[str] = []
        self.destroyed = False
        self._fail_evaluate = fail_evaluate
        self._lock = threading.Lock()

    def evaluate_js(self, script: str) -> None:
        if self._fail_evaluate:
            raise RuntimeError("page is gone")
        with self._lock:
            self.scripts.append(script)

    def destroy(self) -> None:
        self.destroyed = True


def _wait_for(predicate: Any, timeout: float = 3.0) -> bool:
    """Poll ``predicate`` until it is true or the timeout elapses."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_close_is_cancelled_until_allowed() -> None:
    guard = CloseGuard()

    # pywebview cancels the close when the handler returns False.
    assert guard.on_closing() is False

    guard.allow_close()
    assert guard.on_closing() is True


def test_close_request_dispatches_the_dom_event() -> None:
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: bool(window.scripts))
        assert CLOSE_REQUEST_EVENT in window.scripts[0]
        assert not window.destroyed
    finally:
        guard.stop()


def test_acknowledged_request_keeps_the_window_open() -> None:
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: bool(window.scripts))
        guard.acknowledge()
        # Well past the retry timeout: an acknowledged request must not close.
        time.sleep(0.5)
        assert not window.destroyed
    finally:
        guard.stop()


def test_unacknowledged_request_closes_the_window() -> None:
    """A page that never answers must not trap the user in the window."""
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: window.destroyed, timeout=8.0)
    finally:
        guard.stop()


def test_unloaded_page_closes_without_waiting() -> None:
    guard = CloseGuard()
    window = FakeWindow(loaded=False)
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: window.destroyed)
        assert window.scripts == []
    finally:
        guard.stop()


def test_page_without_js_bridge_closes_without_waiting() -> None:
    """``evaluate_js`` would block for 20 s waiting for the JS object."""
    guard = CloseGuard()
    window = FakeWindow(ready=False)
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: window.destroyed)
        assert window.scripts == []
    finally:
        guard.stop()


def test_failed_evaluate_closes_the_window() -> None:
    guard = CloseGuard()
    window = FakeWindow(fail_evaluate=True)
    guard.start(window)
    try:
        assert guard.on_closing() is False
        assert _wait_for(lambda: window.destroyed)
    finally:
        guard.stop()


def test_desktop_api_close_app_destroys_the_window() -> None:
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        api = DesktopApi(guard)
        assert api.close_app() == {"ok": True}
        assert _wait_for(lambda: window.destroyed)
        # The close is allowed, so a later close attempt is not intercepted.
        assert guard.on_closing() is True
    finally:
        guard.stop()


def test_desktop_api_cancel_close_keeps_the_window_open() -> None:
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        api = DesktopApi(guard)
        assert api.cancel_close() == {"ok": True}
        assert not window.destroyed
        assert guard.on_closing() is False
    finally:
        guard.stop()


def test_desktop_api_acknowledge_stops_the_retry() -> None:
    guard = CloseGuard()
    window = FakeWindow()
    guard.start(window)
    try:
        api = DesktopApi(guard)
        assert guard.on_closing() is False
        assert _wait_for(lambda: bool(window.scripts))
        assert api.acknowledge_close_request() == {"ok": True}
        time.sleep(0.5)
        assert not window.destroyed
    finally:
        guard.stop()
