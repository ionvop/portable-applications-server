## Current state (verified)

**Steps 1–5 are complete.** The backend implements real CRUD, path-traversal guards, thumbnail upload, ZIP building, a SPA fallback, and a client-facing catalog. The frontend is fully wired to the API: `App.tsx` fetches `systemInfo` and `catalogEntries`, `EntryDetailView` round-trips create/update/delete, `FilesView` browses the real apps folder, and `Thumbnail` renders uploaded covers. `smoke_test.py` covers every endpoint (50 checks).

**LAN distribution works.** The WSGI server binds `0.0.0.0` while PyWebView loads `127.0.0.1`; `GET /api/client/catalog` exposes only `id, title, description, thumbnail`; `GET /client` serves a browser-usable catalog page; admin endpoints are loopback-only.

**Remaining functional gaps:**
1. `TransfersView` and the Dashboard activity feed still render `mockData.ts` — no transfer or activity tables exist yet (Step 6).
2. `archive_service.build_archive` runs synchronously inside the request — a 4 GB game means minutes of silence before the first byte, and no progress is observable (Step 7).
3. `FilesView` actions (`Open in file explorer`, `Rescan`, `Storage`) are still inert (Step 8).
4. No packaging spec yet, so the app only runs from source (Step 9).
5. The client application does not exist; `/client` is a stopgap (Step 11).

---

## Recommended increments

Each step is independently shippable and verifiable. Don't start the next until the "done when" holds.

### Step 1 — Establish a working dev loop
- Add `server.proxy` to `vite.config.ts` mapping `/api` → `http://127.0.0.1:8756`.
- Add a `dev:api` npm script (or document `python run.py` with the frontend served by Vite).
- Run `python backend/smoke_test.py` once to confirm the baseline is green.

**Done when:** `npm run dev` renders the UI and `curl localhost:5173/api/health` returns `{"status":"ok"}`.

### Step 2 — Add a typed API client (no UI changes yet)
- New `src/api/client.ts`: thin `request<T>()` wrapper with JSON parsing, non-2xx → thrown `ApiError` carrying the backend's `{"error": ...}` message.
- Typed functions: `getSystemInfo`, `listEntries`, `getEntry`, `createEntry`, `updateEntry`, `deleteEntry`, `browse`, `uploadThumbnail`, `downloadUrl(id)`.
- Keep `types.ts` as the single contract source; it already matches the backend shapes.

**Done when:** the client compiles and a temporary call in `App.tsx` logs real entries from SQLite.

### Step 3 — Wire the read-only views (biggest visible win)
- `App.tsx`: replace mock imports with `useEffect` + state for `systemInfo` and `catalogEntries`; add `loading` / `error` states.
- `DashboardView`: real `entry_count`, `lan_ip`, `port`, `apps_dir`. Drop the hardcoded "Uptime 3h 12m" or derive it from a new `started_at` in `/api/system/info`.
- `CatalogView`: already prop-driven — it will just work.
- `FilesView`: replace `browseRoot`/`browseGta` with `browse(path)` calls; make folder clicks navigate by joining `current.path` + name.
- `Thumbnail`: render `<img src={/api/files/thumbnail/${entry.thumbnail}}>` when `entry.thumbnail` is set, gradient otherwise.

**Done when:** adding a row to `catalog.db` by hand shows up in the UI after refresh, and folder navigation in Files reflects `apps` on disk.

### Step 4 — Wire the write paths
- `EntryDetailView`: convert `defaultValue` inputs to controlled state; `Save changes` → `PUT /api/catalog/:id`; `Delete` → confirm + `DELETE`; `Cancel` → refetch.
- `CatalogView`: `Add entry` → a create form (reuse `EntryDetailView` with `entry = null`, or a modal); the trash icon → `DELETE`.
- `EntryDetailView`: `Browse` → a small folder picker backed by `/api/files/browse`; `Replace` → `<input type="file">` → `POST /api/files/thumbnail` → store returned filename.
- Surface backend validation errors inline (the `CatalogError` messages are already user-readable).

**Done when:** full CRUD round-trips through the UI and survives a restart.

### Step 5 — Fix distribution for real LAN clients ✅
- `config.HOST` → `"0.0.0.0"` for the WSGI bind, but keep PyWebView loading `http://127.0.0.1:<port>/`. Split into `BIND_HOST` and `UI_HOST`.
- Add a client-facing read endpoint (e.g. `GET /api/client/catalog`) returning only `id, title, description, thumbnail` — don't expose `directory`/`executable` to clients.
- Wire `Open distribution link` in `EntryDetailView` to `downloadUrl(entry.id)`.
- Verify from a second machine on the LAN.

**Done when:** a browser on another PC can list the catalog and download a ZIP.

