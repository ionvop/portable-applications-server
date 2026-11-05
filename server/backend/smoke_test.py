"""Smoke test for the backend API. Run: python backend/smoke_test.py"""

from __future__ import annotations

import io
import json
import socket
import sqlite3
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config, db, paths
from backend.app import create_app
from backend.services import archive_service, catalog_service, network_service

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label} {detail}")


def _free_udp_port() -> int:
    """Return a currently free UDP port on the loopback interface."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]
    finally:
        probe.close()


def _probe_discovery(port: int, payload: bytes, timeout: float = 1.0) -> dict | None:
    """Send ``payload`` to the discovery port and decode the JSON reply."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.settimeout(timeout)
    try:
        probe.sendto(payload, ("127.0.0.1", port))
        while True:
            try:
                data, _address = probe.recvfrom(config.DISCOVERY_REPLY_MAX_BYTES)
            except socket.timeout:
                return None
            try:
                decoded = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                continue
            return decoded if isinstance(decoded, dict) else None
    except OSError:
        return None
    finally:
        probe.close()


def main() -> int:
    # The pytest wrapper may call ``main`` after ``check`` was used elsewhere,
    # and a second run must not inherit the previous run's failures.
    failures.clear()

    db.init_db()
    archive_service.sweep_stale_archives()
    client = create_app().test_client()

    print("system")
    response = client.get("/api/health")
    check("health returns 200", response.status_code == 200, response.status_code)
    check("health body", response.get_json() == {"status": "ok"})

    response = client.get("/api/system/info")
    info = response.get_json()
    check("system info returns 200", response.status_code == 200)
    check("system info has lan_ip", bool(info.get("lan_ip")))
    check("system info data_dir exists", Path(info["data_dir"]).is_dir())

    print("catalog")
    response = client.post("/api/catalog", json={"title": ""})
    check("empty title rejected", response.status_code == 400, response.status_code)

    response = client.post(
        "/api/catalog",
        json={"title": "Escape", "directory": "../../etc", "executable": "x.exe"},
    )
    check("traversal rejected", response.status_code == 400, response.status_code)

    response = client.post(
        "/api/catalog",
        json={"title": "Abs", "directory": "abs", "executable": "C:/x.exe"},
    )
    check("absolute executable rejected", response.status_code == 400, response.status_code)

    # Create a real app directory with content. ``big.bin`` spans several
    # streaming chunks so the generator is exercised more than once.
    app_dir = paths.apps_dir() / "smoke-app"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "game.exe").write_bytes(b"MZ fake executable")
    (app_dir / "data").mkdir(exist_ok=True)
    (app_dir / "data" / "level1.dat").write_bytes(b"level data")
    big_size = config.ZIP_CHUNK_SIZE * 2 + 1234
    (app_dir / "big.bin").write_bytes(b"\x00" * big_size)
    source_total = sum(
        path.stat().st_size for path in app_dir.rglob("*") if path.is_file()
    )

    response = client.post(
        "/api/catalog",
        json={
            "title": "Smoke App",
            "description": "Test entry",
            "directory": "smoke-app",
            "executable": "game.exe",
        },
    )
    check("create returns 201", response.status_code == 201, response.status_code)
    entry = response.get_json()
    entry_id = entry["id"]
    check("create echoes title", entry["title"] == "Smoke App")
    check(
        "create defaults the version",
        entry["version"] == "1.0.0",
        entry.get("version"),
    )

    response = client.get("/api/catalog")
    check("list contains entry", any(e["id"] == entry_id for e in response.get_json()))

    response = client.get(f"/api/catalog/{entry_id}")
    check("get one returns 200", response.status_code == 200)

    response = client.put(
        f"/api/catalog/{entry_id}",
        json={
            "title": "Smoke App Renamed",
            "directory": "smoke-app",
            "executable": "game.exe",
            "version": "2.1.0",
        },
    )
    check("update returns 200", response.status_code == 200, response.status_code)
    check("update applied", response.get_json()["title"] == "Smoke App Renamed")
    check(
        "update applies the version",
        response.get_json()["version"] == "2.1.0",
        response.get_json().get("version"),
    )

    response = client.put(
        f"/api/catalog/{entry_id}",
        json={
            "title": "Smoke App Renamed",
            "directory": "smoke-app",
            "executable": "game.exe",
            "version": "   ",
        },
    )
    check(
        "blank version falls back to the default",
        response.get_json().get("version") == "1.0.0",
        response.get_json().get("version"),
    )

    response = client.put(
        f"/api/catalog/{entry_id}",
        json={
            "title": "Smoke App Renamed",
            "directory": "smoke-app",
            "executable": "game.exe",
            "version": "x" * 64,
        },
    )
    check("overlong version rejected", response.status_code == 400, response.status_code)

    # Restore the version the client-contract checks below assert against.
    client.put(
        f"/api/catalog/{entry_id}",
        json={
            "title": "Smoke App Renamed",
            "directory": "smoke-app",
            "executable": "game.exe",
            "version": "2.1.0",
        },
    )

    response = client.get("/api/catalog/999999")
    check("missing entry returns 404", response.status_code == 404, response.status_code)

    response = client.put(
        "/api/catalog/999999",
        json={"title": "Ghost", "directory": "ghost", "executable": "g.exe"},
    )
    check("update missing entry 404", response.status_code == 404, response.status_code)
    check(
        "update missing entry carries an error message",
        bool((response.get_json() or {}).get("error")),
        response.get_json(),
    )

    response = client.delete("/api/catalog/999999")
    check("delete missing entry 404", response.status_code == 404, response.status_code)

    # A malformed body must be rejected rather than silently treated as empty,
    # which would otherwise surface as a confusing "title is required" error.
    response = client.post(
        "/api/catalog",
        data="not json",
        content_type="application/json",
    )
    check("malformed json body rejected", response.status_code == 400, response.status_code)

    print("files")
    response = client.get("/api/files/browse")
    check("browse returns 200", response.status_code == 200)
    check("browse lists smoke-app", "smoke-app" in response.get_json()["directories"])

    response = client.get("/api/files/browse?path=../..")
    check("browse traversal rejected", response.status_code == 400, response.status_code)

    response = client.post(
        "/api/files/thumbnail",
        data={"file": (io.BytesIO(b"\x89PNG fake"), "cover.png")},
        content_type="multipart/form-data",
    )
    check("thumbnail upload 201", response.status_code == 201, response.status_code)
    thumbnail = response.get_json()["thumbnail"]
    check("thumbnail served", client.get(f"/api/files/thumbnail/{thumbnail}").status_code == 200)
    check(
        "unknown thumbnail 404",
        client.get("/api/files/thumbnail/does-not-exist.png").status_code == 404,
    )

    response = client.post(
        "/api/files/thumbnail",
        data={"file": (io.BytesIO(b"bad"), "evil.exe")},
        content_type="multipart/form-data",
    )
    check("bad thumbnail type rejected", response.status_code == 400, response.status_code)

    print("reveal")
    response = client.post("/api/files/reveal", json={"path": "../.."})
    check("reveal traversal rejected", response.status_code == 400, response.status_code)

    response = client.post("/api/files/reveal", json={"path": "does-not-exist"})
    check("reveal missing folder 404", response.status_code == 404, response.status_code)

    # Never actually launch Explorer during the test: record the call instead.
    import os as os_module
    import sys as sys_module

    opened: list[str] = []
    original_startfile = getattr(os_module, "startfile", None)
    if sys_module.platform == "win32":
        os_module.startfile = opened.append  # type: ignore[attr-defined]
        try:
            response = client.post("/api/files/reveal", json={"path": "smoke-app"})
            check("reveal returns 200", response.status_code == 200, response.status_code)
            check(
                "reveal reports the absolute path",
                response.get_json().get("revealed") == str(app_dir.resolve()),
                response.get_json(),
            )
            check("reveal opened the folder", opened == [str(app_dir.resolve())], opened)
        finally:
            if original_startfile is None:
                del os_module.startfile  # type: ignore[attr-defined]
            else:
                os_module.startfile = original_startfile  # type: ignore[attr-defined]
    else:
        response = client.post("/api/files/reveal", json={"path": "smoke-app"})
        check("reveal unsupported off windows", response.status_code == 501, response.status_code)

    print("storage")
    response = client.get("/api/system/storage")
    check("storage returns 200", response.status_code == 200, response.status_code)
    storage = response.get_json()
    check(
        "storage shape",
        set(storage) == {"apps", "thumbnails", "tmp", "total_bytes", "disk"},
        sorted(storage),
    )
    check(
        "storage folder shape",
        set(storage["apps"]) == {"bytes", "files"},
        sorted(storage["apps"]),
    )
    check(
        "storage disk shape",
        set(storage["disk"]) == {"total_bytes", "used_bytes", "free_bytes"},
        sorted(storage["disk"]),
    )

    # The reported size must match a manual walk of the same folder.
    expected_apps_bytes = sum(
        path.stat().st_size for path in paths.apps_dir().rglob("*") if path.is_file()
    )
    expected_apps_files = sum(
        1 for path in paths.apps_dir().rglob("*") if path.is_file()
    )
    check(
        "storage apps bytes match the filesystem",
        storage["apps"]["bytes"] == expected_apps_bytes,
        (storage["apps"]["bytes"], expected_apps_bytes),
    )
    check(
        "storage apps file count matches",
        storage["apps"]["files"] == expected_apps_files,
        (storage["apps"]["files"], expected_apps_files),
    )
    check(
        "storage total is the sum of the folders",
        storage["total_bytes"]
        == storage["apps"]["bytes"]
        + storage["thumbnails"]["bytes"]
        + storage["tmp"]["bytes"],
        storage["total_bytes"],
    )
    check(
        "storage disk numbers are consistent",
        storage["disk"]["total_bytes"]
        == storage["disk"]["used_bytes"] + storage["disk"]["free_bytes"],
        storage["disk"],
    )
    check("storage free space is positive", storage["disk"]["free_bytes"] > 0)

    print("client contract")
    response = client.get("/api/client/catalog")
    check("client catalog returns 200", response.status_code == 200, response.status_code)
    public_rows = response.get_json()
    public_row = next((row for row in public_rows if row["id"] == entry_id), None)
    check("client catalog lists the entry", public_row is not None, public_rows)
    if public_row is not None:
        check(
            "client catalog field set",
            set(public_row) == {"id", "title", "description", "thumbnail", "version"},
            sorted(public_row),
        )
        check(
            "client catalog exposes the version",
            public_row["version"] == "2.1.0",
            public_row.get("version"),
        )
        check(
            "client catalog hides the directory",
            "directory" not in public_row,
            sorted(public_row),
        )
        check(
            "client catalog hides the executable",
            "executable" not in public_row,
            sorted(public_row),
        )

    response = client.get(f"/api/client/catalog/{entry_id}")
    check("client catalog entry returns 200", response.status_code == 200)

    print("manifest")
    response = client.get(f"/api/client/catalog/{entry_id}/manifest")
    check("manifest returns 200", response.status_code == 200, response.status_code)
    manifest = response.get_json()
    check(
        "manifest field set",
        set(manifest) == {"id", "title", "version", "executable", "size_bytes"},
        sorted(manifest),
    )
    check("manifest id", manifest["id"] == entry_id, manifest.get("id"))
    check(
        "manifest title",
        manifest["title"] == "Smoke App Renamed",
        manifest.get("title"),
    )
    check("manifest version", manifest["version"] == "2.1.0", manifest.get("version"))
    check(
        "manifest discloses the executable",
        manifest["executable"] == "game.exe",
        manifest.get("executable"),
    )
    check(
        "manifest size matches the source total",
        manifest["size_bytes"] == source_total,
        (manifest["size_bytes"], source_total),
    )

    response = client.get("/api/client/catalog/999999/manifest")
    check("manifest missing entry 404", response.status_code == 404, response.status_code)
    missing = response.get_json()
    check(
        "manifest missing entry carries an error message",
        isinstance(missing, dict) and "not found" in str(missing.get("error", "")).lower(),
        missing,
    )

    # An entry whose directory has been removed must fail with a readable 404
    # rather than a 500, because clients surface the message verbatim.
    response = client.post(
        "/api/catalog",
        json={
            "title": "Vanished App",
            "directory": "vanished-app",
            "executable": "missing.exe",
        },
    )
    vanished_id = response.get_json()["id"]
    response = client.get(f"/api/client/catalog/{vanished_id}/manifest")
    check(
        "manifest missing directory 404",
        response.status_code == 404,
        response.status_code,
    )
    client.delete(f"/api/catalog/{vanished_id}")

    print("discovery")
    # Bind an ephemeral port so the test never collides with a running server.
    responder = network_service.DiscoveryResponder(port=_free_udp_port())
    started = responder.start()
    check("discovery responder starts", started, responder.error)
    if started:
        try:
            reply = _probe_discovery(responder.port, config.DISCOVERY_MAGIC)
            check("discovery answers the magic payload", reply is not None, reply)
            if reply is not None:
                check("discovery reply is a dict", isinstance(reply, dict), type(reply))
                check("discovery reply has app", bool(reply.get("app")), reply)
                check("discovery reply has version", bool(reply.get("version")), reply)
                # The client validates with ``isinstance(port, int)``; a string
                # or float would be silently discarded.
                check(
                    "discovery port is a JSON integer",
                    isinstance(reply.get("port"), int),
                    reply.get("port"),
                )
                check(
                    "discovery port is the HTTP port",
                    reply.get("port") == config.PORT,
                    (reply.get("port"), config.PORT),
                )
            check(
                "discovery ignores unrelated payloads",
                _probe_discovery(responder.port, b"not-the-magic-payload") is None,
            )
        finally:
            responder.stop()
        check("discovery responder stops", not responder.running)

    print("distribution")
    response = client.get(f"/api/distribution/{entry_id}/download")
    check("download returns 200", response.status_code == 200, response.status_code)
    check("download is zip", response.mimetype == "application/zip", response.mimetype)
    check(
        "download filename",
        "smoke-app-renamed.zip" in response.headers.get("Content-Disposition", ""),
        response.headers.get("Content-Disposition"),
    )
    # The archive is built while it is sent, so its compressed size is unknown
    # when the response starts and no Content-Length can be advertised.
    check(
        "download has no content-length",
        "Content-Length" not in response.headers,
        response.headers.get("Content-Length"),
    )
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = set(archive.namelist())
        check("zip is valid", archive.testzip() is None)
    check("zip contains exe", "game.exe" in names, names)
    check("zip contains nested file", "data/level1.dat" in names, names)
    check("zip contains multi-chunk file", "big.bin" in names, names)
    # ``call_on_close`` only runs once the response is closed, which is what a
    # real WSGI server does after the last byte is written.
    response.close()

    response = client.get("/api/distribution/999999/download")
    check("download missing entry 404", response.status_code == 404, response.status_code)

    print("streaming")
    # Archives left by older versions may still be in the temp folder; only the
    # files created by this run matter.
    archives_before = set(paths.tmp_dir().glob("*.zip"))
    entry_model = catalog_service.get_entry(entry_id)
    plan = archive_service.plan_archive(entry_model)
    check("plan totals the source size", plan.total_bytes == source_total, plan.total_bytes)
    check("plan lists every file", len(plan.files) == 3, len(plan.files))

    chunks = list(archive_service.iter_archive(plan))
    check("stream yields multiple chunks", len(chunks) > 1, len(chunks))
    check(
        "stream reports monotonic progress",
        all(
            earlier[1] <= later[1]
            for earlier, later in zip(chunks, chunks[1:])
        ),
        [consumed for _, consumed in chunks],
    )
    check(
        "stream ends at the source total",
        chunks[-1][1] == source_total,
        (chunks[-1][1], source_total),
    )
    check(
        "stream produces a valid zip",
        zipfile.ZipFile(io.BytesIO(b"".join(chunk for chunk, _ in chunks))).testzip()
        is None,
    )
    archives_after = set(paths.tmp_dir().glob("*.zip"))
    check(
        "streaming creates no temp archive",
        archives_after == archives_before,
        sorted(str(path) for path in archives_after - archives_before),
    )

    print("migration")
    legacy = sqlite3.connect(":memory:")
    legacy.row_factory = sqlite3.Row
    legacy.execute(
        "CREATE TABLE transfers (id INTEGER PRIMARY KEY, size_bytes INTEGER)"
    )
    db._ensure_column(
        legacy, "transfers", "bytes_processed", "INTEGER NOT NULL DEFAULT 0"
    )
    columns = {row["name"] for row in legacy.execute("PRAGMA table_info(transfers)")}
    check("migration adds bytes_processed", "bytes_processed" in columns, columns)
    # Running it again must be a no-op rather than an error.
    db._ensure_column(
        legacy, "transfers", "bytes_processed", "INTEGER NOT NULL DEFAULT 0"
    )
    check("migration is idempotent", True)
    legacy.close()

    print("transfers")
    response = client.get("/api/transfers")
    check("transfers returns 200", response.status_code == 200, response.status_code)
    transfer_rows = response.get_json()
    check("transfers is a list", isinstance(transfer_rows, list), type(transfer_rows))
    transfer = next((t for t in transfer_rows if t["entry_id"] == entry_id), None)
    check("download recorded a transfer", transfer is not None, transfer_rows)
    if transfer is not None:
        check(
            "transfer completed after streaming",
            transfer["status"] == "completed",
            transfer["status"],
        )
        check("transfer has size", transfer["size_bytes"] > 0, transfer["size_bytes"])
        check(
            "transfer size is the source total",
            transfer["size_bytes"] == source_total,
            (transfer["size_bytes"], source_total),
        )
        check(
            "transfer reports full progress",
            transfer["bytes_processed"] == transfer["size_bytes"],
            (transfer["bytes_processed"], transfer["size_bytes"]),
        )
        check("transfer has client ip", bool(transfer["client_ip"]), transfer["client_ip"])
        check("transfer has entry title", bool(transfer["entry_title"]), transfer)
        check("transfer has finished_at", bool(transfer["finished_at"]), transfer)

    response = client.get("/api/activity")
    check("activity returns 200", response.status_code == 200, response.status_code)
    activity_rows = response.get_json()
    check("activity is a list", isinstance(activity_rows, list), type(activity_rows))
    check("activity is not empty", bool(activity_rows), activity_rows)
    if activity_rows:
        first = activity_rows[0]
        check(
            "activity item shape",
            set(first) == {"id", "message", "detail", "occurred_at", "tone"},
            sorted(first),
        )
        check(
            "activity mentions the transfer",
            any("Transfer" in item["message"] for item in activity_rows),
            [item["message"] for item in activity_rows],
        )

    response = client.get("/api/transfers?limit=abc")
    check("transfers rejects bad limit", response.status_code == 400, response.status_code)

    print("client")
    response = client.get("/api/client/catalog")
    check("client catalog returns 200", response.status_code == 200, response.status_code)
    public_entries = response.get_json()
    public_entry = next((e for e in public_entries if e["id"] == entry_id), None)
    check("client catalog lists entry", public_entry is not None)
    if public_entry is not None:
        check(
            "client catalog exposes only public fields",
            set(public_entry) == {"id", "title", "description", "thumbnail", "version"},
            sorted(public_entry),
        )
        check(
            "client catalog hides directory",
            "directory" not in public_entry and "executable" not in public_entry,
        )

    response = client.get(f"/api/client/catalog/{entry_id}")
    check("client entry returns 200", response.status_code == 200, response.status_code)
    check(
        "client entry hides directory",
        "directory" not in response.get_json(),
        response.get_json(),
    )

    response = client.get("/api/client/catalog/999999")
    check("client missing entry 404", response.status_code == 404, response.status_code)

    response = client.get("/client")
    check("client page returns 200", response.status_code == 200, response.status_code)
    check("client page is html", response.mimetype == "text/html", response.mimetype)
    check("client page lists entry", b"Smoke App Renamed" in response.data)
    check(
        "client page links download",
        f"/api/distribution/{entry_id}/download".encode() in response.data,
    )

    print("admin guard")
    remote = {"REMOTE_ADDR": "192.168.1.50"}
    for path in (
        "/api/catalog",
        "/api/system/info",
        "/api/system/storage",
        "/api/files/browse",
        "/api/transfers",
        "/api/activity",
    ):
        response = client.get(path, environ_base=remote)
        check(f"lan client blocked from {path}", response.status_code == 403, response.status_code)
    response = client.post(
        "/api/files/reveal", json={"path": ""}, environ_base=remote
    )
    check(
        "lan client blocked from reveal",
        response.status_code == 403,
        response.status_code,
    )
    response = client.get("/api/client/catalog", environ_base=remote)
    check("lan client allowed on client catalog", response.status_code == 200, response.status_code)
    response = client.get(
        f"/api/distribution/{entry_id}/download", environ_base=remote
    )
    check("lan client allowed to download", response.status_code == 200, response.status_code)
    response = client.get(f"/api/files/thumbnail/{thumbnail}", environ_base=remote)
    check("lan client allowed to read thumbnails", response.status_code == 200, response.status_code)

    print("spa")
    response = client.get("/")
    check("index served", response.status_code == 200, response.status_code)
    check("index is html", b"<div id=\"root\">" in response.data)
    response = client.get("/some/client/route")
    check("spa fallback serves html", response.status_code == 200)
    response = client.get("/api/unknown")
    check("unknown api returns 404 json", response.status_code == 404, response.status_code)

    print("cleanup")
    response = client.delete(f"/api/catalog/{entry_id}")
    check("delete returns 204", response.status_code == 204, response.status_code)
    check("entry gone", client.get(f"/api/catalog/{entry_id}").status_code == 404)

    import shutil

    shutil.rmtree(app_dir, ignore_errors=True)
    for leftover in paths.thumbnails_dir().glob("*.png"):
        leftover.unlink(missing_ok=True)

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S): {failures}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
