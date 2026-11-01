# Portable Applications Server — Python Backend

Desktop shell (PyWebView) + HTTP API (Flask) + SQLite catalog + ZIP distribution.

## Requirements

- Python 3.10+
- Node.js (only to build the frontend)

## Setup

```powershell
cd server
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

A PyWebView window opens at `http://127.0.0.1:8756/`. Closing the window stops the server.

## Development (hot reload)

`run.py` requires a built frontend and opens a desktop window, which is awkward while
editing the UI. For development, run the API headless and let Vite serve the frontend:

```powershell
# terminal 1 — Flask API on http://127.0.0.1:8756
npm run dev:api        # equivalent to: python backend/dev_server.py

# terminal 2 — Vite dev server on http://localhost:5173
npm run dev
```

`vite.config.ts` proxies `/api` to `http://127.0.0.1:8756`, so the frontend can call
`/api/...` on its own origin in both development and production. Verify with:

```powershell
curl http://localhost:5173/api/health   # {"status":"ok"}
```

`backend/dev_server.py` skips the PyWebView window and the `dist/` existence check, so no
build is needed while iterating. Run `python backend/smoke_test.py` to check the API
baseline without starting a server.

## Data layout

Everything writable lives in `data/` beside the executable (or beside `run.py` in development):

```
data/
├── catalog.db      SQLite catalog
├── apps/           managed application and game directories
├── thumbnails/     uploaded cover images
└── tmp/            temporary ZIP archives (swept on startup)
```

Because all paths are relative, the whole `server/` folder can be moved, copied or backed up
without reconfiguration.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| GET | `/api/system/info` | LAN IP, port, discovery port, version, data directory, entry count |
| GET | `/api/catalog` | List catalog entries |
| GET | `/api/catalog/<id>` | Fetch one entry |
| POST | `/api/catalog` | Create an entry |
| PUT | `/api/catalog/<id>` | Update an entry |
| DELETE | `/api/catalog/<id>` | Delete an entry |
| GET | `/api/files/browse?path=` | List directories/files inside `data/apps` |
| POST | `/api/files/thumbnail` | Upload a cover image (multipart `file`) |
| GET | `/api/files/thumbnail/<name>` | Serve a cover image |
| GET | `/api/distribution/<id>/download` | Download the entry's directory as a ZIP |
| GET | `/api/client/catalog` | Client-safe listing (see below) |
| GET | `/api/client/catalog/<id>` | One client-safe entry |
| GET | `/api/client/catalog/<id>/manifest` | Install manifest: version, executable, size |

### Catalog payload

```json
{
  "title": "Warcraft III",
  "description": "Classic real-time strategy game.",
  "thumbnail": "a1b2c3d4e5f6.png",
  "directory": "warcraft-iii",
  "executable": "Warcraft III.exe",
  "version": "1.0.0"
}
```

`directory` is resolved inside `data/apps` and may not escape it. `executable` must be a
relative path within that directory.

`version` is a free-form string (max 32 characters) defaulting to `1.0.0`. Clients compare it
**verbatim** against the version they recorded at install time, so it is a change marker
rather than a parsed semantic version: bump it after changing an application's files. A blank
value falls back to `1.0.0`; leaving it unchanged means clients never re-download.

## Client contract

The client application (`../client`) depends on exactly four things:

| Method | Path | Returns |
|---|---|---|
| GET | `/api/client/catalog` | `[{id, title, description, thumbnail, version}]` |
| GET | `/api/client/catalog/<id>/manifest` | `{id, title, version, executable, size_bytes}` |
| GET | `/api/distribution/<id>/download` | ZIP stream |
| UDP | broadcast port 8758 | `{"app", "version", "port"}` |

The catalog listing omits `directory` and `executable`; the manifest is the only endpoint
that discloses `executable`, and only for the entry the client has chosen to install. It stays
relative to that entry's own directory.

`size_bytes` is the uncompressed total of the application directory, computed on demand by
walking the tree (the same walk the streaming download uses). It lets a client check free
space before starting. A missing catalog entry and a missing application directory both answer
404 with an `{"error": ...}` body, which the client shows verbatim.

Downloads are streamed and chunked, so the compressed size is not known when the response
starts and **no `Content-Length` is sent**. The client already treats a missing length as
indeterminate progress.

## LAN discovery

The server answers client auto-discovery with a UDP responder on port 8758
(`config.DISCOVERY_PORT`). A client broadcasts the exact payload
`b"PORTABLE_APPS_DISCOVER_V1"` to `255.255.255.255:8758`; the server replies with:

```json
{"app": "Portable Applications Server", "version": "0.1.0", "port": 8756}
```

`port` must remain a JSON integer — the client validates it with `isinstance(port, int)` and
silently falls back to 8756 for a string or float. Any packet that is not the magic payload is
ignored, so unrelated UDP traffic on this port is never answered.

The responder is a daemon thread started by `main.py` and `dev_server.py`. If it cannot bind
the port (already in use, or blocked), the error is printed and the HTTP server continues
normally — discovery is a convenience, not a requirement. Windows Firewall prompts on the
first bind; allow it for private networks so clients can find the server automatically.

## Packaging

```powershell
build.bat
```

`build.bat` runs `npm run build` and then PyInstaller against `pyinstaller.spec` at the
project root. The spec produces an **onedir** bundle in `release\PortableApplicationsServer\`:

| Bundled as | Destination in the bundle | Read by |
|---|---|---|
| `dist/` | `_internal\dist\` | `paths.web_dir()` → `resource_root() / "dist"` |
| `backend/templates/` | `_internal\backend\templates\` | `create_app()` → `resource_root() / "backend" / "templates"` |

`backend/templates/` must be bundled: `/client` is a Jinja page, and without it the frozen
executable answers 500 with `TemplateNotFound`.

The executable reads bundled resources from `sys._MEIPASS` and writes its `data/` folder
next to itself (`paths.base_dir()` returns the executable's directory when frozen), keeping
the build portable. To verify a build, copy `release\PortableApplicationsServer\` to another
folder, run the exe, and confirm a fresh `data\catalog.db` appears beside it.

The build is windowed (`console=False`), so startup errors are not printed to a console. If
the app exits immediately, check that `_internal\dist\index.html` exists — `main.py` refuses
to start without it.

## Module map

| Module | Responsibility |
|---|---|
| `config.py` | Host, port, version, directory names, limits |
| `paths.py` | Portable path resolution (frozen vs. development) |
| `db.py` | SQLite connection helper and schema |
| `models.py` | `CatalogEntry` dataclass |
| `app.py` | Flask factory, SPA serving, error handlers |
| `main.py` | Server thread + PyWebView window lifecycle |
| `api/` | HTTP blueprints (catalog, files, distribution, system) |
| `services/` | Catalog logic, ZIP archives, network discovery (LAN IP + UDP responder) |
