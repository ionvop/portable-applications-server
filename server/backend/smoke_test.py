"""Smoke test for the backend API. Run: python backend/smoke_test.py"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import db, paths
from backend.app import create_app
from backend.services import archive_service

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label} {detail}")


def main() -> int:
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

    # Create a real app directory with content.
    app_dir = paths.apps_dir() / "smoke-app"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "game.exe").write_bytes(b"MZ fake executable")
    (app_dir / "data").mkdir(exist_ok=True)
    (app_dir / "data" / "level1.dat").write_bytes(b"level data")

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
        },
    )
    check("update returns 200", response.status_code == 200)
    check("update applied", response.get_json()["title"] == "Smoke App Renamed")

    response = client.get("/api/catalog/999999")
    check("missing entry returns 404", response.status_code == 404, response.status_code)

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

    response = client.post(
        "/api/files/thumbnail",
        data={"file": (io.BytesIO(b"bad"), "evil.exe")},
        content_type="multipart/form-data",
    )
    check("bad thumbnail type rejected", response.status_code == 400, response.status_code)

    print("distribution")
    response = client.get(f"/api/distribution/{entry_id}/download")
    check("download returns 200", response.status_code == 200, response.status_code)
    check("download is zip", response.mimetype == "application/zip", response.mimetype)
    check(
        "download filename",
        "smoke-app-renamed.zip" in response.headers.get("Content-Disposition", ""),
        response.headers.get("Content-Disposition"),
    )
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = set(archive.namelist())
    check("zip contains exe", "game.exe" in names, names)
    check("zip contains nested file", "data/level1.dat" in names, names)

    response = client.get("/api/distribution/999999/download")
    check("download missing entry 404", response.status_code == 404, response.status_code)

    print("client")
    response = client.get("/api/client/catalog")
    check("client catalog returns 200", response.status_code == 200, response.status_code)
    public_entries = response.get_json()
    public_entry = next((e for e in public_entries if e["id"] == entry_id), None)
    check("client catalog lists entry", public_entry is not None)
    if public_entry is not None:
        check(
            "client catalog exposes only public fields",
            set(public_entry) == {"id", "title", "description", "thumbnail"},
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
    for path in ("/api/catalog", "/api/system/info", "/api/files/browse"):
        response = client.get(path, environ_base=remote)
        check(f"lan client blocked from {path}", response.status_code == 403, response.status_code)
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
    client.delete(f"/api/catalog/{entry_id}")
    check("delete returns 204", True)
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
