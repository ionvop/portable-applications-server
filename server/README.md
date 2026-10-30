# Portable Applications Server

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
python backend/smoke_test.py   # API baseline (no server needed)
npm run lint
npm run build
```

## Desktop build

```powershell
npm run build
python run.py
```

`run.py` serves the built frontend from `dist/` and opens a PyWebView window at
`http://127.0.0.1:8756/`. See [`backend/README.md`](backend/README.md) for the API reference,
data layout, and PyInstaller packaging.
