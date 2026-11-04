## Current state (verified)

**Steps 1–9 are done: the client renders a real server catalog, a real local library, real cover art, a working Settings write path, installs that run in the background with live progress, working install/launch/remove actions, a global error surface, and refresh-on-focus.**

- `backend` already implements the full contract: `GET /api/health`, `/api/system/info`, `/api/catalog` (server catalog + local install state), `/api/catalog/<id>` (manifest), `/api/apps/installed`, `POST /api/apps/<id>/install|launch`, `DELETE /api/apps/<id>`, `GET|PUT /api/settings`, `POST /api/settings/discover`. Services cover download streaming, zip-slip-safe staged extraction, traversal-safe launch, and atomic settings writes.
- `smoke_test.py` exercises catalog → install → skip-if-current → force → launch → path guards → remove against a stub server.
- `vite.config.ts` already proxies `/api` → `127.0.0.1:8757`, and `npm run dev:api` exists.
- `types.ts` mirrors the wire exactly, and `src/api/client.ts` is the only fetch layer (`request<T>()`, `ApiError`, typed calls for all 11 endpoints).
- `App.tsx` fetches `system`, `catalog`, `installs` and `settings` on mount, keeps `loading` / `systemError` / `catalogError` separate, and derives a `ConnectionState` (`connected` / `unreachable` / `unconfigured`) that the navbar, footer and Settings all render.
- `CatalogView` filters `All` / `Installed` / `Updates` with title sort and search. `LibraryView` reads `GET /api/apps/installed` and shows `installed_at`. `SettingsView` renders the real `system` + `settings` payloads.

**The gaps that remain:**

1. ~~**Install is synchronous.**~~ **Done in Step 6** — installs run on a worker thread and the request returns `202` immediately.
2. ~~**No transfer/job endpoint.**~~ **Done in Step 6** — `GET /api/jobs` and `GET /api/jobs/<id>` read a `transfers` table that survives a restart.
3. ~~**No thumbnail route.**~~ **Done in Step 4** — `GET /api/thumbnails/<name>` proxies and caches covers under `data/thumbnails/`, and `Cover.tsx` renders them with the gradient as fallback.
4. ~~**Write actions are inert.**~~ **Done in Step 7** — install/verify, Play and trash all
   round-trip through the backend.
5. **`README.md`'s "Frontend wiring (TODO)" is stale** — it claims `App.tsx` is the Vite starter template.

---

## Recommended increments

Each step is independently shippable. Don't start the next until the "done when" holds.

### Step 1 — Confirm the baseline ✅ (already done)
- `vite.config.ts` proxy, `dev:api` script, and `smoke_test.py` all exist.
- Run `python backend/smoke_test.py`, then `npm run dev:api` + `npm run dev`.

**Done when:** `curl localhost:5173/api/health` returns `{"status":"ok"}` and the smoke test is green.

### Step 2 — Align the TypeScript contract (no UI changes) ✅
- Rewrite `types.ts` to mirror the wire shapes exactly:
  - `CatalogApp` → `{ id, title, description, thumbnail, installed, installed_version, update_available }`
  - New `CatalogDetail` → manifest fields (`version`, `executable`, `size_bytes`) + install state
  - New `Install` → `{ entry_id, title, directory, executable, version, installed_at }`
  - New `Settings` → `{ server_url, discovered_at }`, `DiscoveryReply`
  - Keep `SystemInfo` (it already matches `/api/system/info`)
- Delete `Transfer` for now; it comes back in Step 6 with a real shape.
- New `src/api/client.ts`: `request<T>()` wrapper, `ApiError` carrying the backend's `{"error": ...}` message, and typed calls for every endpoint.

**Done when:** `npm run build` passes and a temporary `console.log` in `App.tsx` prints real entries from a running server.

### Step 3 — Wire the read-only views ✅
- `App.tsx`: replace the mock imports with `useEffect` + state for `systemInfo` and `catalog`; add `loading` / `error` states; pass them down.
- `CatalogView`: **drop the `games`/`apps` category filter** — the server has no category field. Replace with `All` / `Installed` / `Updates`. Drop the `size` and `updated` sorts (no data); keep title sort and search.
- `LibraryView`: source from `GET /api/apps/installed` rather than filtering the catalog — that survives an entry being deleted server-side. Use `installed_at` where the prototype used `updated_at`.
- `SettingsView`: render real `system` + `settings` values.
- `AppShell` / `NavBar`: real connection status instead of the hardcoded "Connected".

