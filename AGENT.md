# TraceSpace Agent Guide

## Mission
Turn this fork into a document-to-structured-workspace product:

`PDF/DOCX/MD/TXT -> extracted structure -> normalized graph -> multiple editable views`

The product is not "an AI chat with attachments." The product is a persistent workspace graph that can be rendered as a mind map, outline, task list, table, and later board/calendar/org chart views.

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
- Extract and chunk document content
- Generate a structured hierarchy
- Render and edit a graph-based mind map
- Toggle the same data into outline/task/table views
- Export JSON, Markdown, and PNG

### Out of scope for now
- Full collaboration workflows
- Enterprise admin/policy layers
- Broad multimodal parity with the upstream demo
- Large prompt stacks that hide brittle architecture

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

1. Read only the files needed for the task.
2. Summarize before widening scope.
3. Do not paste giant prompts or long generated JSON into planning docs.
4. Keep `ROADMAP.md` current when phase status or integration priorities change.
5. Record only durable decisions, active constraints, and next milestones.

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

Current phase: Phase 4 Integration Readiness / ExportBatch Hardening.

Next best work:
1. Verify MVP Required acceptance with fixture uploads, save/reopen, and JSON/Markdown export.
2. Stabilize `WorkspaceBrief` as a durable schema and wire a dedicated derive-from-brief generation action.
3. Exercise monday export to a real existing board/group and verify status pullback does not overwrite canonical graph structure.
4. Harden standalone Electron settings so user-owned API keys are stored outside renderer `localStorage`.
5. Verify the quarantined legacy landing path stays hidden by default while remaining available behind an explicit browser flag for compatibility checks.

## Parallel Work Lanes
Use the detailed ownership map in `ROADMAP.md`.

- Agent A: document reliability, source metadata, chunking, upload safety.
- Agent B: graph contracts, schema validation, graph repair/report data.
- Agent C: review UI, node inspector citations, validation panel.
- Agent D: local graph projections, outline/task/table views, branch preview.
- Agent E: neutral exports, Miro/monday bridge payloads, export confirmation.

Before editing, each agent should state its lane and avoid another lane's owned files unless coordination is explicit.

## Definition of Better
- Smaller prompts
- Clearer schemas
- Fewer duplicated flows
- Better traceability
- Less "AI demo" behavior
- More durable product architecture
