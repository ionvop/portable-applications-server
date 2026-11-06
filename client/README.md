# Portable Applications Client

Desktop client for browsing, downloading and launching portable applications and games
distributed by a Portable Applications Server on the local network.

React + TypeScript + Vite + Tailwind CSS + DaisyUI frontend, Flask + SQLite backend,
PyWebView desktop shell, packaged with PyInstaller.

See [`docs/proposal.md`](docs/proposal.md) for the full specification and
[`backend/README.md`](backend/README.md) for the API reference, data layout, server
contract, and packaging details.

## Requirements

- Python 3.10+
- Node.js 20+
- Windows 10/11 with the **Microsoft Edge WebView2 runtime** and **.NET Framework 4.6.2+**
  (both ship with current Windows builds; the client checks for them at startup and says
  what is missing instead of opening a blank window)

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
npm install
```

## Development

Run the local API and the frontend in two terminals. Vite proxies `/api` to Flask, so the UI
can call `/api/...` on its own origin with hot module reload.

```powershell
# terminal 1 — local Flask API on http://127.0.0.1:8757
npm run dev:api

# terminal 2 — Vite dev server on http://localhost:5173
npm run dev
```

Open <http://localhost:5173>. Confirm the proxy is wired up:

```powershell
curl http://localhost:5173/api/health   # {"status":"ok"}
```

`npm run dev:api` runs `python backend/dev_server.py`, which starts the API headless — no
PyWebView window and no `dist/` build required.

## Checks

```powershell
python backend/smoke_test.py   # API baseline (no server needed)
python -m pytest               # same suite, isolated to a temp data folder
npm run lint
npm run build
```

The smoke test starts a stub Portable Applications Server on loopback, so the full
catalog → download → extract → launch path is exercised without a real server. It covers
every endpoint, including the failure paths (dead server, missing manifest, non-image
thumbnail, missing executable, refused reset), a chunked download with no `Content-Length`,
and a version bump that must trigger a re-download.

`pytest` runs the same checks through a thin wrapper that redirects `data/` to a temporary
directory, so it never touches your real installs, cached covers or server address. Install
the test runner once with:

```powershell
pip install -r backend/requirements-dev.txt
```

### Cross-repo integration test

`backend/tests/test_integration.py` runs the client against the **real** server instead of the
stub. It is skipped unless `PAS_SERVER_DIR` points at the server checkout:

```powershell
$env:PAS_SERVER_DIR = "..\server"
python -m pytest backend/tests/test_integration.py -v
```

It starts the server in a subprocess, publishes a fixture application, and drives the client
through install → launch → version bump → re-install. This is the automated form of the
"fresh client machine" check below.

## Desktop build

```powershell
npm run build
python run.py
```

`run.py` serves the built frontend from `dist/` and opens a PyWebView window at
`http://127.0.0.1:8757/`.

## Packaging

Build a portable Windows bundle with:

```powershell
build.bat
```

That runs `npm run build` and then PyInstaller against [`pyinstaller.spec`](pyinstaller.spec),
producing:

```
release\PortableApplicationsClient\
    PortableApplicationsClient.exe
    _internal\        # Python runtime and dist\ frontend
    data\             # created on first run
```

Copy the whole `release\PortableApplicationsClient` folder to another machine and run the
executable — no Python or Node.js install is required. The `data\` folder (install state,
downloaded applications, settings, log) is always created **beside the exe**, never inside
the bundle, so the folder stays self-contained and can be moved or backed up as a unit.

`start.bat` remains the development launcher and runs the app from source.

### Build verification

`build.bat` does not declare success until the bundle proves itself. After PyInstaller it:

1. deletes any `release\` left by a previous run, so a stale `data\` can never ship;
2. runs `PortableApplicationsClient.exe --selftest`, which checks from *inside* the frozen
   process that the frontend is served out of `_internal\dist`, that `data\` is created
   beside the exe (not inside the bundle), that the database opens, that every read-only
   endpoint answers, and that a real socket can be bound;
3. copies the whole folder to `%TEMP%`, runs the selftest again there, and confirms `data\`
   appeared beside the *copied* exe — the portability check;
4. removes the `data\` the selftest created, so the shipped folder is clean.

The exe is windowed, so the verdict travels in the exit code and in a report file. Run the
check by hand at any time:

```powershell
release\PortableApplicationsClient\PortableApplicationsClient.exe --selftest --selftest-log selftest.log
```

Reports from the build are written to `%TEMP%\pac-selftest.log` and
`%TEMP%\pac-selftest-copy.log`.

### Startup log

Because the packaged build has no console, startup failures are written to
`data\client.log` (rotated once at 1 MB) and shown in a message box. If a client machine
misbehaves, that file is the first thing to read. The same log records the resolved data
folder, the port actually bound, and any unhandled exception.

## Status

The client is feature-complete for its intended use: browse the server catalog, install in the
background with live progress, launch, and remove — all from one window.

- **Catalog** — the server catalog with cover art, search, and `All` / `Installed` / `Updates`
  filters. Covers are proxied and cached by the backend, so the UI never needs CORS. Each row
  shows the published version next to the installed one, so an update reads `v1.0.0 → v2.0.0`.
- **Library** — what is actually installed on this machine, read from `client.db` rather than
  filtered from the catalog, so an entry deleted server-side still shows up.
- **Downloads** — active install jobs with a progress bar, plus history that survives a
  restart.
- **Settings** — save the server address, discover a server on the LAN, test a connection
  before saving, and reset local storage.
- **Shell** — a derived connection badge, a dismissible global error banner, and
  refresh-on-focus so the Library updates without a manual reload.

See [`docs/roadmap.md`](docs/roadmap.md) for the step-by-step history and
[`backend/README.md`](backend/README.md) for the API reference and data layout. All eleven
roadmap steps are complete, including packaging verification.

### Trust model

The client sends no credentials, and the server's client-facing endpoints are intentionally
open to the LAN. Admin endpoints on the server are loopback-guarded, the client's own Flask app
binds `127.0.0.1` only, and every server call is proxied through the client backend so no CORS
is involved. A shared secret is the documented upgrade path if the network is not trusted; see
[`backend/README.md`](backend/README.md#trust-model).

