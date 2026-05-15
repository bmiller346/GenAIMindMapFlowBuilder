# DocMap MVP Roadmap

This is the current implementation and MVP completion tracker for DocMap.
Keep it focused on what exists, what is still incomplete, and what must be
verified before calling the MVP shippable.

## Product North Star

Build an internal document-to-structured-workspace engine:

```text
PDF/DOCX/MD/TXT upload
-> extracted document structure
-> source-cited normalized graph
-> editable mind map, outline, task list, table, and exports
-> optional post-review handoff actions to Miro and monday.com
```

The DocMap graph is canonical. Miro and monday.com are handoff destinations,
not replacements for the internal graph.

## Current Status

Status: MVP implementation is mostly in place, with final end-to-end smoke
verification still needed.

Recently verified:

- Backend roadmap-relevant tests pass: 60 passed.
- Frontend production build passes with `npm run build`.
- Strict AI graph contract validation exists and is covered by tests.
- Document ingestion, source refs, graph validation, exports, Miro payloads,
  monday existing-group export, monday template mapping, monday status pull,
  and source trace coverage are covered by focused backend tests.

Known verification gap:

- The complete desktop/browser MVP loop still needs a fresh manual smoke test
  with real PDF and DOCX uploads: upload, generate, edit, save, reopen, export
  JSON/Markdown, and confirm source/review indicators in the UI.

## Product Rules

1. The normalized graph is the source of truth.
2. Every view is a projection of that graph.
3. AI output must be schema-bound and source-cited where possible.
4. Any AI-generated node without a source reference must be marked
   `needs_review`.
5. Any AI operation that mutates the canonical graph must produce a preview and
   require user acceptance before persistence.
6. Neutral exports must work without Miro or monday credentials.
7. Miro and monday exports happen only after graph validation and user
   confirmation.
8. External integrations must preserve internal node IDs.
9. Push to external tools before considering import/reconciliation.
10. Do not add broad collaboration or full bidirectional sync until the
    document-to-graph loop is reliable.
11. Node-level AI actions must generate preview changes before mutating the
    canonical graph.
12. Custom prompts may create drafts, but only accepted and validated drafts
    become graph nodes.

## Implemented

### Source Intake And Ingestion

- [x] Primary source picker supports Workspace Brief, PDF, DOCX, Markdown, TXT,
  web, image, audio, and video intake modes.
- [x] Strict source-traceable document paths exist for PDF, DOCX, Markdown, and
  TXT.
- [x] Source document metadata is normalized: ID, filename, type, hash, version,
  and status.
- [x] Text extraction preserves source location where available.
- [x] Documents are chunked by page, heading, and text boundaries.
- [x] Chunk IDs are deterministic.
- [x] Uploads enforce file size limits, allowed extensions, sanitized
  filenames, hashing, duplicate detection, and malformed document errors.
- [x] Environment/API-key handling exists for AI and integration settings.
- [x] Non-document AI source paths are wired through OpenAI-backed handlers:
  web search, image vision, audio transcription, and local video frame sampling
  with local audio extraction/transcription through bundled desktop `ffmpeg`,
  `DOCMAP_FFMPEG_PATH`, or a PATH-provided `ffmpeg`.

### AI Graph Contract And Validation

- [x] AI graph prompts include a canonical JSON contract.
- [x] AI graph responses are parsed as strict JSON before persistence.
- [x] AI output is schema-validated before repair/grounding.
- [x] Graph validation detects and repairs or reports orphan nodes, broken
  edges, duplicate node IDs, invalid parent IDs, missing root, missing source
  refs, low-confidence nodes, invalid external refs, and task metadata gaps.
- [x] Ungrounded generated nodes default to empty `source_refs` and
  `needs_review`.
- [x] Validation reports are available to the UI.
- [x] Document intake treats role/brief guidance as optional, validates allowed
  intake roles, sanitizes prompt text, and routes PDF/DOCX/Markdown/TXT graph
  generation through Responses with DocMap model policy.
- [x] Automatic document intake stages generated graph output in a source draft
  review panel before adopting it into the canonical workspace graph.

### AI Provider Refactor

Goal: remove the Assistants API dependency from DocMap generation paths.
OpenAI lists Assistants API removal for 2026-08-26, so remaining Assistants
paths are temporary legacy paths, not the product architecture.

- [x] Add `backend/ai/responses_client.py`.
- [x] Add a provider-neutral DocMap AI adapter interface.
- [x] Move role/persona prompts into backend AI role modules.
- [x] Move JSON output schemas into backend AI schema modules.
- [x] Refactor PDF/DOCX/Markdown/TXT draft generation from Assistants API to
  Responses API.
