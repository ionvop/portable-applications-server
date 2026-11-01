"""Shared error type for the client backend.

Every service raises :class:`ClientError` with a user-readable message and an
HTTP status. ``app.create_app`` registers a single handler that turns it into
``{"error": "..."}``, so the React UI can surface the message verbatim.
"""

from __future__ import annotations


class ClientError(Exception):
    """A failure that should be reported to the UI as a 4xx/5xx JSON body."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
