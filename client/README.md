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
npm run lint
npm run build
```

The smoke test starts a stub Portable Applications Server on loopback, so the full
catalog → download → extract → launch path is exercised without a real server.

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
downloaded applications, settings) is always created **beside the exe**, never inside the
bundle, so the folder stays self-contained and can be moved or backed up as a unit.

`start.bat` remains the development launcher and runs the app from source.

## Status

The Python backend is complete and covered by the smoke test. The React UI is still the Vite
starter template — see the "Frontend wiring (TODO)" section of
[`backend/README.md`](backend/README.md) for the remaining work.

