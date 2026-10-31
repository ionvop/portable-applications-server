"""Transfer history and derived activity feed.

Every ZIP download served by ``distribution.download`` is recorded here. The
activity feed is derived from those rows plus catalog timestamps, so there is
no second table to keep in sync.
"""

from __future__ import annotations

from typing import Any

from .. import config, db
from ..models import Transfer

#: Statuses a transfer can hold.
ACTIVE = "active"
COMPLETED = "completed"
FAILED = "failed"


def start_transfer(entry_id: int, client_ip: str, size_bytes: int) -> int:
    """Insert an ``active`` transfer row and return its id."""
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO transfers (entry_id, client_ip, size_bytes, status)
            VALUES (?, ?, ?, ?)
            """,
            (entry_id, client_ip, size_bytes, ACTIVE),
        )
        return int(cursor.lastrowid)


def update_transfer_progress(transfer_id: int, bytes_processed: int) -> None:
    """Record how many source bytes the stream has consumed so far.

    Called from the download generator, so it must stay cheap: one small
    ``UPDATE`` per call, throttled by the caller.
    """
    with db.get_connection() as connection:
        connection.execute(
            "UPDATE transfers SET bytes_processed = ? WHERE id = ?",
            (max(0, bytes_processed), transfer_id),
        )


def finish_transfer(
    transfer_id: int,
    status: str,
    bytes_processed: int | None = None,
) -> None:
    """Mark a transfer as ``completed`` or ``failed`` and stamp the end time.

    ``bytes_processed`` is written in the same statement when supplied so the
    final row is exact even if the last throttled progress update was skipped.
    """
    with db.get_connection() as connection:
        if bytes_processed is None:
            connection.execute(
                """
                UPDATE transfers
                   SET status = ?, finished_at = datetime('now')
                 WHERE id = ?
                """,
                (status, transfer_id),
            )
        else:
            connection.execute(
                """
                UPDATE transfers
                   SET status = ?,
                       bytes_processed = ?,
                       finished_at = datetime('now')
                 WHERE id = ?
                """,
                (status, max(0, bytes_processed), transfer_id),
            )


def list_transfers(limit: int = 100) -> list[dict[str, Any]]:
    """Return recent transfers, newest first, with the entry title attached."""
    with db.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT t.*, c.title AS entry_title
              FROM transfers AS t
              LEFT JOIN catalog AS c ON c.id = t.entry_id
             ORDER BY t.started_at DESC, t.id DESC
             LIMIT ?
            """,
            (limit,),
        ).fetchall()

    transfers: list[dict[str, Any]] = []
    for row in rows:
        payload = Transfer.from_row(row).to_dict()
        payload["entry_title"] = row["entry_title"] or "Deleted entry"
        payload["started_at"] = _iso(row["started_at"])
        payload["finished_at"] = _iso(row["finished_at"])
        transfers.append(payload)
    return transfers


def list_activity(limit: int = 20) -> list[dict[str, Any]]:
    """Derive a merged activity feed from transfers and catalog timestamps."""
    items: list[dict[str, Any]] = []

    with db.get_connection() as connection:
        transfer_rows = connection.execute(
            """
            SELECT t.*, c.title AS entry_title
              FROM transfers AS t
              LEFT JOIN catalog AS c ON c.id = t.entry_id
             ORDER BY t.started_at DESC, t.id DESC
             LIMIT ?
            """,
            (limit,),
        ).fetchall()

        catalog_rows = connection.execute(
            """
            SELECT id, title, created_at, updated_at
              FROM catalog
             ORDER BY updated_at DESC
             LIMIT ?
            """,
            (limit,),
        ).fetchall()

    for row in transfer_rows:
        title = row["entry_title"] or "Deleted entry"
        size = _format_bytes(row["size_bytes"])
        client = row["client_ip"] or "unknown client"
        status = row["status"]

        if status == COMPLETED:
            message, tone = "Transfer completed", "success"
        elif status == FAILED:
            message, tone = "Transfer failed", "warning"
        else:
            message, tone = "Transfer started", "info"

        items.append(
            {
                "id": f"transfer-{row['id']}",
                "message": message,
                "detail": f"{title} → {client} ({size})",
                "occurred_at": _iso(row["finished_at"] or row["started_at"]),
                "tone": tone,
            }
        )

    for row in catalog_rows:
        created = row["created_at"]
        updated = row["updated_at"]
        # ``updated_at`` is bumped on every edit, so a row whose timestamps
        # match was only ever created.
        if updated and updated != created:
            items.append(
                {
                    "id": f"catalog-{row['id']}-updated",
                    "message": "Catalog entry updated",
                    "detail": row["title"],
                    "occurred_at": _iso(updated),
                    "tone": "info",
                }
            )
        else:
            items.append(
                {
                    "id": f"catalog-{row['id']}-created",
                    "message": "Catalog entry added",
                    "detail": row["title"],
                    "occurred_at": _iso(created),
                    "tone": "info",
                }
            )

    items.sort(key=lambda item: item["occurred_at"] or "", reverse=True)
    return items[:limit]


def reconcile_stale_transfers() -> int:
    """Mark transfers left ``active`` by a dropped connection as failed."""
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE transfers
               SET status = ?, finished_at = datetime('now')
             WHERE status = ?
               AND started_at < datetime('now', ?)
            """,
            (FAILED, ACTIVE, f"-{config.TRANSFER_STALE_SECONDS} seconds"),
        )
        return cursor.rowcount


def prune_transfers() -> int:
    """Delete the oldest rows beyond the configured history limit."""
    with db.get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM transfers
             WHERE id NOT IN (
                   SELECT id FROM transfers
                    ORDER BY started_at DESC, id DESC
                    LIMIT ?
             )
            """,
            (config.TRANSFER_HISTORY_LIMIT,),
        )
        return cursor.rowcount


def _iso(value: str | None) -> str | None:
    """Convert SQLite's ``YYYY-MM-DD HH:MM:SS`` UTC text into ISO-8601."""
    if not value:
        return None
    return value.replace(" ", "T") + "Z"


def _format_bytes(size: int) -> str:
    """Human-readable size label used in activity details."""
    value = float(max(0, size))
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"
