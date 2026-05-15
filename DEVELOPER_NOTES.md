# Developer Handoff Notes

## Current Status

TraceSpace is a forked document-to-structured-workspace app. The core architecture is still React + Vite frontend, FastAPI backend, MongoDB-backed document/source persistence, and a thin Electron shell for local desktop launch.

Canonical product rule:

```text
saved workspace graph -> local views -> neutral exports -> Miro/monday projections
```

Electron is a launcher/package wrapper, not the long-term application boundary.

## Local Startup

From the repo root:

```powershell
npm install
cd frontend
npm install
cd ..\backend
python -m poetry install
cd ..
npm run infra:mongo:up
npm run dev
```

If Docker Desktop or WSL blocks MongoDB, use the workstation-local MongoDB helper:

```powershell
npm run infra:mongo:local
npm run dev
```

## Verification Snapshot

Last local checks run before this handoff:

```powershell
cd frontend
npm run lint
npm run build

cd ..
npm run desktop:check

cd backend
python -m poetry run pytest
```

Observed results:

- Frontend lint passes.
- Frontend production build passes.
- Electron script syntax check passes.
- Backend test suite passes: 65 tests.
- Secret scan found no obvious committed OpenAI, Miro, monday, AWS, or MongoDB Atlas credentials.

Known local warning:

- `pytest` may warn that it cannot write `.pytest_cache` because of local filesystem permissions. Tests still pass.

## Important Review Caveats

- `frontend/eslint.config.js` intentionally suppresses inherited fork noise such as `no-unused-vars`, `react/prop-types`, hook dependency warnings, and semicolon rules. Treat this as scoped lint stabilization, not proof that the inherited frontend is fully clean.
- `backend/.env.example` is safe to commit and documents expected defaults. Real secrets should stay in local Settings UI, Electron credential storage, or ignored `backend/.env`.
- Self-contained Electron packaging still bundles the backend Poetry virtual environment and is large. For daily development use `npm run dev`; reserve `npm run desktop:build:self-contained` for deployment experiments.
- Miro and monday integrations are projections. They should not become canonical graph state without an explicit user-reviewed acceptance flow.
- Workspace Brief is now part of normalized exports as `workspace.brief`.

## Suggested Reviewer Focus

- Validate the canonical graph/schema boundary before deep UI polish.
- Review credential flow from renderer settings to Electron IPC to backend request headers.
- Review upload security limits, filename sanitization, hashing, and source citation preservation.
- Review Miro/monday payload construction, dry-run behavior, and external-ref persistence.
- Decide whether the relaxed ESLint policy should remain during MVP hardening or be tightened gradually by directory.