- [x] Keep Assistants API as temporary legacy fallback only, gated by
  `DOCMAP_ALLOW_LEGACY_ASSISTANTS`.
- [x] Add tests for Responses API request construction.
- [x] Add fixture/mock provider for offline graph-generation tests.
- [ ] Remove remaining legacy Assistants source/persona paths after each has a
  Responses equivalent; no workflow should silently downshift to a legacy model.

Current discrepancy:

- Legacy Assistants calls still exist for older chat/follow-up and dead web
  crawler fallback code paths in `backend/app.py`. The active document source
  intake path is Responses-first, marks fallback metadata as
  `legacy_assistants`, and can disable fallback with
  `DOCMAP_ALLOW_LEGACY_ASSISTANTS=false`.

### Workspace Graph And Local Views

- [x] React Flow renders the editable mind map.
- [x] Node detail editing supports title, type, review status, owner, due date,
  priority, confidence, source refs, and external refs.
- [x] Node badges show review status, confidence, citation status, and node
  type.
- [x] Source citations are visible in the node inspector.
- [x] Workspaces can be saved and reloaded through backend persistence.
- [x] Autosave/revert behavior has Playwright coverage.
- [x] The canonical graph projects to outline, task list, and table views.
- [x] Branch selection is first-class.
- [x] Local preview/accept flows exist for branch-to-task, branch-to-checklist,
  missing information, SME questions, and source-reference repair.
- [x] Accepted local preview metadata is standardized in
  `local_preview_acceptances`.
- [x] Original repo-style persona prompts are preserved in the codebase:
  `Strategic Advisor`, `Research Assistant`, `Productivity Coach`,
  `Data Interpreter`, and `Custom Prompts` still exist behind the legacy
  data-source prompt selector.
- [x] Node, branch, and workspace Ask AI actions expose the original personas
  under a General profile group and use DocMap's preview/accept graph mutation
  model.
- [x] Ask AI is the unified entry point for helper roles; Source Librarian,
  SME/reviewer, planner, and data interpreter behavior is routed through role
  profiles and action intent instead of separate competing UI surfaces.
- [x] The legacy data-source `PromptModal`/`Prompts` execution path is gated so
  it remains discoverable but cannot directly append graph changes outside
  preview/accept.

### Workspace Brief

- [x] Workspace Brief schema fields are represented in frontend state and
  persisted in workspace JSON.
- [x] Build DocMap modal supports presets, desired outputs, source strictness,
  node taxonomy, review policy, and output style controls.
- [x] Workspace Brief context is included in relevant backend request prompts.
- [x] Workspace Brief appears in the primary workflow.
- [x] A dedicated "derive from brief" action creates reviewable, uncited
  assumption nodes for true no-source workspaces.

### Neutral Exports

- [x] Internal graph JSON export endpoint.
- [x] Markdown export endpoint.
- [x] CSV task export endpoint.
- [x] OPML export endpoint.
- [x] MMD-compatible JSON export endpoint.
- [x] Mermaid export endpoint.
- [x] UI export actions for neutral formats.
- [x] PNG and SVG export of the visible mind map.

### Miro Bridge

- [x] Miro preview/scaffold payload endpoints.
- [x] Dry-run Miro layout preview.
- [x] Selected-branch Miro frame execution behind `miro_api_token`.
- [x] Whole-workspace Miro board export.
- [x] Shapes/connectors are the durable fallback export mode.
- [x] Native Miro mind map API is evaluated and available as an optional
  dry-run planning path.
- [x] Exported Miro objects preserve internal node IDs and source reference
  text.
- [x] Returned Miro board/item IDs are persisted in `external_refs`.
- [x] Miro auth configuration and token handling exist.
- [x] SME review board mode exists for `needs_review` nodes.
- [ ] Miro import/sync is intentionally not complete.
- [ ] Pulling Miro review metadata/comments is not complete.

### monday.com Bridge

- [x] monday preview/scaffold payload endpoints.
- [x] Branch-to-task preview UI exists.
- [x] Accepted local preview metadata can be staged as monday selection input.
- [x] monday selection input is consumed by monday export mapping.
- [x] Explicit confirmation is required before creating monday items.
- [x] monday export batches include durable `ExportBatch` metadata.
- [x] Task/procedure/needs_review nodes export to an existing board/group.
- [x] monday items are created in an existing group from accepted task nodes.
- [x] monday mappings include status, owner, due date, priority, source doc,
  source page, confidence, node type, review state, original node ID, app link,
  export batch ID, and last pushed timestamp.
- [x] monday board/item IDs are stored in `external_refs`.
- [x] monday auth configuration and token handling exist.
- [x] Reusable "Autodesk Building Block Review" template mapping exists.
- [x] monday status can be pulled back into node review status without changing
  canonical graph structure.
