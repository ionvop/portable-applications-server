## Current state (verified)

**The Python side is essentially done; the React side is a mock-driven shell.**

- `backend` already implements the full contract: `GET /api/health`, `/api/system/info`, `/api/catalog` (server catalog + local install state), `/api/catalog/<id>` (manifest), `/api/apps/installed`, `POST /api/apps/<id>/install|launch`, `DELETE /api/apps/<id>`, `GET|PUT /api/settings`, `POST /api/settings/discover`. Services cover download streaming, zip-slip-safe staged extraction, traversal-safe launch, and atomic settings writes.
- `smoke_test.py` exercises catalog → install → skip-if-current → force → launch → path guards → remove against a stub server.
- `vite.config.ts` already proxies `/api` → `127.0.0.1:8757`, and `npm run dev:api` exists. **The dev loop from the server's Step 1 is already in place.**
- `App.tsx` imports `catalogApps`, `systemInfo`, `transfers` from `mock.ts`. Every button in `AppDetailView`, `LibraryView`, `DownloadsView`, and `SettingsView` is inert (several say so in the UI). `Cover.tsx` never renders an image. `AppShell` hardcodes "Connected".

**The gaps that matter, in order of how much they block:**

1. **`types.ts` does not match the API.** `CatalogApp` declares `version`, `size_bytes`, `executable`, `category`, `updated_at` — the client's `/api/catalog` returns none of those. It returns `{id, title, description, thumbnail, installed, installed_version, update_available}`. `version`/`size_bytes`/`executable` only exist on `/api/catalog/<id>`.
2. **No `src/api/` layer at all.** Nothing in `src` calls `fetch`.
3. **Install is synchronous.** `POST /api/apps/<id>/install` runs `ensure_installed` inline. A 4 GB game blocks the request for minutes with no progress — `install_service.ensure_installed` already accepts a `progress` callback that the API never passes.
4. **No transfer/job endpoint.** `DownloadsView` has no data source; the client backend has no `transfers` table.
5. **No thumbnail route.** The server serves `/api/files/thumbnail/<name>` without CORS, so the UI at `127.0.0.1:8757` cannot load covers cross-origin. `README.md` flags this.
6. **No error surface.** `ClientError` messages are well-written but nothing in the UI displays them.
7. **`README.md`'s "Frontend wiring (TODO)" is stale** — it claims `App.tsx` is the Vite starter template.

---

## Recommended increments

Each step is independently shippable. Don't start the next until the "done when" holds.

### Step 1 — Confirm the baseline ✅ (already done)
- `vite.config.ts` proxy, `dev:api` script, and `smoke_test.py` all exist.
- Run `python backend/smoke_test.py`, then `npm run dev:api` + `npm run dev`.

**Done when:** `curl localhost:5173/api/health` returns `{"status":"ok"}` and the smoke test is green.

### Step 2 — Align the TypeScript contract (no UI changes)
- Rewrite `types.ts` to mirror the wire shapes exactly:
  - `CatalogApp` → `{ id, title, description, thumbnail, installed, installed_version, update_available }`
  - New `CatalogDetail` → manifest fields (`version`, `executable`, `size_bytes`) + install state
  - New `Install` → `{ entry_id, title, directory, executable, version, installed_at }`
  - New `Settings` → `{ server_url, discovered_at }`, `DiscoveryReply`
  - Keep `SystemInfo` (it already matches `/api/system/info`)
- Delete `Transfer` for now; it comes back in Step 6 with a real shape.
- New `src/api/client.ts`: `request<T>()` wrapper, `ApiError` carrying the backend's `{"error": ...}` message, and typed calls for every endpoint.

**Done when:** `npm run build` passes and a temporary `console.log` in `App.tsx` prints real entries from a running server.

### Step 3 — Wire the read-only views
- `App.tsx`: replace the mock imports with `useEffect` + state for `systemInfo` and `catalog`; add `loading` / `error` states; pass them down.
- `CatalogView`: **drop the `games`/`apps` category filter** — the server has no category field. Replace with `All` / `Installed` / `Updates`. Drop the `size` and `updated` sorts (no data); keep title sort and search.
- `LibraryView`: source from `GET /api/apps/installed` rather than filtering the catalog — that survives an entry being deleted server-side. Use `installed_at` where the prototype used `updated_at`.
- `SettingsView`: render real `system` + `settings` values.
- `AppShell` / `NavBar`: real connection status instead of the hardcoded "Connected".

