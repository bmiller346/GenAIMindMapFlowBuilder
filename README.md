# TraceSpace Workspace

TraceSpace is a local document-to-structured-workspace app. It ingests technical documents, generates a reviewable graph, preserves source references, and projects the same canonical graph into mind maps, outlines, task lists, exports, and future Miro/monday.com workflows.

The architectural rule is:

```text
one persistent graph -> many views -> controlled exports
```

Miro and monday.com are bridge/projection endpoints. TraceSpace remains the canonical structure and traceability engine; external IDs, push timestamps, and pulled statuses are stored as integration metadata, not as replacement graph state.

## Current Product Focus

The MVP lane is intentionally narrow, but source intake can include more than office documents:

- Upload `PDF`, `DOCX`, `Markdown`, or `TXT`.
- Add web, image, audio, and video sources when their parser path is available.
- Extract text with source-aware metadata where possible.
- Chunk documents deterministically.
- Generate schema-valid graph JSON.
- Flag generated nodes without source references as `needs_review`.
- Edit and save the workspace.
- Export reviewable JSON, Markdown, CSV, OPML, Mermaid, MMD JSON, PNG, and SVG.
- Preview or push selected graph projections to Miro and monday.com when configured.

The source picker is organized by intake mode rather than by old/new status: workspace brief, documents, web, media, and data. PDF, DOCX, Markdown, and TXT are the strict source-traceable MVP document paths today; image, audio, video, and web now use OpenAI-backed default paths instead of Gemini, AWS upload, or crawler-first execution. Local video samples frames and extracts/transcribes local audio with the bundled desktop `ffmpeg` binary, `DOCMAP_FFMPEG_PATH`, or a PATH-provided `ffmpeg` before graph generation. YouTube, PPTX, HTML, CSV, and SQL remain useful AI intake paths whose provenance contracts should be hardened as they graduate into the same traceability model.

Ask AI uses draft sessions for graph-changing work: model output is staged as a
reviewable draft, can be revised conversationally, and only mutates the
canonical graph after explicit acceptance. Source-scoped Ask AI can send one
selected source, multiple selected sources, or an added source's chunks to the
backend draft-session path. Added sources reconcile into the active draft
before the user accepts anything into the canonical graph.

## Repository Layout

```text
backend/      FastAPI app, graph validation, ingestion, exports, integrations
frontend/     React + Vite app
electron/     Desktop shell for local standalone use
scripts/      Desktop build and launch helpers
ROADMAP.md    Living engineering roadmap
DESKTOP.md    Detailed Electron packaging notes
DEVELOPER_NOTES.md  Reviewer handoff notes, validation status, caveats
AGENT.md      Compact guide for agentic development work
```

## Prerequisites

- Windows PowerShell
- Node.js 20 or newer
- Python 3.11
- Poetry available through `python -m poetry`
- Docker Desktop for MongoDB-backed document uploads, or the local MongoDB fallback on this workstation

MongoDB is required for source document metadata, document chunks, and source references. Basic workspace listing can fall back to a local JSON store during development, but document ingestion should be tested with MongoDB running.

## One-Time Setup

Install root desktop dependencies:

```powershell
npm install
```

Install frontend dependencies:

```powershell
cd frontend
npm install
cd ..
```

Install backend dependencies:

```powershell
cd backend
python -m poetry install
cd ..
```

Start MongoDB when you need document uploads:

```powershell
npm run infra:mongo:up
```

If Docker Desktop is blocked by WSL on this Windows workstation, start the installed MongoDB server directly:

```powershell
npm run infra:mongo:local
```

Stop MongoDB when you are done:

```powershell
npm run infra:mongo:down
```

## Configuration

For standalone/local use, users should enter their own API keys through the app Settings UI instead of editing `.env` files. The current development build forwards local user settings to the backend per request.

Use `backend/.env` only for developer defaults, integration testing, or hosted/company-managed deployments.

Common backend variables:

```env
mongo_db_url=mongodb://127.0.0.1:27017
openai_api_key=
openai_default_model=gpt-5.5
openai_reasoning_model=gpt-5.4
openai_embedding_model=text-embedding-3-large
DOCMAP_MAX_UPLOAD_BYTES=26214400
DOCMAP_FFMPEG_PATH=
miro_api_token=
monday_api_token=
```

Optional legacy variables:

```env
gemini_api_key=
gcp_project_id=
gcp_service_account_file=./ai-interview-poc-2b5cf8540f16.json
aws_access_key_id=
aws_secret_access_key=
bucket_name=
```

Gemini, GCP, and AWS variables are only for legacy or explicitly selected compatibility paths. The default TraceSpace source flow should rely on the OpenAI key plus local extraction where possible.

Optional legacy UI flags:

```js
localStorage.setItem('docmap:showLegacyLanding', 'true');
```

That flag preserves the forked demo landing page for comparison and reintegration checks without putting it on the default TraceSpace MVP path.

OpenAI-backed endpoints return `503` with the missing setting name when no key is available. Upload validation restricts extensions, sanitizes filenames, hashes file bytes, and defaults to a 25 MB upload limit when `DOCMAP_MAX_UPLOAD_BYTES` is omitted.

## Start The App

### Recommended Desktop Development

From the repo root:

```powershell
npm run infra:mongo:up
npm run dev
```

This launches:

- MongoDB at `127.0.0.1:27017`
- FastAPI at `http://127.0.0.1:8000`
- Vite at `http://127.0.0.1:5173`
- Electron pointed at the Vite app

