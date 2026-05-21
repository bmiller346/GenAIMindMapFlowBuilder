# TraceSpace Agent Guide

## Mission
Build TraceSpace as a local source-grounded analysis and structuring workspace:

`source material -> structured understanding -> reviewable outputs`

The product is not "an AI chat with attachments." The product is a persistent
workspace graph that can be rendered as a mind map, outline, task list, table,
review package, roadmap, source coverage report, and controlled handoff output.

## Product Rules
1. The normalized workspace graph is the source of truth.
2. Mind map, tasks, table, and outline are views over the same data.
3. Every AI-generated node should retain source traceability when possible.
4. Prefer strict JSON contracts over freeform text generation.
5. Keep MVP scope narrow until the document-to-graph loop is reliable.
6. Miro is the visual collaboration bridge/projection, not the canonical store.
7. monday.com is the task execution bridge/projection, not the canonical store.
8. External pullbacks may persist refs and projection metadata, but must not overwrite canonical graph fields without an explicit review-and-accept flow.

## Current Build Focus
### In scope
- Upload `pdf`, `docx`, `md`, and `txt`
- Add web, image, audio, video, and data sources where their provenance path is explicit
- Extract and chunk document content
- Generate schema-valid graph/draft output through Responses-backed providers
- Stage source drafts and Ask AI drafts before canonical graph mutation
- Render and edit a graph-based workspace
- Toggle the same data into mind map, outline, task, table, review, and report views
- Export JSON, Markdown, CSV, OPML, Mermaid, MMD JSON, PNG, and SVG
- Preview Miro and monday.com handoff payloads before external writes

### Out of scope for now
- Full collaboration workflows
- Enterprise admin/policy layers
- Large prompt stacks that hide brittle architecture
- Default UX aimed at developers or code repositories

### Integration stance
- Export to Miro for collaborative review and board-level visualization
- Export to monday.com for actionable tasks, owners, and due dates
- Support import/sync only after internal node IDs and external refs are stable

## OpenAI Direction
- Preferred user-selectable models: `gpt-5.4`, `gpt-5.5`
- Default generation model: `gpt-5.5`
- Default reasoning/support model: `gpt-5.4`
- Target API direction: migrate legacy assistant-style flows toward modern OpenAI Responses-based patterns incrementally, not in a destabilizing rewrite

## Context Discipline
When working as an agent in this repo:

1. Start with this file, `AGENTS.md`, and only the relevant slice of
   `ROADMAP.md`; do not ingest every roadmap file by default.
2. Use `rg` to find the owning files and tests before opening code.
3. Read narrow file ranges or focused files first; summarize what you learned
   before widening scope.
4. Do not paste giant prompts, generated JSON, test output, or full diffs into
   planning docs.
5. Keep `ROADMAP.md` current when phase status, product direction, or integration
   priorities change.
6. Record only durable decisions, active constraints, and next milestones.
7. Prefer adding a small targeted test over running broad suites while still
   exploring.

## Parallel Agent Default
When a task has independent investigation, implementation, or verification
lanes, assume parallel subagents are allowed and useful. Spawn them proactively
for bounded sidecar work while keeping the immediate blocking task local.

Use this default especially for the UI shell/ribbon refactor, where lanes are
already split by shell/foundation, state/router, ribbon, left navigator,
properties, review tray, and QA. Give every subagent a narrow file or behavior
scope, tell it not to refactor outside that ownership, and require a handoff
with files touched, tests run, dependencies, and remaining risks.

Do not spawn agents for work that is tightly coupled to the next local edit, or
when delegation would duplicate the same file changes. Prefer explorers for
read-only dependency discovery and workers for disjoint implementation slices.

## Fast Context Intake
Use this routing map to keep context use low:

- Product/current status: read `README.md` first 80 lines, then the relevant
  `ROADMAP.md` section found by `rg -n`.
- Source intake and chunking: `backend/documents/ingestion.py`,
  `backend/documents/source_refs.py`, `backend/openai_sources.py`.
- Canonical graph contracts: `backend/graph/schemas.py`,
  `backend/graph/validation.py`, `backend/graph/ai_contract.py`.
- Ask AI draft sessions and artifact contracts: `backend/ai/schemas.py`,
  `backend/ai/roles.py`, `backend/ai_helpers.py`,
  `frontend/src/utils/aiDraftSessions.js`.
- Frontend workspace shell and projections: `frontend/src/App.jsx`,
  `frontend/src/views/graphProjection.js`,
  `frontend/src/views/LocalViewsPanel.jsx`.
- Source library and source review UI:
  `frontend/src/global-components/SourcesPanel.jsx`,
  `frontend/src/global-components/SourceDraftReviewPanel.jsx`,
  `backend/export/source_library.py`.
