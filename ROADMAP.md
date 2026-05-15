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

Status: Core MVP implementation is mostly in place. Real-file backend smoke
verification passed for PDF and DOCX intake, but live provider/browser release
verification and live integration handoffs are still incomplete.

Recently verified:

- Backend roadmap-relevant targeted tests pass: 71 passed.
- Frontend production build passes with `npm run build`.
- AI draft-session frontend contract tests pass with
  `node --test frontend/tests/aiDraftSessions.test.mjs`.
- Source draft review frontend contract tests pass with
  `node --test frontend/tests/sourceDraftReview.test.mjs`.
- Browser-level Ask AI regression paths pass for selected node, selected
  branch discard, selected source, whole workspace accept, and legacy profile
  discoverability: 5 Playwright tests passed.
- Backend Ask AI draft-session smoke paths pass for workspace, selected node,
  selected branch, and source-scoped requests. The selected-source UI now opens
  Ask AI from the Sources panel and sends source scope plus selected source
  chunks to the draft-session endpoint.
- Real-file backend upload smoke passed for `examples/gpt4all.pdf` and
  `examples/Project-Management-Plan-1.docx` using the real upload, extraction,
  chunking, source metadata, source draft review, save/reopen, JSON export, and
  Markdown export paths with a fixture AI provider in place of live OpenAI.
- Strict AI graph contract validation exists and is covered by tests.
- Document ingestion, source refs, graph validation, exports, Miro payloads,
  monday existing-group export, monday template mapping, monday status pull,
  and source trace coverage are covered by focused backend tests.

Known verification gap:

- The complete desktop/browser MVP loop still needs a live browser smoke with
  real OpenAI configuration: upload, generate, review source draft, edit, save,
  reopen, export JSON/Markdown, and confirm source/review indicators in the UI.
- Live Miro and monday.com pushes are not verified and remain incomplete.

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
- [ ] Remove the two remaining legacy Assistants file-search fallbacks after
  source chunk extraction covers every supported upload type; no workflow
  silently downshifts to a legacy model.

Current discrepancy:

- Older component Q&A and follow-up paths in `backend/app.py` now use
  Responses-backed component context helpers instead of the legacy Assistants
  helper.
- Remaining legacy Assistants exceptions are exactly:
  `openai_summarize_source` source-summary fallback when local chunks are
  unavailable, and `openai_mindmap_generator` graph-generation fallback when
  local chunks are unavailable. Both are disabled by default, require
  `DOCMAP_ALLOW_LEGACY_ASSISTANTS=true`, reject unsupported old model names,
  and persist/report `processing_type: "legacy_assistants"` plus
  `ai_provider.provider: "assistants_legacy_fallback"` when used.
- The dead web crawler Assistants block has been removed. Active web, image,
  audio, video, document-summary, document-graph, component Q&A, and Ask AI
  draft paths use Responses-backed helpers/adapters with GPT-5.5/GPT-5.4 model
  policy or explicit supported-model selection.

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

- [ ] Miro preview/scaffold payload endpoints are implemented and covered by
  tests, but are not live-verified for release.
- [ ] Dry-run Miro layout preview is implemented, but is not live-verified for
  release.
- [ ] Selected-branch Miro frame execution behind `miro_api_token` is
  implemented, but is not live-verified for release.
- [ ] Whole-workspace Miro board export is implemented, but is not
  live-verified for release.
- [ ] Shapes/connectors are the durable fallback export mode in code, but the
  handoff is not live-verified for release.
- [ ] Native Miro mind map API is evaluated and available as an optional
  dry-run planning path, but is not live-verified for release.
- [ ] Exported Miro objects preserve internal node IDs and source reference
  text in payload tests, but live persistence is not verified.
- [ ] Returned Miro board/item IDs are persisted in `external_refs` in code,
  but live persistence is not verified.
- [ ] Miro auth configuration and token handling exist in code, but are not
  live-verified.
- [ ] SME review board mode exists for `needs_review` nodes in code, but is not
  live-verified.
- [ ] Miro import/sync is intentionally not complete.
- [ ] Pulling Miro review metadata/comments is not complete.

### monday.com Bridge

- [ ] monday preview/scaffold payload endpoints are implemented and covered by
  tests, but are not live-verified for release.
- [ ] Branch-to-task preview UI exists, but monday handoff is not
  live-verified.
- [ ] Accepted local preview metadata can be staged as monday selection input,
  but live handoff is not verified.
- [ ] monday selection input is consumed by monday export mapping in tests, but
  live handoff is not verified.
- [ ] Explicit confirmation is required before creating monday items in code,
  but live creation is not verified.
- [ ] monday export batches include durable `ExportBatch` metadata in code, but
  live persistence is not verified.
- [ ] Task/procedure/needs_review nodes export to an existing board/group in
  code, but live export is not verified.