- [x] monday group-creation decision is made for MVP: exports require an
  existing board and group; automatic group creation from DocMap categories is
  deferred.
- [ ] Full bidirectional monday sync/conflict handling is intentionally not
  complete.

## MVP Required Acceptance

These are the features required to call the core MVP functional.

- [x] User can upload PDF, DOCX, Markdown, or TXT source documents.
- [x] System extracts text with source location where supported.
- [x] System chunks the document.
- [x] System generates and validates schema-valid graph JSON.
- [x] User sees an editable mind map.
- [x] Generated nodes have source references where grounded or are flagged
  `needs_review`.
- [x] User can edit node metadata.
- [x] User can save and reopen a workspace.
- [x] User can export internal JSON and Markdown.
- [ ] Manual full-loop smoke test with real PDF and DOCX uploads is still
  needed before declaring the MVP release-ready.

## MVP Plus

- [x] CSV task export.
- [x] OPML export.
- [x] MMD JSON export.
- [x] Mermaid export.
- [x] PNG/SVG export.
- [x] Branch-to-task preview.
- [x] Outline, task list, and table projections.
- [x] Workspace Brief persisted with the workspace.
- [x] Context-only "derive from brief" generation.

## Durable Schemas

- [x] `SourceDocument`
- [x] `DocumentChunk`
- [x] `GraphNode`
- [x] `GraphEdge`
- [x] `SourceRef`
- [x] `TaskProjection`
- [x] `ExternalRef`
- [x] `ExportBatch`
- [x] `GraphValidationReport`
- [x] `WorkspaceBrief` frontend/persistence shape
- [x] Dedicated no-source derivation contract in the frontend creates
  reviewable assumption nodes without fabricated source refs.
- [x] `WorkspaceBrief` backend schema validation.
- [x] `AIActionRun` schema for node/branch/workspace AI action history,
  previews, accept/reject status, source scope, prompt profile, and generated
  node IDs.

## Still Needed For Fully Functional MVP

1. Run a manual end-to-end smoke test with real PDF and DOCX documents:
   upload, extract, generate, validate, edit, save, reopen, and export JSON and
   Markdown.
2. Verify live Miro and monday pushes against real credentials and confirm
   returned external refs persist after save/reopen.

## Post-MVP Backlog

### Node AI Actions And Prompt Profiles

See `NODE_AI_ACTIONS_ROADMAP.md` for the implementation source of truth,
agent lanes, copy/paste agent prompts, ownership boundaries, and phase
checklists.

### Advanced AI Reconfiguration

- [ ] Expand selected node.
- [ ] Summarize selected branch.
- [ ] Reorganize branch.
- [ ] Split branch into categories.
- [ ] Merge duplicate nodes.
- [ ] Generate training outline.
- [ ] Export branch as SOP.

All graph mutations in this area must remain preview/confirm operations.

### Integration Sync

- [ ] Pull Miro review metadata/comment data.
- [ ] Import/reconcile from Miro.
- [ ] Create monday groups from top-level categories after target-template
  governance and conflict handling exist.
- [ ] Add full monday conflict handling before any broad bidirectional sync.
- [ ] Import/reconcile from monday.com.

### Enterprise Readiness

- [ ] Version history for source documents and graph revisions.
- [ ] Comments and review assignments.
- [ ] Approval workflow.
- [ ] Role-based permissions.
- [ ] Audit log.
- [ ] Retention settings.
- [ ] Share links.
- [ ] SharePoint/Loop publish path.
- [ ] Microsoft Planner export only if monday.com is not enough.
- [ ] Batch import.
- [ ] Template library.

## Test Strategy

- [x] Parser tests for PDF, DOCX, Markdown, and TXT.
- [x] MVP upload/extract/chunk fixture coverage for supported document types.
- [x] AI graph contract tests.
- [x] Graph schema validation tests.
- [x] Orphan/broken-edge tests.
- [x] Export snapshot tests for JSON, Markdown, CSV, OPML, MMD JSON, and
  Mermaid.
- [x] Miro payload snapshot tests.
- [x] monday payload snapshot tests.
- [x] End-to-end backend source trace test proving source document -> chunk ->
  source ref -> graph node -> node inspector/export payload data.
- [x] Frontend production build.
- [x] Browser-level brief-only MVP acceptance coverage for derive, review
  badges, metadata edit, save/reopen, and JSON export.
- [x] Unsupported/non-primary source guidance distinguishes source-traceable
  document intake from AI/data intake.
- [ ] Browser-level full-loop MVP smoke test with real PDF and DOCX uploads.
- [ ] Live credential smoke tests for Miro and monday handoff paths.
