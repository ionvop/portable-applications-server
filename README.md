# Portable Applications Server

Portable Applications Server is a Windows-oriented application distribution system for a local network. It contains two desktop applications: **CHU2CORE**, a server for maintaining a catalog of portable applications and games, and **CHU2PLAY**, a client for browsing, downloading, updating, and launching them.

The server stores and publishes catalog entries over the LAN. Each client downloads the selected application when needed, extracts it into local storage, and launches it using the configured executable path. The server and client are separate projects with their own dependencies, runtime data, and build outputs.

## Repository Layout

| Directory | Purpose |
| --- | --- |
| [`server/`](server/README.md) | Catalog management UI and LAN distribution API |
| [`client/`](client/README.md) | Catalog browsing, application installation, and launching UI |
| [`docs/proposal.md`](docs/proposal.md) | Project goals, intended use, and system workflow |

Each application has its own detailed README, backend API documentation, and implementation roadmap.

## Requirements

- Windows 10 or 11 for the desktop applications and packaging workflows
- Python 3.10 or later
- Node.js 20 or later
- Microsoft Edge WebView2 runtime and .NET Framework 4.6.2 or later for the client desktop shell

The server and client use React, TypeScript, and Vite for their interfaces, Flask and SQLite for their backends, and PyWebView/PyInstaller for desktop builds. See the component READMEs for any additional runtime details.

## Development

Install and run each component independently. Open two terminals in that component's directory: one for its Flask API and one for the Vite UI. Vite proxies `/api` requests to the local API.

### Server

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
npm install
```

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev
```

Open <http://localhost:5173>. The server API listens on `127.0.0.1:8756` during development.

### Client

```powershell
cd client
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
npm install
```

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev
```

Open <http://localhost:5173>. The client API listens on `127.0.0.1:8757` during development.

To run either app as a desktop window from source, build its UI and start `run.py`:

```powershell
npm run build
python run.py
```

## Checks

Run the checks from the corresponding `server/` or `client/` directory. Install the development test dependencies first with `pip install -r backend/requirements-dev.txt`.

```powershell
python -m pytest
python backend/smoke_test.py
npm run lint
npm run build
```

The client also has an integration test that exercises the real server. From `client/`, set `PAS_SERVER_DIR` to the server checkout and run the test:

```powershell
$env:PAS_SERVER_DIR = "..\server"
python -m pytest backend/tests/test_integration.py -v
```

## Packaging

From either component directory, run `build.bat` to build its portable Windows bundle under that component's `release/` directory. The server and client bundles are built and distributed separately. Their runtime data is kept beside the executable, not inside the application bundle.

## Further Documentation

- [Server guide](server/README.md)
- [Server API and data layout](server/backend/README.md)
- [Server roadmap](server/docs/roadmap.md)
- [Client guide](client/README.md)
- [Client API and data layout](client/backend/README.md)
- [Client roadmap](client/docs/roadmap.md)
- [Project proposal](docs/proposal.md)