**Done when:** the store renders a real server catalog, and the Library reflects `client.db`.

**Completed.** Notes on how it landed:

- `App.tsx` loads `system` first (it is the gate), then fetches `catalog`, `installs` and `settings` together with `Promise.allSettled`. A failed catalog fetch no longer blanks the shell: the Store shows an inline `ErrorNotice` with Retry while the Library and Settings keep working from local data. A failed `system` fetch is the only full-screen failure.
- `ConnectionState` (`connected` / `unreachable` / `unconfigured`) is **derived**, not probed — there is no `/api/settings/test` until Step 5. `src/lib/connection.ts` maps each state to its label, dot and badge classes so the navbar, footer and Settings cannot drift apart.
- An empty `server_url` short-circuits the catalog request instead of letting it 503, so the UI can say "No server set" rather than "Server unreachable".
- `LibraryView` takes `installs` as its list source and uses the catalog only as a lookup for `update_available`. An install whose catalog entry was deleted server-side still renders, badged "Local only", and opens a synthesized detail view.
- `Cover`'s prop was narrowed to `{ id, title }` so install rows render without fabricating a `CatalogApp`.
- `SettingsView` lost the invented "42% of the local storage quota" bar; it now reports the real `installed_count`.
- Verified against a live server: catalog listed 3 entries, installing JoyToKey produced an install row, and stopping the server left `/api/apps/installed` working while `/api/catalog` returned 503.

### Step 4 — Thumbnail proxy ✅
- New `GET /api/thumbnails/<name>` in the client backend that fetches `{server_url}/api/files/thumbnail/<name>` and caches it under `data/thumbnails/`.
- `Cover.tsx`: render `<img src={/api/thumbnails/${app.thumbnail}}>` when `thumbnail` is set, falling back to the existing gradient on `onError`.

**Done when:** covers appear in the grid and detail hero.

**Completed.** Notes on how it landed:

- `backend/api/thumbnails.py` validates the name as a bare filename (no separators, `..` or drive colon → `400`), serves a cache hit with `max-age` of one year, and on a miss fetches through `server_client.fetch_thumbnail` and writes the file atomically (temp file + `os.replace`, the same pattern as `settings._write`).
- `server_client.fetch_thumbnail` rejects non-`image/*` responses and anything over `config.MAX_THUMBNAIL_BYTES` (5 MB), and maps a server `404` to a `404` rather than a generic upstream error.
- Caching is permanent by design: the server names uploads `uuid4().hex + suffix`, so a replaced cover always has a new filename and a cached entry can never be stale. No invalidation endpoint is needed, and `data/` is wiped by Deep Freeze anyway.
- `Cover` remembers *which* source failed rather than a boolean, so a tile that gains a new thumbnail retries instead of inheriting the old failure. The gradient stays painted underneath, so a broken cover degrades to the monogram rather than a broken-image icon.
- `LibraryView` now passes `entry?.thumbnail` into its row `Cover`; `CatalogView` and `AppDetailView` already passed the whole `CatalogApp`.
- `smoke_test.py` gained a stub `/api/files/thumbnail/<name>` plus checks for the 200 round-trip, content type, on-disk cache, cache-hit short-circuit, traversal rejection and 404.

### Step 5 — Settings write path and discovery ✅
- `SettingsView`: controlled input; `Save` → `PUT /api/settings`; `Discover on LAN` → `POST /api/settings/discover`; `Test connection` → a new `POST /api/settings/test` that calls the server's `/api/health` through `server_client` (the browser cannot do this directly — no CORS on the server).
- Surface the `ClientError` message inline on failure.

**Done when:** the address survives a restart, and discovery finds a running server.

**Completed.** Notes on how it landed:

