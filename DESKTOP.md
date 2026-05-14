# DocMap Desktop Launcher

This is a thin Electron shell around the existing app:

```text
Electron window
-> local React/Vite frontend
-> local FastAPI backend on 127.0.0.1:8000
-> backend still managed by Poetry for now
```

It does not rewrite the backend into Node and does not make Electron the product architecture. It only gives you a double-clickable local launch path while the app is not hosted.

## One-Time Setup

Install frontend dependencies if they are not already installed:

```powershell
cd frontend
npm install
```

Install backend dependencies:

```powershell
cd backend
python -m poetry install
```

Install desktop launcher dependencies from the repo root:

```powershell
npm install
```

## Development Desktop Launch

From the repo root:

```powershell
npm run infra:mongo:up
npm run dev
```

`npm run dev` is the day-to-day desktop app launch. It does not rebuild or package the app. The explicit equivalent is `npm run desktop:dev`.

This starts:

- MongoDB on `127.0.0.1:27017` when Docker Desktop is running
- Vite frontend on `127.0.0.1:5173`
- FastAPI backend on `127.0.0.1:8000`
- Electron pointed at the Vite frontend

If Docker Desktop is not running, start it first and then run:

```powershell
npm run infra:mongo:up
```

Source uploads require MongoDB because document metadata, chunks, and source references are persisted there. The backend can list locally-created workspaces without MongoDB, but DOCX/PDF/Markdown/TXT uploads will not complete until MongoDB is reachable.

## Production-Like Local Launch

Build the frontend first:

```powershell
npm run desktop:build:frontend
```

Then start Electron:

```powershell
npm run infra:mongo:up
npm run desktop:start
```

Electron will load `frontend/dist/index.html` and start the backend with:

```powershell
python -m poetry run uvicorn app:app --host 127.0.0.1 --port 8000
```

If Poetry is not available as a Python module, it falls back to:

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

## Installer / Portable Build

From the repo root:

```powershell
npm run desktop:build
```

This creates NSIS and portable Windows artifacts through `electron-builder`.

The build stages backend files through `.desktop-resources/backend` so Python caches, virtual environments, and test caches do not get packaged.

## Self-Contained Installer / Portable Build

To bundle the current backend Poetry virtual environment into the app resources:

```powershell
npm run desktop:build:self-contained
```

That build stages `backend/.venv` into `.desktop-resources/backend/.venv`, and the Electron launcher prefers the packaged venv Python before trying system Poetry or system Python.

Current size note: `backend/.venv` is large, roughly several GB on this machine, so self-contained artifacts will be much larger than the thin launcher.

## Current Limitation

The self-contained path bundles the current virtual environment. If that proves non-relocatable on another machine, the next hardening pass should switch from venv bundling to a dedicated embedded Python or PyInstaller-style backend runtime.