`npm run dev` is an alias for `npm run desktop:dev`.

### Browser Development

Use this when you want the app in a normal browser instead of Electron.

Terminal 1:

```powershell
cd backend
python -m poetry run uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

### Production-Like Local Desktop Launch

```powershell
npm run desktop:build:frontend
npm run infra:mongo:up
npm run desktop:start
```

This loads the built frontend from `frontend/dist` and starts the backend locally.

## Build

Build the frontend:

```powershell
cd frontend
npm run build
```

Check Electron scripts:

```powershell
npm run desktop:check
```

Build Windows desktop artifacts:

```powershell
npm run desktop:build
```

Build a self-contained desktop artifact that includes the current backend virtual environment:

```powershell
npm run desktop:build:self-contained
```

The self-contained build is much larger because it stages `backend/.venv`. See [`DESKTOP.md`](DESKTOP.md) before relying on it for distribution.

## Testing

Run all backend tests:

```powershell
cd backend
python -m poetry run pytest
```

Run focused graph/export/integration tests:

```powershell
cd backend
python -m poetry run pytest tests/test_source_trace_pipeline.py tests/test_export_batch_schema.py tests/test_miro_frame_export.py tests/test_monday_existing_group_export.py -q
```

Compile-check important backend entry points:

```powershell
python -m py_compile backend/app.py backend/config.py backend/Models/model.py backend/export/workspace_graph.py
```

Run frontend lint:

```powershell
cd frontend
npm run lint
```

Run the minimum pre-handoff validation:

```powershell
cd frontend
npm run build
cd ..
npm run desktop:check
cd backend
python -m poetry run pytest tests/test_source_trace_pipeline.py tests/test_export_batch_schema.py -q
```

## VS Code Tasks

The repo includes tasks in `.vscode/tasks.json`.

- `TraceSpace: Dev App` starts backend and frontend together.
- `TraceSpace: Backend API` runs FastAPI on `127.0.0.1:8000`.
- `TraceSpace: Frontend UI` runs Vite on `127.0.0.1:5173`.
- `TraceSpace: Build Frontend` runs the Vite production build.
- `TraceSpace: Lint Frontend` runs ESLint.
- `TraceSpace: Test Backend` runs pytest.
- `TraceSpace: Desktop Dev` launches the Electron development shell.
- `TraceSpace: Build Desktop Self-Contained` packages a bundled desktop build.

Use `Terminal > Run Build Task...` or `Ctrl+Shift+B` to launch the default dev task.

## API Surface

Core workspace exports:

```text
GET  /api/workspaces/{id}/exports/json
GET  /api/workspaces/{id}/exports/markdown
GET  /api/workspaces/{id}/exports/csv
GET  /api/workspaces/{id}/exports/opml
GET  /api/workspaces/{id}/exports/mmd-json
GET  /api/workspaces/{id}/exports/mermaid
GET  /api/workspaces/{id}/branches/{node_id}/exports/json
```

Miro and monday.com projection endpoints:

```text
POST /api/workspaces/{id}/export/miro
POST /api/workspaces/{id}/branches/{node_id}/export/miro
POST /api/workspaces/{id}/export/monday
POST /api/workspaces/{id}/branches/{node_id}/export/monday
```

These endpoints normalize saved React Flow data into the TraceSpace graph shape before exporting. Prefer dry-run/preview flows before pushing to external tools. Pullbacks from monday.com are stored as `external_status_projections.monday` plus `external_refs.monday` metadata, leaving canonical node status unchanged until a separate user-reviewed graph mutation accepts it.

## Development Rules

- Keep `ROADMAP.md` current when priorities or acceptance checkpoints change.
- Treat the graph schema as the source of truth; do not create separate state silos for mind map, task, or export-only data.
- Treat Miro and monday.com as projections of the graph. Integration pullbacks may annotate nodes with external ref/projection metadata, but they must not overwrite canonical graph fields without an explicit review-and-accept path.
- Any AI-generated node without a source reference must be marked `needs_review`.
- Any AI operation that mutates the canonical graph should produce a preview diff and require user acceptance before persistence.
- Use branch-level previews before Miro or monday.com pushes.
- Prefer adding tests around graph validation, source traceability, export snapshots, and integration payloads.

## Troubleshooting

### Hamburger Menu Shows 500 Or Network Error

Make sure the backend is running:

```powershell
cd backend
python -m poetry run uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Then refresh `http://127.0.0.1:5173/`.

### Uploads Fail

Start MongoDB:

```powershell
npm run infra:mongo:up
```

Then verify `mongo_db_url` is set or defaults to `mongodb://127.0.0.1:27017`.

### OpenAI Calls Return 503

Open the app Settings UI and add an OpenAI API key, or set `openai_api_key` in `backend/.env` for developer-managed runs.

### Electron Opens To A Black Screen

Run the browser development path first to confirm backend and frontend are healthy. Then run:

```powershell
npm run desktop:check
npm run dev
```

If the production-like Electron path is black, rebuild the frontend:

```powershell
npm run desktop:build:frontend
npm run desktop:start
```

### Legacy Demo Assets

The old landing/demo page is lazy-loaded and hidden behind `docmap:showLegacyLanding`. Its video assets may still be emitted as separate build assets, but they are not part of the default TraceSpace route unless that legacy flag is enabled.

## Roadmap

The living roadmap is [`ROADMAP.md`](ROADMAP.md). Use it as the source of truth for phase status, agent ownership lanes, acceptance checkpoints, and next best work.