- `server_client.check_health` reuses `_get_json`, so a dead server produces the same readable "Could not reach the server at …" 503 as the catalog path, and a reachable server that answers anything other than `{"status": "ok"}` is a 502 rather than a false success.
- `POST /api/settings/test` is **read-only**: it accepts an optional `{"server_url": …}` so the UI can verify an address *before* saving it, falls back to the stored URL when the body is empty, and never writes. Only `PUT` and `/discover` persist.
- `SettingsView` holds the address as a `draft: string | null` where `null` means "show the stored value". A successful save or discovery sets it back to `null`, so the authoritative payload takes over without an effect syncing state (which would trip `react/set-state-in-effect`).
- `busy: "save" | "discover" | "test" | null` puts a spinner on the active button and disables all three, so a slow discovery cannot be double-fired. `Save` is additionally disabled until the draft actually differs from the stored value (trailing slashes ignored).
- Failures render as a red `role="alert"` line and successes as a green `role="status"` line under the buttons, both fed from `ApiError.message` — the backend's `ClientError` text reaches the user verbatim.
- `App.tsx` gained `handleSettingsChanged`: it applies the new settings immediately, refetches `system` (so the navbar badge and footer URL update) and refetches the catalog against the new address. Clearing the address short-circuits the catalog fetch, mirroring the mount-time behaviour so the Store says "No server set" rather than "Server unreachable".
- Verified live: `PUT` wrote `data/settings.json`, `POST /api/settings/test` returned `{"status":"ok","server_url":"http://127.0.0.1:8756"}`, `POST /api/settings/discover` found the running server at `http://192.168.254.106:8756` and persisted `discovered_at`, and the address was still there after restarting the API.
- `smoke_test.py` gained a stub `/api/health` plus nine checks: success, stored-URL fallback, bad URL, non-string body, dead port (503 + message), no URL at all (400), and that testing never persists.

