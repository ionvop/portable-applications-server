"""Desktop window lifecycle helpers.

The Flask server runs inside the desktop process, so closing the PyWebView
window also stops the server for every client on the local network. This module
intercepts the close, asks the frontend to confirm, and only then lets the
window go.

Two pieces cooperate:

* :class:`CloseGuard` subscribes to ``window.events.closing``. pywebview runs
  that handler synchronously on the UI thread and cancels the close when the
  handler returns ``False``, so the handler must return immediately. It only
  raises a flag; a background thread does the actual work.
* :class:`DesktopApi` is exposed to the page as ``window.pywebview.api`` and
  lets the frontend answer the request (``close_app`` / ``cancel_close``).

Nothing here imports ``webview`` at module level: the window is duck-typed, so
the guard can be unit-tested without a GUI.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

#: DOM event dispatched in the page when the user tries to close the window.
#: Kept in sync with ``CLOSE_REQUEST_EVENT`` in ``src/lib/desktop.ts``.
CLOSE_REQUEST_EVENT = "pas:close-requested"

#: How long the watcher sleeps between checks. Only bounds shutdown latency.
_POLL_SECONDS = 0.2

#: How long to wait for the page to acknowledge a close request. The page
#: answers as soon as it shows the dialog, so this only expires when the event
#: was dispatched before React mounted and was therefore lost.
_ACK_TIMEOUT_SECONDS = 2.0


class CloseGuard:
    """Cancel window closes until the frontend explicitly allows them."""

    def __init__(self) -> None:
        self._allow_close = False
        self._pending = threading.Event()
        self._ack = threading.Event()
        self._stop = threading.Event()
        self._window: Any = None
        self._thread: threading.Thread | None = None

    # -- pywebview event handler -------------------------------------------

    def on_closing(self) -> bool:
        """Handle ``window.events.closing``.

        pywebview cancels the close when a handler returns ``False``, so this
        returns ``True`` only once :meth:`allow_close` has been called. It must
        stay fast: it runs on the UI thread, and blocking here freezes the
        window.
        """
        if self._allow_close:
            return True
        self._pending.set()
        return False

    # -- lifecycle ---------------------------------------------------------

    def start(self, window: Any) -> None:
        """Begin watching for close requests on a background thread."""
        self._window = window
        self._thread = threading.Thread(
            target=self._watch, name="close-guard", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """Stop the watcher thread. Safe to call more than once."""
        self._stop.set()
        self._pending.set()

    def allow_close(self) -> None:
        """Let the next close attempt through without asking again."""
        self._allow_close = True

    def acknowledge(self) -> None:
        """Record that the page received the close request."""
        self._ack.set()

    def destroy_window(self) -> None:
        """Allow the close and destroy the window.

        Called from a background thread: ``destroy`` marshals onto the UI
        thread, so it must never run inside the closing handler itself.
        """
        self.allow_close()
        window = self._window
        if window is None:
            return
        try:
            window.destroy()
        except Exception:
            logger.exception("Could not close the window")

    # -- internals ---------------------------------------------------------

    def _watch(self) -> None:
        while not self._stop.is_set():
            if not self._pending.wait(_POLL_SECONDS):
                continue
            self._pending.clear()
            if self._stop.is_set():
                return

            self._ack.clear()
            if not self._dispatch_close_request():
                # The page cannot answer (not loaded yet, or the window is
                # already gone). Closing is the only way out, so never leave
                # the user with a window that refuses to close.
                self.destroy_window()
                return

            if not self._ack.wait(_ACK_TIMEOUT_SECONDS):
                # The event was dispatched before the page could listen for it
                # (React had not mounted yet). Retry once, then give up and
                # close rather than trapping the user in an unclosable window.
                if not self._dispatch_close_request() or not self._ack.wait(
                    _ACK_TIMEOUT_SECONDS
                ):
                    self.destroy_window()
                    return

    def _dispatch_close_request(self) -> bool:
        """Ask the frontend to show its confirmation dialog."""
        window = self._window
        if window is None:
            return False

        # ``evaluate_js`` waits up to 20 s for pywebview's JS object. Skip that
        # wait when the page is not ready: the user would otherwise stare at a
        # window that ignores the close button for the whole timeout.
        if not self._page_ready(window):
            return False

        script = (
            "window.dispatchEvent(new CustomEvent("
            f"{json.dumps(CLOSE_REQUEST_EVENT)}"
            "))"
        )
        try:
            window.evaluate_js(script)
        except Exception:
            logger.exception("Could not ask the frontend to confirm closing")
            return False
        return True

    @staticmethod
    def _page_ready(window: Any) -> bool:
        """True once the page has loaded and pywebview's JS object exists."""
        events = getattr(window, "events", None)
        if events is None:
            return True
        for name in ("loaded", "_pywebviewready"):
            event = getattr(events, name, None)
            if event is not None and not event.is_set():
                return False
        return True


class DesktopApi:
    """Methods the frontend calls through ``window.pywebview.api``.

    pywebview exposes every public method of this object to the page, so the
    window reference lives on the guard instead of as a public attribute here.
    """

    def __init__(self, guard: CloseGuard) -> None:
        self._guard = guard

    def acknowledge_close_request(self) -> dict[str, bool]:
        """Tell the backend the confirmation dialog is on screen."""
        self._guard.acknowledge()
        return {"ok": True}

    def close_app(self) -> dict[str, bool]:
        """Confirm the close: let the window go and destroy it."""
        # Destroy from another thread so this call can still return its result
        # to the page before the window disappears.
        threading.Thread(
            target=self._guard.destroy_window, name="close-app", daemon=True
        ).start()
        return {"ok": True}

    def cancel_close(self) -> dict[str, bool]:
        """Acknowledge a cancelled close. The window stays open."""
        return {"ok": True}
