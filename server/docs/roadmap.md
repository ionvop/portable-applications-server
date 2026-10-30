## Current state (verified)

**Backend is largely functional already.** `app.py`, `api/catalog.py`, `api/files.py`, `api/distribution.py`, `api/system.py`, `services/*`, `db.py`, `paths.py` implement real CRUD, path-traversal guards, thumbnail upload, ZIP building, and a SPA fallback. `smoke_test.py` exercises all of it.

**Frontend is 100% static.** `App.tsx` imports `catalogEntries`, `systemInfo`, `transfers`, `activity` from `mockData.ts` and passes them down as props. There is no `fetch`, no API client, no loading/error state. `FilesView` hardcodes `browseGta`; `Thumbnail` ignores `entry.thumbnail` and always renders a gradient; every button (`Add entry`, `Save changes`, `Delete`, `Browse`, `Replace`, `Open distribution link`) is a no-op.

**Three real functional blockers** beyond the mock data:
1. `config.HOST = "127.0.0.1"` — LAN clients cannot reach the server at all, which defeats §2.4 of the proposal.
2. `vite.config.ts` has no `server.proxy`, so `npm run dev` can't talk to Flask (and `base: "./"` means dev and prod differ).
3. `archive_service.build_archive` runs synchronously inside the request — a 4 GB game means minutes of silence before the first byte, and no progress is observable.

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

### Step 5 — Fix distribution for real LAN clients
- `config.HOST` → `"0.0.0.0"` for the WSGI bind, but keep PyWebView loading `http://127.0.0.1:<port>/`. Split into `BIND_HOST` and `UI_HOST`.
- Add a client-facing read endpoint (e.g. `GET /api/client/catalog`) returning only `id, title, description, thumbnail` — don't expose `directory`/`executable` to clients.
- Wire `Open distribution link` in `EntryDetailView` to `downloadUrl(entry.id)`.
- Verify from a second machine on the LAN.

**Done when:** a browser on another PC can list the catalog and download a ZIP.

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
- Verify the frozen exe writes `data` beside itself, not in `_MEIPASS`.
- Update `start.bat` and `README.md` accordingly.

**Done when:** the exe runs from a copied folder on a clean machine.

### Step 10 — Hardening
- Extend `smoke_test.py` with transfer/activity/storage assertions.
- Add a `pytest` wrapper so it runs in CI.
- Add a global `ApiError` toast in the UI so failed requests are never silent.
- Consider a shared-secret header for `/api/catalog` writes if clients share the network.

---

## Suggested order of attack

If you want the shortest path to "feels like a real app": **Steps 1 → 2 → 3 → 4**. That alone turns the prototype into a working catalog manager. **Step 5** is the one-line-ish fix that makes the core promise (LAN distribution) actually true. Steps 6–8 add the observability the UI already pretends to have. Steps 9–10 are release work.

One caution: don't wire `TransfersView`'s progress bars (Step 6) before Step 7 — you'll build a fake progress model you then have to throw away.