### Step 6 — Install as a background job with progress ✅
This is the step that makes the app feel real.
- New `backend/services/job_service.py`: an in-memory registry of `{id, entry_id, title, status, received_bytes, total_bytes, error}`; `POST /api/apps/<id>/install` starts a thread and returns `202` with the job; `GET /api/jobs` and `GET /api/jobs/<id>`.
- Pass `install_service.ensure_installed(progress=...)` into the job so `received_bytes` advances.
- Persist finished jobs to a `transfers` table (mirroring the server's schema) so Downloads history survives a restart; prune on startup like the server does.

**Done when:** installing a large app returns immediately and the progress bar advances.

**Completed.** Notes on how it landed:

- Job ids **are** `transfers.id` values: the row is inserted before the thread starts, so the id
  the API returns is the id the history will show and `GET /api/jobs/<id>` needs no lookup table.
- Only *non-terminal* jobs live in memory. Terminal state is read from SQLite, which is why a
  restart cannot resurrect a phantom progress bar: `reconcile_stale_jobs()` marks leftover
  running rows `failed` on startup and `prune_jobs()` trims to `TRANSFER_HISTORY_LIMIT` (500).
- `POST /api/apps/<id>/install` always answers `202` + job, even when the entry is already
  current — the job simply completes without downloading. One response shape, no special case.
- A second install request for an entry that is already installing returns the **running** job
  instead of starting a competing download into the same directory.
- `ensure_installed` gained `phase` and `on_manifest` callbacks. `phase` distinguishes
  downloading from extracting; `on_manifest` lets the job adopt the real title as soon as the
  server answers, so the bar is labelled while it runs rather than after it finishes.
- **`total_bytes` is an estimate.** The server streams chunked with no `Content-Length`, so the
  client falls back to the manifest's `size_bytes` — which is the *uncompressed* size and
  therefore larger than the compressed archive. Live verification showed a bar stalling at 45%.
  The UI now prefixes the total with `~` and clamps at 100%, and a completed job rewrites
  `total_bytes` to the bytes actually transferred so history always reads 100%.
- `DownloadsView` renders active jobs with a daisyUI `progress` bar plus a history list. `App.tsx`
  polls `/api/jobs` every second **only while something is running**, and refetches `installs` +
  `catalog` when a job leaves the active set, so the Library and Store update without a reload.
- Verified live against the real server: `POST` returned in 233 ms with a `queued` job, the bar
  advanced through `downloading` → `extracting` → `completed`, history survived an API restart,
  and a hand-inserted `downloading` row was reconciled to `failed` on the next start.
- `smoke_test.py` gained a `wait_for_job` poll helper and 22 checks: job shape, completion,
  byte counts, duplicate-install reuse, partial progress observed mid-download, a failed job
  carrying the server's message, and stale-row reconciliation.

### Step 7 — Wire the write actions ✅
- `AppDetailView`: primary button → install (or launch when current); `Verify files` → `POST install {"force": true}`; show the job's progress inline. Replace the client-side `data\apps\<slug>` guess with the install row's real `directory`.
- `LibraryView`: `Play` → `POST /api/apps/<id>/launch`; trash → confirm + `DELETE`.
- ~~`DownloadsView`: real active jobs + persisted history.~~ **Done in Step 6** — the screen
  renders live progress and history; Step 7 only needs to add per-job actions if wanted.

**Done when:** install → launch → remove round-trips through the UI.

**Completed.** Notes on how it landed:

- `App.tsx` owns the three write paths (`startInstall`, `startLaunch`, `removeInstall`) and the
  views own only transient `busy`/`error`/`notice` state — the same split `SettingsView` uses.
  Handlers rethrow, so `ApiError.message` reaches the screen verbatim.
- **`startInstall` registers the returned job locally.** The poll loop only runs while `jobs`
  holds an active job, so without this an install started from the detail screen would never
  show progress and its completion would never trigger the Library/Store refresh. If the job
  comes back already terminal (tiny app, or the entry was current) it calls `refreshAfterInstall`
  directly, because no poll will ever observe that transition.
- `selectedApp` is a snapshot taken on click, so it went stale the moment an install finished.
  `App.tsx` now derives `detailApp` from the freshly fetched catalog (falling back to the
  snapshot when the entry is no longer listed), which is what flips the button to `Play`.
- `AppDetailView` renders `install.directory` and `install.executable` from the install row
  instead of the old placeholder strings, and shows the running job's progress inline via the
  new shared `JobProgress` component (also used by `DownloadsView`, so the `~` estimate prefix
  and 100% clamp live in one place).
- Removal confirmation is a native `<dialog class="modal">` in a new `ConfirmDialog` component:
  `window.confirm` is unreliable inside pywebview's WebView2 renderer, and the native dialog
  gives focus trapping, the backdrop and Escape for free.
- Verified live against the real server: install → `completed` with the row written, launch →
  `pid` returned and the process observed running, `DELETE` → row and directory both gone.
- `npm run build` and `npm run lint` clean; `smoke_test.py` still passes in full.

### Step 8 — Global error surface ✅
- An `ApiError` banner/toast in `AppShell` so no request fails silently.
- Decide on `Reset local storage`: either add `DELETE /api/apps` (remove all installs) or delete the button.

**Done when:** stopping the server produces a readable message instead of a blank screen.

**Completed.** Notes on how it landed:

- New `src/components/ErrorBanner.tsx` renders a daisyUI `alert alert-error` directly under the
  navbar, inside `AppShell`, so every screen inherits it. It is **dismissible and persistent**
  rather than an auto-hiding toast: a message that disappears while the user is watching a
  download is a message they miss. It carries an optional "Try again" that re-runs `load()`.
- `App.tsx` gained one `actionError` state fed by a `messageFor` helper. Four paths that used to
  swallow failures now report: the mount-time `getInstalled`/`getSettings`/`getJobs` reads (which
  still degrade to empty, but no longer pretend the library is empty), `refreshAfterInstall`'s
  `allSettled` rejections, the `getSystemInfo` refresh after a settings save, and the job poll.
- **The job poll escalates instead of spamming.** A single failed tick is transient — the next
  one retries in a second — so `pollFailures` counts consecutive misses and only the third
  raises the banner. A successful poll resets the counter.
- `DELETE /api/apps` is the bulk counterpart of `DELETE /api/apps/<id>`: it removes every install
  row and directory, the cached covers under `data/thumbnails/`, leftover `data/tmp/*.zip` and
  the `transfers` history (which would otherwise list installs whose files are gone). It keeps
  `data/settings.json`, because wiping the server address would strand the client.
- The reset **refuses with `409` while an install is running**. The worker is writing into
  `data/apps` and `data/tmp`, so deleting those trees mid-transfer would fail the job with a
  confusing error instead of a clear one. `job_service.has_active_jobs()` is the guard, imported
  lazily inside `install_service.reset_local_storage()` because `job_service` already imports
  `install_service`.
- `SettingsView`'s permanently disabled "Unavailable in prototype" button is now a real action:
  it opens the shared `ConfirmDialog`, shows a spinner while it runs, and reports the count
  removed. It is disabled when `installed_count` is 0, and its outcome lines are separate from
  the address field's so one cannot clear the other.
- `smoke_test.py` gained a "reset local storage" section: reinstall → reset → `200` with
  `removed == 1`, install row/directory/thumbnail cache/transfer history all gone, the server
  address preserved, a second reset reporting `removed == 0`, and a `409` (with the install row
  intact) when a reset is attempted while a worker is parked mid-download.

### Step 9 — Refresh behaviour ✅
- ~~Poll `/api/jobs` while Downloads is open; refetch the catalog when an install completes.~~
  **Done in Step 6** — `App.tsx` polls only while a job is active and refreshes `installs` +
  `catalog` when one finishes.
- ~~Refetch on window focus.~~ **Done** — see below.
- ~~Either wire the `NavBar` search box to the catalog query or remove it.~~ **Wired** — the
  navbar box and `CatalogView`'s box now edit one shared query.

**Done when:** the Library updates without a manual reload.

**Completed.** Notes on how it landed:

- `App.tsx` gained `refreshOnFocus`: one `Promise.allSettled` over `getInstalled()`, `getCatalog()`
  and `getJobs()`, writing `installs`, `catalog`/`catalogError`, `jobs` and `activeJobIds.current`
  exactly the way `refreshAfterInstall` and `refreshJobs` do. The catalog request is **skipped**
  (resolved as `null`, not rejected) when `server_url` is empty, so an unconfigured client does not
  paint a "server unreachable" card just because the window was clicked.
- The listeners are `window` `focus` **and** `document` `visibilitychange`, because pywebview's
  WebView2 fires one or the other depending on how the window was restored. Four guards keep it
  from becoming a request storm: a hidden document is ignored, a running job is left to the 1s poll
  that already owns that window, a full `load()` in flight is not raced, and a refresh within
  `FOCUS_REFRESH_MS` (5s) of the previous one is dropped.
- The throttle timestamp is seeded in a mount effect rather than in the `useRef` initializer:
  `Date.now()` during render trips `react(purity)`, and seeding it means the window's initial focus
  (plus the `visible` visibility event some renderers emit on load) cannot duplicate `load()`.
- A focus event while `systemError` is set calls `retry()` instead of `refreshOnFocus()`, so a
  backend that came back while the window was in the background recovers on its own — the
  full-screen error card is the one thing a partial refresh could not clear.
- **The search box is wired, not removed.** `catalogQuery` moved up to `App.tsx` and is threaded
  through `AppShell` → `NavBar`; `CatalogView` lost its internal `query` state and takes
  `query`/`onQueryChange` props. Typing in the navbar navigates to the Store when the value is
  non-empty (so the results are visible) and leaves the user where they are when it is cleared.
  `layout` and `filter` stay local to `CatalogView` — they are view preferences, not shared state.
- `npm run build` and `npm run lint` clean.

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

- ~~**Don't wire `DownloadsView` before Step 6.**~~ Resolved: Step 6 defined the real `Job` shape
  (`id`, `entry_id`, `title`, `status`, `received_bytes`, `total_bytes`, `error`, timestamps) and
  `DownloadsView` is built against it.
- **Two prototype features have no backend and need a decision, not code:** the `games`/`apps` category filter (the server publishes no category) and the per-card size/updated columns (only available per-entry via the manifest, which costs one `plan_archive` walk each). Dropping them from the grid and showing size on the detail page is the cheap path; adding `category` and `size_bytes` to the server's public catalog is the cross-repo path.