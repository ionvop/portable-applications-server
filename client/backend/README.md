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

`python -m pytest` runs the same suite through a wrapper in `backend/tests/` that redirects
`data/` to a temporary directory, so it never disturbs a real install. Install the runner
with `pip install -r backend/requirements-dev.txt`; the runtime set in `requirements.txt`
stays free of test dependencies, and `pyinstaller.spec` excludes `pytest` from the bundle.

## Data layout

Everything writable lives in `data/` beside the executable (or beside `run.py` in
development):

```
data/
├── client.db       SQLite install state (what is installed, at which version)
├── settings.json   server address and last discovery time
├── apps/           extracted applications and games
├── thumbnails/     cached cover images proxied from the server
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
| POST | `/api/apps/<id>/install` | Start a background install job (`202`; `{"force": true}` to re-download) |
| POST | `/api/apps/<id>/launch` | Start the installed application |
| DELETE | `/api/apps/<id>` | Remove the install row and its directory |
| DELETE | `/api/apps` | Reset local storage: every install, cached cover and transfer row (`409` while an install runs) |
| GET | `/api/jobs` | Active install jobs first, then finished history |
| GET | `/api/jobs/<id>` | One job, live or historical |
| GET | `/api/settings` | Stored settings |
| PUT | `/api/settings` | Set `server_url` |
| POST | `/api/settings/test` | Probe a server's `/api/health` (read-only; optional `{"server_url": …}`) |
| POST | `/api/settings/discover` | Broadcast a discovery probe and remember the reply |
| GET | `/api/thumbnails/<name>` | Proxy and cache a cover image from the server |

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

### Install jobs

`POST /api/apps/<id>/install` does **not** wait for the download. It records a row, starts a
worker thread and answers `202` with the job, so a multi-gigabyte game never blocks the
request:

```json
{
  "id": 19,
  "entry_id": 22,
  "title": "JoyToKey",
  "status": "downloading",
  "received_bytes": 827976,
  "total_bytes": 1850501,
  "error": "",
  "started_at": "2026-11-03 01:27:47",
  "finished_at": null
}
```

`status` moves through `queued` → `downloading` → `extracting` → `completed`, or ends at
`failed` with `error` set to the message the UI shows verbatim. Installing an entry that is
already installing returns the **running** job rather than starting a second download into the
same folder.

`total_bytes` is an estimate. The server streams the archive chunked, so there is no
`Content-Length`; the client falls back to the manifest's `size_bytes`, which is the
*uncompressed* size and therefore larger than the compressed archive. The UI prefixes it with
`~` and clamps the bar at 100%. A completed job rewrites `total_bytes` to the bytes actually
transferred, so history always reads 100%.

Jobs are polled (`GET /api/jobs`), not streamed: the client is a single-window desktop app and
a one-second poll is simpler than an SSE endpoint that has to survive a window reload. The UI
only polls while something is running.

### Transfer history

Every job is a row in the `transfers` table, mirroring the server's schema so both sides age
out history the same way. Two deliberate differences: `title` is denormalized (the client has
no catalog table to join against) and `error` carries the failure message.

Only *non-terminal* jobs live in memory. That is why a restart cannot resurrect a phantom
progress bar: `reconcile_stale_jobs()` marks any leftover running row `failed` on startup, and
`prune_jobs()` trims the table to `TRANSFER_HISTORY_LIMIT` (500) rows.

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
headers, so the browser cannot load it cross-origin. `GET /api/thumbnails/<name>` closes that
gap: it fetches the image through `server_client.fetch_thumbnail`, writes it atomically to
`data/thumbnails/`, and serves it from the client's own origin. The UI uses
`<img src="/api/thumbnails/<name>">` and falls back to the gradient monogram on `onError`.

Caching is permanent (`max-age` one year) because the server names uploads with a random hex
prefix: a replaced cover always arrives under a new filename, so a cached entry can never be
stale. The route rejects anything that is not a bare filename (separators, `..`, drive
letters) with `400`, and refuses responses that are not `image/*` or exceed 5 MB.


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

## Frontend wiring

The React UI is wired to every endpoint above. The pieces worth knowing about:

- **`src/api/client.ts` is the only fetch layer.** `request<T>()` wraps `fetch`, converts a
  non-2xx body into an `ApiError` carrying the backend's `{"error": …}` message, and every
  endpoint has a typed function. `src/types.ts` mirrors the wire shapes exactly.
- **`App.tsx` owns the state.** It loads `system` first (the gate), then `catalog`, `installs`,
  `settings` and `jobs` together, keeping `systemError` (full-screen) separate from
  `catalogError` (inline in the Store). It also owns the three write paths — `startInstall`,
  `startLaunch`, `removeInstall` — and the views keep only transient `busy`/`error` state.
- **Installs are followed by polling.** `App.tsx` polls `GET /api/jobs` once a second *only*
  while a job is active, and refetches `installs` + `catalog` when one leaves the active set,
  so the Library and Store update without a reload. `DownloadsView` and `AppDetailView` share
  the `JobProgress` component, which is where the `~` estimate prefix and the 100% clamp live.
- **Errors are never silent.** `ErrorBanner` renders a dismissible `alert alert-error` inside
  `AppShell`, so every screen inherits it. The job poll escalates only after three consecutive
  failures, so a single dropped tick does not flash a banner.
- **Refresh on focus.** `window` `focus` and `document` `visibilitychange` trigger a partial
  refresh, throttled to once every five seconds and skipped while a job is running or a full
  load is in flight.
- **`SettingsView`** saves, discovers and tests the address, and surfaces `ClientError`
  messages inline. `POST /api/settings/test` is read-only, so a draft address can be verified
  before it is saved.
- **`Cover`** renders `<img src="/api/thumbnails/<name>">` and falls back to a gradient
  monogram on `onError`, so a missing cover degrades instead of showing a broken image.