- [ ] monday items are created in an existing group from accepted task nodes in
  code, but live creation is not verified.
- [ ] monday mappings include status, owner, due date, priority, source doc,
  source page, confidence, node type, review state, original node ID, app link,
  export batch ID, and last pushed timestamp in payload tests, but live export
  is not verified.
- [ ] monday board/item IDs are stored in `external_refs` in code, but live
  persistence is not verified.
- [ ] monday auth configuration and token handling exist in code, but are not
  live-verified.
- [ ] Reusable "Autodesk Building Block Review" template mapping exists in
  tests, but is not live-verified.
- [ ] monday status can be pulled back into node review status without changing
  canonical graph structure in tests, but live status pull is not verified.
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
- [x] Backend full-loop smoke test with real PDF and DOCX uploads passed using
  a fixture AI provider: upload, extract/chunk, generate source draft, edit,
  save, reopen, export JSON, and export Markdown.
- [ ] Live browser/OpenAI full-loop smoke test with real PDF and DOCX uploads
  is still needed before declaring the MVP release-ready.

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
- [x] `AIDraftSession`, `AIDraftRevision`, draft item, preview diff, accept
  mode, and accept result contracts for Ask AI draft-first graph mutation.

## Still Needed For Fully Functional MVP

1. Run a live browser/OpenAI end-to-end smoke test with real PDF and DOCX
   documents: upload, extract, generate, validate, review/accept source draft,
   edit, save, reopen, and export JSON and Markdown.
2. Verify live Miro and monday pushes against real credentials and confirm
   returned external refs persist after save/reopen.

## Post-MVP Backlog

### Next-Gen Ask AI Drafting Table

Goal: make Ask AI a real conversational drafting workspace, not a one-shot
preview card. Users should be able to create, inspect, revise, merge, append,
or discard AI-generated structure before anything mutates the canonical graph.

Target experience:

```text
Ask AI
-> choose scope or infer from selection
-> classify intent and model policy
-> generate a structured draft session
-> user chats/refines against that draft
-> validate source refs and review status
-> accept selected changes as append / replace / merge
-> persist AIActionRun history and graph mutation metadata
```

Core product rules:

- [ ] Ask AI is the single front door for source librarian, reviewer, planner,
  training guide, data/table interpreter, and custom graph-building intents.
- [ ] All Ask AI outputs are draft-first and conversation-editable before
  graph mutation.
- [x] `AIDraftSession` and `AIDraftRevision` are not canonical graph state;
  they are temporary/reviewable proposal state until explicit acceptance.
- [ ] A draft session may contain proposed nodes, edges, annotations, tasks,
  checklist items, outline sections, table rows, kanban cards, charts, flow
  charts, presentation sections, handoff packages, SME questions, and
  source-repair suggestions.
- [ ] Draft sessions can be scoped to workspace, selected source document,
  selected branch, selected node, or multi-selected nodes.
- [ ] Users can refine a draft with follow-up prompts such as "add this
  manufacturer", "split by product line", "make this a checklist", "append only
  cited items", or "compare this to the new document".
- [ ] Users can add sources mid-session; the draft session can re-run coverage,
  citation repair, contradiction checks, and append proposals against the new
  context.
- [x] Accepting a draft supports explicit modes: append to selected scope,
  replace selected branch, merge into matching nodes, accept selected items,
  accept cited-only, or store as review notes.
- [x] Acceptance must show a preview diff: added nodes, added edges, updated
  nodes, review outputs, and unsourced items that will become `needs_review`.
- [x] Rejected or canceled drafts leave no canonical graph mutation, but may
  retain an auditable AIActionRun record.
- [x] Draft revisions can be discarded without affecting the canonical graph.
- [x] Accepted draft changes create an undoable graph revision or equivalent
  revert point.

Backend architecture:

- [x] Add a durable `AIDraftSession` schema with session ID, workspace ID,
  scope, role/profile, intent, prompt history, selected model policy, draft
  revisions, source refs, validation reports, and accept/reject history.
- [x] Add `AIDraftRevision` records for each model turn so users can compare,
  restore, or branch from earlier drafts.
- [x] Route draft generation and revision through Responses API via the DocMap
  AI provider adapter, not legacy Assistants paths.
- [x] Define strict JSON schemas for draft session responses: graph draft,
  patch/diff proposal, source coverage report, task/checklist projection,
  outline projection, table projection, presentation projection, and review
  annotations.
- [x] Add an intent classifier that maps plain language to capability,
  expected output shape, risk level, and model policy.
- [x] Add model policy levels: Speed, Balanced, Deep Review, and Explicit
  Model. The UI may show friendly labels while metadata records the actual
  selected model and reason.
- [ ] Add source-context builder support for selected node, branch, workspace,
  uploaded source chunks, source library gaps, and current draft session state.
  Backend/provider draft generation now includes workspace/node/branch/
  multi-node scoping, uploaded source chunks, and prior draft session state;
  source-library gap retrieval and add-source reconciliation still need
  integration.