**Implemented:**
- `config.BIND_HOST = "0.0.0.0"` / `config.UI_HOST = "127.0.0.1"`; `main.py` binds `BIND_HOST` and PyWebView loads `UI_HOST`; `dev_server.py` binds `BIND_HOST` and prints the LAN client URL.
- New `backend/api/client.py` blueprint: `GET /api/client/catalog` and `GET /api/client/catalog/<id>`, both projected onto `{id, title, description, thumbnail}`.
- New server-rendered `GET /client` page (`backend/templates/client.html`) so a plain browser on another PC can browse the catalog and download ZIPs without the client app.
- `network_service.get_system_info` now reports `bind_host`, `ui_host`, and `client_url`; the Dashboard shows the client URL with a copy button, and `EntryDetailView` builds an absolute LAN download link.
- Added a loopback-only guard on `/api/catalog`, `/api/files`, `/api/system` so `0.0.0.0` does not expose admin writes to the LAN. Thumbnail reads and `/api/client/*` stay open.
- `smoke_test.py` covers the client endpoints, the `/client` page, and the guard (50 checks green).

> **Note:** the `/client` page is a deliberate stopgap. It proves the LAN path works and gives clients something usable today, but it is not the client application. The real client app is deferred to Step 11 — the server is being finished first.

### Step 6 — Make Transfers and Activity real
- Add a `transfers` table (`id, entry_id, client_ip, size_bytes, status, started_at, finished_at`) and an `activity` table, or derive activity from transfers.
- Record a row in `distribution.download` before streaming, update on `call_on_close` (success) and on exception (failed).
- New `GET /api/transfers` and `GET /api/activity`; replace the mock props in `TransfersView` and `DashboardView`.
- Note: `progress` cannot be real with `send_file` — either drop the progress bar to "in progress" or move to Step 7's streaming approach.

**Done when:** downloading from a client produces a visible transfer row that flips to `completed`.

### Step 7 — Non-blocking archive streaming
- Replace `build_archive` + `send_file` with a generator that writes ZIP entries to the response as it walks the tree (or a background build with a `GET /api/distribution/:id/status` poll).
- This removes the long silent wait and makes `progress` meaningful.
- Keep `sweep_stale_archives` for the background-build variant.

**Done when:** a large game starts transferring within a second and the UI shows real progress.

### Step 8 — Files view actions
- `Open in file explorer` → new `POST /api/files/reveal` using `os.startfile` (Windows-only, guard it).
- `Rescan directory` → just re-call `browse`.
- `Storage` card → new `GET /api/system/storage` computing `apps/`, `thumbnails/`, `tmp/` sizes and free disk space via `shutil.disk_usage`.

**Done when:** the storage numbers match the filesystem.

### Step 9 — Packaging
- Add a `pyinstaller.spec` bundling `dist` as data (`_MEIPASS`), with `paths.resource_root()` already handling it.
- Bundle `backend/templates/` too — the `/client` page from Step 5 is a Jinja template and will 500 in the frozen exe without it.
- Verify the frozen exe writes `data` beside itself, not in `_MEIPASS`.
- Update `start.bat` and `README.md` accordingly.

**Done when:** the exe runs from a copied folder on a clean machine.

### Step 10 — Hardening
- Extend `smoke_test.py` with transfer/activity/storage assertions.
- Add a `pytest` wrapper so it runs in CI.
- Add a global `ApiError` toast in the UI so failed requests are never silent.
- Consider a shared-secret header for `/api/catalog` writes if clients share the network.

**Done when:** the smoke test covers every endpoint and the UI never fails silently.

### Step 11 — Client application (deferred)

The server is finished first. Until this step lands, client computers use the
server-rendered `/client` page from Step 5, which can list the catalog and
download ZIPs but cannot install or launch anything.

- Build the client app (PyWebView + PyInstaller, mirroring the server) that talks to `GET /api/client/catalog`.
- Download a ZIP into a local apps folder, extract it, and record the installed version.
- Launch an application using the executable path the server keeps private — the client must get it from a dedicated endpoint (e.g. `GET /api/client/catalog/<id>/launch`) rather than from the catalog listing.
- Update check: compare a content hash or `updated_at` against the local install and re-download when stale.
- Decide the trust model: shared-secret header, per-client token, or LAN-only binding. The Step 5 loopback guard already keeps admin writes off the network.
- Add CORS or a same-origin proxy if the client UI is served separately from the API.

**Done when:** a fresh client machine can install, launch, and update an application entirely from the server.

---

## Suggested order of attack

If you want the shortest path to "feels like a real app": **Steps 1 → 2 → 3 → 4**. That alone turns the prototype into a working catalog manager. **Step 5** is the one-line-ish fix that makes the core promise (LAN distribution) actually true. Steps 6–8 add the observability the UI already pretends to have. Steps 9–10 are release work. **Step 11** is the separate client application, deliberately last so the server contract is stable before a second codebase depends on it.

One caution: don't wire `TransfersView`'s progress bars (Step 6) before Step 7 — you'll build a fake progress model you then have to throw away.