**Done when:** the store renders a real server catalog, and the Library reflects `client.db`.

### Step 4 — Thumbnail proxy
- New `GET /api/thumbnails/<name>` in the client backend that fetches `{server_url}/api/files/thumbnail/<name>` and caches it under `data/thumbnails/`.
- `Cover.tsx`: render `<img src={/api/thumbnails/${app.thumbnail}}>` when `thumbnail` is set, falling back to the existing gradient on `onError`.

**Done when:** covers appear in the grid and detail hero.

### Step 5 — Settings write path and discovery
- `SettingsView`: controlled input; `Save` → `PUT /api/settings`; `Discover on LAN` → `POST /api/settings/discover`; `Test connection` → a new `POST /api/settings/test` that calls the server's `/api/health` through `server_client` (the browser cannot do this directly — no CORS on the server).
- Surface the `ClientError` message inline on failure.

**Done when:** the address survives a restart, and discovery finds a running server.

### Step 6 — Install as a background job with progress
This is the step that makes the app feel real.
- New `backend/services/job_service.py`: an in-memory registry of `{id, entry_id, title, status, received_bytes, total_bytes, error}`; `POST /api/apps/<id>/install` starts a thread and returns `202` with the job; `GET /api/jobs` and `GET /api/jobs/<id>`.
- Pass `install_service.ensure_installed(progress=...)` into the job so `received_bytes` advances.
- Persist finished jobs to a `transfers` table (mirroring the server's schema) so Downloads history survives a restart; prune on startup like the server does.

**Done when:** installing a large app returns immediately and the progress bar advances.

### Step 7 — Wire the write actions
- `AppDetailView`: primary button → install (or launch when current); `Verify files` → `POST install {"force": true}`; show the job's progress inline. Replace the client-side `data\apps\<slug>` guess with the install row's real `directory`.
- `LibraryView`: `Play` → `POST /api/apps/<id>/launch`; trash → confirm + `DELETE`.
- `DownloadsView`: real active jobs + persisted history.

**Done when:** install → launch → remove round-trips through the UI.

### Step 8 — Global error surface
- An `ApiError` banner/toast in `AppShell` so no request fails silently.
- Decide on `Reset local storage`: either add `DELETE /api/apps` (remove all installs) or delete the button.

**Done when:** stopping the server produces a readable message instead of a blank screen.

### Step 9 — Refresh behaviour
- Poll `/api/jobs` while Downloads is open; refetch the catalog when an install completes; refetch on window focus.
- Either wire the `NavBar` search box to the catalog query or remove it (it currently duplicates `CatalogView`'s search).

**Done when:** the Library updates without a manual reload.

### Step 10 — Hardening
- Extend `smoke_test.py` for jobs, the thumbnail proxy, `settings/test`, and the launch/remove paths.
- Add a `pytest` wrapper.
- Fix the stale "Frontend wiring (TODO)" section in `README.md`.

**Done when:** every endpoint is covered and the docs match reality.

### Step 11 — Packaging verification
- `build.bat` already exists; verify the frozen exe serves `dist`, writes `data` beside the exe, and can install/launch from a copied folder.

**Done when:** the exe runs on a clean machine.

---

## Suggested order of attack

**Steps 2 → 3 → 4** turn the prototype into a working catalog browser — the biggest visible win for the least risk. **Steps 5 → 6 → 7** are the core promise: install, launch, remove. Steps 8–10 are polish and release work.

Two cautions:

- **Don't wire `DownloadsView` before Step 6.** The prototype's `Transfer` shape (`progress`, `received_bytes`, `total_bytes`, `directory`) is invented; building against it means throwing it away. Step 6 defines the real shape.
- **Two prototype features have no backend and need a decision, not code:** the `games`/`apps` category filter (the server publishes no category) and the per-card size/updated columns (only available per-entry via the manifest, which costs one `plan_archive` walk each). Dropping them from the grid and showing size on the detail page is the cheap path; adding `category` and `size_bytes` to the server's public catalog is the cross-repo path.