- [x] Add graph-diff generation that emits patch operations instead of only
  whole replacement graphs.
- [x] Add preview-diff summaries for accept decisions, including counts like
  added nodes, relationship edges, updated nodes, checklist items, and
  `needs_review` repairs.
- [x] Enforce backend validation before accept: schema validity, edge targets,
  duplicate IDs, source refs, review state, confidence, and external-ref safety.
- [x] Backend must mark accepted uncited generated nodes `needs_review`; frontend
  marking remains only a UX convenience.
- [x] Persist accepted draft metadata into `AIActionRun` and graph node metadata
  so save/reload/export preserves provenance.
- [x] Provide a fixture/mock provider for offline draft-session tests.

Frontend UX:

- [x] Replace the current one-shot Ask AI preview card with an AI Draft Session
  panel that supports conversation, revision history, structured preview tabs,
  and explicit accept modes.
- [x] Show scope, role/profile, intent, model policy, selected model, model
  reason, source coverage, and preview-diff status in the draft panel.
- [ ] Show token/cost risk tier and full validation status in the draft panel
  once backend/provider metadata is available.
- [x] Show draft content in multiple projections: mind map diff, outline,
  checklist, task list, table, kanban, and presentation sections where
  applicable.
- [x] Let users select individual draft items before accept.
- [x] Let users choose append / replace / merge / cited-only / notes-only at
  accept time.
- [x] Show a human-readable preview diff before accept, for example:
  `+12 nodes`, `+4 edges`, `~2 nodes updated`, `!5 marked needs_review`.
- [ ] Show source-backed, needs-review, assumption, low-confidence, duplicate,
  and conflict badges directly in the draft panel.
- [x] Support conversational refinement against the current draft without
  closing the panel.
- [ ] Support "add another source" from inside the draft session and re-run
  coverage against the new source. The UI hook opens the existing source picker;
  source-aware re-run still needs backend/provider integration.
- [ ] Preserve keyboard-friendly controls and predictable focus behavior for
  repeated drafting.
- [ ] Keep the current source draft review panel as the specialized source
  ingestion entry point, but migrate it onto the shared draft-session contract.

Acceptance criteria:

- [ ] User can create an AI draft from selected node, selected branch, selected
  source, selected nodes, or whole workspace. Backend smoke verifies
  workspace/node/branch/source scopes; browser smoke verifies workspace/node/
  branch/source; multi-selected node UI coverage is still incomplete.
- [x] Prompt "create a mind map for cereals by manufacturer" creates a draft
  session with manufacturer branches and proposed child nodes, without mutating
  the graph. Covered by offline Responses fixture provider tests.
- [x] Follow-up "what about General Mills?" revises the same draft session and
  shows a new revision before accept.
- [x] User can revise a draft repeatedly without mutating the canonical graph.
- [ ] User can compare draft output to the current graph before accepting.
- [x] User can accept only selected manufacturers into the graph.
- [x] User can accept all, accept selected, append, replace, or merge.
- [ ] User can add a source document mid-session and ask the system to reconcile
  the draft against it.
- [x] Accepted changes run through canonical graph validation before persistence.
- [x] Source-backed accepted nodes retain citations after save/reload/export.
- [x] Unsourced accepted nodes are persisted as `needs_review`.
- [x] Draft sessions can be discarded without graph changes.
- [x] Accepted draft changes create a graph revision or undo point.
- [ ] Auto model selection records actual model and reason in the draft session
  and AIActionRun. Backend/provider draft generation records this in the draft
  session metadata; AIActionRun propagation still needs endpoint integration
  verification.
- [x] Explicit model selection records the selected model and does not override
  policy elsewhere. Backend/provider tests verify explicit model selection wins;
  browser/end-to-end verification remains part of the broader drafting-table
  test.
- [ ] Browser-level test covers draft creation, follow-up revision, selected
  accept, save/reload, and source/review indicators. Existing browser coverage
  verifies node selected-accept save/reopen with review/source badges, branch
  discard, workspace accept, and selected-source request scoping; full
  real-file browser/OpenAI coverage remains missing.
- [x] Backend tests cover intent classification, Responses request construction,
  schema parsing, graph diff validation, accept modes, and provenance
  persistence.
- [x] Backend graph-diff tests cover append/replace/merge/selected/cited-only/
  notes-only accept behavior, orphan-edge prevention, duplicate-ID-safe merge,
  unsourced `needs_review`, and undo snapshot creation.

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
- [x] Backend real-file full-loop smoke test with real PDF and DOCX uploads and
  fixture AI provider.
- [ ] Browser-level full-loop MVP smoke test with real PDF and DOCX uploads and
  live OpenAI configuration.
- [ ] Live credential smoke tests for Miro and monday handoff paths.