- Exports and handoffs: `backend/export/`,
  `backend/integrations/miro/`, `backend/integrations/monday/`.
- Desktop/dev shell: `electron/`, `scripts/`, `DESKTOP.md`.
- Hidden code intelligence: `backend/code_intelligence/`. Keep it backend-first
  and gated; do not surface it in default user flows.

When a task names one of the specialized roadmap files, read only that file and
its explicitly referenced owners/tests. Several specialized roadmaps are now
closed references; use `ROADMAP.md` for current delivery status unless a task
explicitly reopens that lane:

- `NODE_AI_ACTIONS_ROADMAP.md` - closed reference for the current scope.
- `WORKSPACE_CONTEXT_ROADMAP.md` - reference roadmap; shell/product status has
  moved to `ROADMAP.md` and `PRODUCT_GUIDE_WORKSPACE_SHELL.md`.
- `UX_NUDGES_AND_OUTPUTS_ROADMAP.md`
- `NODE_AUTHORING_UX_ROADMAP.md` - closed reference for the current scope.
- `UI_SHELL_RIBBON_REFACTOR_ROADMAP.md` - shell closeout/reference roadmap;
  use it for rollback posture and ownership rules, not as a broad active queue.

For workspace shell, ribbon, dock, inspector, map lens, or AI review surface
changes, also read `PRODUCT_GUIDE_WORKSPACE_SHELL.md`. Treat it as the product
intent and the roadmap as the implementation sequence.

## Architecture North Star
### Source-of-truth model
- `workspaces`
- `documents`
- `document_chunks`
- `nodes`
- `edges`
- `source_refs`
- `tasks`
- `views`
- `external_refs`

### Rendered views
- Mind map
- Outline
- Task list
- Table
- Markdown export

### Integration endpoints
- Miro board, frame, mind map, or shapes-plus-connectors export
- monday.com board, groups, items, and subitems export
- Status/comment pullback only after export mappings are durable

## Shared Validation Contracts
Agents should treat these contracts as coordination rules across ingestion, graph validation, review UI, and integrations:

1. Source refs must be evidence-backed. Do not fabricate `source_refs`; leave ungrounded generated nodes with `source_refs: []` so graph validation can mark them `needs_review`.
2. AI-generated/reviewable nodes without `source_refs` are expected to become `needs_review`; this is a review signal, not a graph-invalid state.
3. Low-confidence AI-generated/reviewable nodes below the backend threshold are also expected to become `needs_review`.
4. `reference` nodes are exempt from missing-source and low-confidence `needs_review` repair.
5. If an agent creates `external_refs.miro` or `external_refs.monday`, the ref should be integration-backed and durable: include `board_id`, `item_id`, `export_batch_id`, and `last_pushed_at`. Incomplete Miro/monday refs are allowed to persist, but validation will surface warnings in the UI.

## Roadmap Source Of Truth
Use `ROADMAP.md` as the living project tracker.

Current status: core MVP implementation is mostly in place. The remaining MVP
release gates are live browser/OpenAI full-loop verification and live Miro /
monday.com credential smoke tests.

Next best work:
1. Run live browser/OpenAI end-to-end smoke with real PDF and DOCX uploads:
   upload, generate, review/accept source draft, edit, save, reopen, export JSON
   and Markdown.
2. Verify live Miro and monday.com pushes against real credentials and confirm
   returned external refs persist after save/reopen.
3. Continue Intent-Driven Readiness only as preview-first, source-cited packs.
4. Keep GitHub/code intelligence hidden from default UX; local-first and
   read-only until explicitly gated.

## Verification Shortcuts
Pick the smallest useful verification set for your change:

- Backend source/graph/export changes:
  `python -m pytest backend\tests\test_source_trace_pipeline.py backend\tests\test_export_snapshots.py -q`
- Ask AI draft/session changes:
  `python -m pytest backend\tests\test_ai_draft_sessions.py backend\tests\test_ai_draft_responses.py -q`
- Artifact registry/output contract changes:
  `python -m pytest backend\tests\test_ai_artifact_outputs.py -q`
- Code intelligence changes:
  `python -m pytest backend\tests\test_code_intelligence_local_repo.py -q`
- Frontend projection/session logic:
  `node --test frontend/tests/graphProjection.test.mjs frontend/tests/aiDraftSessions.test.mjs`
- Frontend production sanity:
  `npm run build`
- Desktop shell changes:
  `npm run desktop:check`

For broader handoff confidence, use the README testing section rather than
copying commands into new roadmap notes.

## Definition of Better
- Smaller prompts
- Clearer schemas
- Fewer duplicated flows
- Better traceability
- Less "AI demo" behavior
- More durable product architecture
