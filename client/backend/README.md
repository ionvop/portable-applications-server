# Portable Applications Client — Python Backend

Desktop shell (PyWebView) + local HTTP API (Flask) + install state (SQLite) + LAN
download/extract/launch services.

The client is the user-facing half of the Portable Applications system. It discovers the
Portable Applications Server on the local network, lists its catalog, downloads and extracts
the selected application, and launches it — all from a single window.

## Requirements

- Python 3.10+
- Node.js (only to build the frontend)

## Setup

```powershell
cd client
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

## Build the frontend

The Python app serves the **built** frontend from `dist/`, so build it first:

```powershell
npm install
npm run build
```

## Run

```powershell
python run.py
```

A PyWebView window opens at `http://127.0.0.1:8757/`. Closing the window stops the local
server.

## Development (hot reload)

`run.py` requires a built frontend and opens a desktop window, which is awkward while
editing the UI. For development, run the API headless and let Vite serve the frontend:

```powershell
# terminal 1 — local Flask API on http://127.0.0.1:8757
npm run dev:api        # equivalent to: python backend/dev_server.py

# terminal 2 — Vite dev server on http://localhost:5173
npm run dev
```

`vite.config.ts` proxies `/api` to `http://127.0.0.1:8757`, so the frontend can call
`/api/...` on its own origin in both development and production. Verify with:

```powershell
curl http://localhost:5173/api/health   # {"status":"ok"}
```

`backend/dev_server.py` skips the PyWebView window and the `dist/` existence check, so no
build is needed while iterating. Run `python backend/smoke_test.py` to check the API
baseline without starting a server or a real Portable Applications Server — it spins up a
stub server on loopback that implements the contract below.

## Data layout

Everything writable lives in `data/` beside the executable (or beside `run.py` in
development):

```
data/
├── client.db       SQLite install state (what is installed, at which version)
├── settings.json   server address and last discovery time
├── apps/           extracted applications and games
└── tmp/            in-flight downloads (swept on startup)
```

Because all paths are relative, the whole `client/` folder can be moved, copied or backed up
without reconfiguration. On a Deep Freeze machine, `data/` is restored to its clean state on
reboot, which is exactly the intended behaviour.

## API

All endpoints are loopback-only; the client never exposes anything to the LAN.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| GET | `/api/system/info` | App version, server URL, data directory, installed count |
| GET | `/api/catalog` | Server catalog annotated with local install state |
| GET | `/api/catalog/<id>` | One entry, including the manifest fields |
| GET | `/api/apps/installed` | Applications installed on this machine |
| POST | `/api/apps/<id>/install` | Download and extract (`{"force": true}` to re-download) |
| POST | `/api/apps/<id>/launch` | Start the installed application |
| DELETE | `/api/apps/<id>` | Remove the install row and its directory |
| GET | `/api/settings` | Stored settings |
| PUT | `/api/settings` | Set `server_url` |
| POST | `/api/settings/discover` | Broadcast a discovery probe and remember the reply |

### Catalog payload

`GET /api/catalog` returns the server's public fields plus local state:

```json
[
  {
    "id": 7,
    "title": "Warcraft III",
    "description": "Classic real-time strategy game.",
    "thumbnail": "a1b2c3d4e5f6.png",
    "installed": true,
    "installed_version": "1.0.0",
    "update_available": false
  }
]
```

`executable` is **not** part of the listing. It is disclosed per entry by the manifest
endpoint, so the client only learns the path for an application it is actually installing.

## Server contract required

The client assumes the following endpoints on the Portable Applications Server. All four are
implemented in `../server`.

| Method | Path | Status |
|---|---|---|
| GET | `/api/client/catalog` | ✅ `[{id, title, description, thumbnail, version}]` |
| GET | `/api/client/catalog/<id>/manifest` | ✅ `{id, title, version, executable, size_bytes}` |
| GET | `/api/distribution/<id>/download` | ✅ ZIP stream (chunked, no `Content-Length`) |
| UDP | broadcast on port 8758 | ✅ replies `{app, version, port}` |

The discovery probe payload is `b"PORTABLE_APPS_DISCOVER_V1"` sent to
`255.255.255.255:8758`; the server replies with `{"app", "version", "port"}`. `port` is a JSON
integer (a string or float is silently replaced with 8756 by `_parse_reply`). If the reply never
arrives, `POST /api/settings/discover` returns a readable 404 and the address can still be set
manually with `PUT /api/settings`.

**Version-based updates:** `GET /api/client/catalog` carries `version`, and
`api/catalog.py` sets `update_available` by comparing it with the installed version. The server
treats `version` as a free-form change marker compared verbatim, so an installation is only
refreshed after the administrator bumps it. A blank catalog version would disable update
detection entirely, so the server always publishes one (default `1.0.0`).

**Thumbnails:** the catalog's `thumbnail` is a bare filename. The server serves it from
`GET /api/files/thumbnail/<name>`, which is reachable from the LAN, but it sends no CORS
headers. The client UI will need a proxy route (or the server will need CORS) before it can
render covers cross-origin.


## Security notes

- **Zip-slip**: every archive member is resolved inside the target directory before anything
  is written; a member that escapes aborts the whole extraction.
- **Executable traversal**: the manifest's `executable` must be relative and must resolve
  inside `data/apps/<slug>`. Absolute paths, drive letters and `..` are rejected.
- **Staged extraction**: archives unpack into a sibling `.extracting` directory and are only
  moved into place after every member is written, so a failed download never leaves a
  half-installed application that looks launchable.
- **Detached launch**: the child process is started with `DETACHED_PROCESS` on Windows, so
  closing the client window does not kill the running game.

## Packaging

```powershell
build.bat
```

`build.bat` runs `npm run build` and then PyInstaller against `pyinstaller.spec` at the
project root. The spec produces an **onedir** bundle in `release\PortableApplicationsClient\`:

| Bundled as | Destination in the bundle | Read by |
|---|---|---|
| `dist/` | `_internal\dist\` | `paths.web_dir()` → `resource_root() / "dist"` |

`data/` is never bundled: `paths.base_dir()` returns `Path(sys.executable).parent` when
frozen, so the first run creates `data\client.db` beside the exe. Copying the release folder
therefore carries no stale state.

## Frontend wiring (TODO)

The Python side is complete; `src/App.tsx` is still the Vite starter template. To wire it:

1. Add `src/api/client.ts` with a `request<T>()` wrapper and typed calls for the endpoints
   above.
2. Replace the starter UI with a catalog grid: thumbnail, title, description, and an
   Install / Play / Update button driven by `installed` and `update_available`.
3. Add a Settings view backed by `GET`/`PUT /api/settings` and `POST /api/settings/discover`.
4. Show install progress — `POST /api/apps/<id>/install` is synchronous today; add a
   progress endpoint or a server-sent-events stream if the UI needs a live bar.
