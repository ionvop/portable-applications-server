# CHU2CORE

Local-network application and game catalog with ZIP distribution. React + TypeScript +
Vite + Tailwind CSS + DaisyUI frontend, Flask + SQLite backend, PyWebView desktop shell.

See [`docs/proposal.md`](docs/proposal.md) for the full specification and
[`docs/roadmap.md`](docs/roadmap.md) for the implementation plan.

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

Run the API and the frontend in two terminals. Vite proxies `/api` to Flask, so the UI can
call `/api/...` on its own origin with hot module reload.

```powershell
# terminal 1 — Flask API on http://127.0.0.1:8756
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
pip install -r backend/requirements-dev.txt   # pytest
npm run build                                  # the SPA checks read dist/index.html
npm test                                       # pytest wrapper around smoke_test.py
python backend/smoke_test.py                   # standalone run, no pytest needed
npm run lint
```

`backend/smoke_test.py` is the single source of truth and covers every API endpoint.
`tests/test_smoke.py` wraps it for pytest so CI can run it; `tests/conftest.py` points
`PAS_DATA_DIR` at a temporary folder, so a test run never touches the real `data/`
catalog. Set `PAS_DATA_DIR` yourself to run the server against an alternate library.

## Desktop build

```powershell
npm run build
python run.py
```

`run.py` serves the built frontend from `dist/` and opens a PyWebView window at
`http://127.0.0.1:8756/`. See [`backend/README.md`](backend/README.md) for the API reference,
data layout, and packaging details.

## Packaging

Build a portable Windows bundle with:

```powershell
build.bat
```

That runs `npm run build` and then PyInstaller against [`pyinstaller.spec`](pyinstaller.spec),
producing:

```
release\CHU2CORE\
    CHU2CORE.exe
    _internal\        # Python runtime, dist\ frontend, backend\templates
    data\             # created on first run
```

Copy the whole `release\CHU2CORE` folder to another machine and run the
executable — no Python or Node.js install is required. The `data\` folder (catalog database,
managed apps, thumbnails, temp files) is always created **beside the exe**, never inside the
bundle, so the folder stays self-contained and can be moved or backed up as a unit.

`start.bat` remains the development launcher and runs the app from source.
