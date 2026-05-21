# TraceSpace MVP Roadmap

This is the current implementation and MVP completion tracker for TraceSpace.
Keep it focused on what exists, what is still incomplete, and what must be
verified before calling the MVP shippable.

## Product North Star

Build an internal document-to-structured-workspace engine:

```text
PDF/DOCX/MD/TXT upload
-> extracted document structure
-> source-cited normalized graph
-> editable mind map, outline, task list, table, and exports
-> controlled post-review handoff to Miro and monday.com
```

The TraceSpace graph is canonical. Miro and monday.com are handoff destinations,
not replacements for the internal graph. This matters for enterprise adoption:
TraceSpace helps teams understand, structure, and validate work, then hands
reviewed outputs into the collaboration and tracking systems where execution
already lives.

## Current Status

Status: Core MVP implementation is mostly in place. Real-file backend smoke
verification passed for PDF and DOCX intake, but live provider/browser release
verification and live integration handoffs are still incomplete.

Recently verified:

- Backend roadmap-relevant targeted tests pass: 71 passed.
- Responses provider and web-source draft payload tests pass with
  `python -m pytest backend/tests/test_ai_provider_foundation.py backend/tests/test_ai_draft_web_sources.py`:
  11 passed.
- Frontend production build passes with `npm run build`.
- AI draft-session frontend contract tests pass with
  `node --test frontend/tests/aiDraftSessions.test.mjs`.
- AI draft-session plus graph projection contract tests pass together with
  `node --test tests/aiDraftSessions.test.mjs tests/graphProjection.test.mjs`
  from `frontend/`: 65 passed.
- Default shell regression coverage passes with
  `npx playwright test tests/e2e/shell-foundation-smoke.spec.js tests/e2e/review-tray-regression.spec.js tests/e2e/selection-shell-regression.spec.js --workers=1`
  from `frontend/`: 28 passed, 1 intentional legacy floating-panel skip.
- Source draft review frontend contract tests pass with
  `node --test frontend/tests/sourceDraftReview.test.mjs`.
- Browser-level Ask AI regression paths pass for selected node, selected
  branch discard, selected source, multi-selected nodes, whole workspace
  accept, and legacy profile discoverability: 6 Playwright tests passed.
- Backend Ask AI draft-session smoke paths pass for workspace, selected node,
  selected branch, and source-scoped requests. The selected-source UI now opens
  Ask AI from the Sources panel and sends source scope plus selected source
  chunks to the draft-session endpoint.
- Backend draft sessions can already carry prior draft state and source
  context. The server also exposes a source-reconciliation endpoint for adding
  source chunks to an active draft; the draft panel now exposes that
  reconciliation path for loaded sources.
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
- Product intent is now split out from delivery tracking in `PRODUCT_GUIDES.md`.
  Software inventory is only one lane; source-set review, Ask AI draft
  sessions, structured work outputs, enterprise readiness, code intelligence,
  and Miro/monday handoff have their own guide-level contracts. Roadmap items
  below should track implementation and verification, not redefine product
  intent.
- The live OpenAI smoke script is available at `backend/tests/live_openai_smoke.py`,
  but could not run in this environment because neither `openai_api_key` nor
  `OPENAI_API_KEY` is configured.
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
  generation through Responses with TraceSpace model policy.
- [x] Automatic document intake stages generated graph output in a source draft
  review panel before adopting it into the canonical workspace graph.

### AI Provider Refactor

Goal: remove the Assistants API dependency from TraceSpace generation paths.
OpenAI lists Assistants API removal for 2026-08-26, so remaining Assistants
paths are temporary legacy paths, not the product architecture.

- [x] Add `backend/ai/responses_client.py`.
- [x] Add a provider-neutral TraceSpace AI adapter interface.
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
  under a General profile group and use TraceSpace's preview/accept graph mutation
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
- [x] Build TraceSpace modal supports presets, desired outputs, source strictness,
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
  existing board and group; automatic group creation from TraceSpace categories is
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
- [x] `SourceSetReview` projection contract for loaded-source inventory,
  document classification, topic coverage, stale signals, duplicate groups, and
  missing expected artifacts. This supports folder-review language without
  implementing native filesystem folder upload.

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
- [x] A draft session may contain proposed nodes, edges, annotations, tasks,
  checklist items, outline sections, table rows, kanban cards, charts, flow
  charts, presentation sections, handoff packages, SME questions, and
  source-repair suggestions.
- [x] Draft sessions can be scoped to workspace, selected source document,
  selected branch, selected node, or multi-selected nodes.
- [ ] Users can refine a draft with follow-up prompts such as "add this
  manufacturer", "split by product line", "make this a checklist", "append only
  cited items", or "compare this to the new document". Backend revision exists;
  local guided fallback now preserves/refines reviewable scaffolds when backend
  generation is unavailable. Browser coverage for the richer prompt set remains
  open.
- [ ] Users can add sources mid-session; the draft session can re-run coverage,
  citation repair, contradiction checks, and append proposals against the new
  context. Backend helper, endpoint, tests, and draft-panel source
  reconciliation UI exist; browser save/reload verification remains open.
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
- [x] Route draft generation and revision through Responses API via the TraceSpace
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
- [x] Add source-context builder support for selected node, branch, workspace,
  uploaded source chunks, source library gaps, and current draft session state.
  Backend/provider draft generation now includes workspace/node/branch/
  multi-node/source scoping, uploaded source chunks, source-library gaps, and
  prior draft session state.
- [x] Add backend add-source reconciliation for active draft sessions. The
  `/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}/sources` endpoint
  can accept explicit chunks or resolve chunks from a `source_id`, then rerun
  draft reconciliation through the provider path.
- [ ] Add source retrieval/ranking and token-budget policy for workspace,
  branch, and multi-source drafting. Current backend context can include
  library chunks broadly; production behavior should select the most relevant
  chunks, record what was included/excluded, and expose the reason in metadata.
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
- [x] Support "add another source" from inside the draft session and re-run
  coverage against the new source. The draft panel can choose a loaded source,
  post its chunks to the draft-session `/sources` endpoint, and refresh the
  active draft revision.
- [x] Support explicit multi-source Ask AI selection in the UI. Users should be
  able to choose multiple loaded documents/sources, ask one prompt against that
  bounded source set, and see which sources/chunks were used in the draft.
- [ ] Preserve keyboard-friendly controls and predictable focus behavior for
  repeated drafting.
- [ ] Keep the current source draft review panel as the specialized source
  ingestion entry point, but migrate it onto the shared draft-session contract.

Acceptance criteria:

- [x] User can create an AI draft from selected node, selected branch, selected
  source, selected nodes, or whole workspace. Backend smoke verifies
  workspace/node/branch/source scopes; browser smoke verifies workspace/node/
  branch/source/multi-selected-node scoping.
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
  the draft against it. Implementation and focused contract coverage exist;
  browser save/reload verification remains open.
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
- [x] Browser-level test covers draft creation, follow-up revision, selected
  accept, save/reload, and source/review indicators. Existing browser coverage
  verifies node selected-accept save/reopen with review/source badges, branch
  discard, workspace accept, selected-source request scoping, and
  multi-selected-node request scoping; full real-file browser/OpenAI coverage
  remains missing.
- [x] Backend tests cover intent classification, Responses request construction,
  schema parsing, graph diff validation, accept modes, and provenance
  persistence.
- [x] Backend graph-diff tests cover append/replace/merge/selected/cited-only/
  notes-only accept behavior, orphan-edge prevention, duplicate-ID-safe merge,
  unsourced `needs_review`, and undo snapshot creation.

### Canvas-Native Follow-Up Actions And Reviewable Diffs

Goal: make AI follow-up actions feel like part of the workspace instead of a
detached prompt box. When a user selects a node, branch, source, or confidence
issue, TraceSpace should show what AI can do, what context will be used, what
kind of proposal will come back, and how the user can accept it safely.

Target experience:

```text
select node / branch / source / confidence issue
-> choose action: update, supplement, compare, find gaps, create tasks
-> see context and expected output before running
-> AI returns a reviewable diff
-> user chooses keep existing / replace / merge / add alternate
-> canonical graph mutates only after acceptance
```

Priority work:

- [ ] Add a follow-up action panel for selected node, branch, source, and
  confidence repair queues.
- [ ] Provide clear action cards for `Update this`, `Supplement with source`,
  `Compare against source`, `Find gaps`, and `Create tasks`.
- [ ] Show context-before-run: selected scope, included sources/chunks, prior
  draft/session, inferred intent, and expected output shape.
- [ ] Add an AI diff preview for node/branch updates with explicit choices:
  keep existing, replace, merge, add as alternate, or accept selected changes.
- [ ] Turn graph confidence into a repair queue: missing sources, review flags,
  weak connections, sparse branches, and source-only sections.
- [ ] Add source-first actions when users upload before mapping: create mind
  map, create table, find entities, create tasks, summarize source, and compare
  to current workspace when one exists.
- [ ] Make connection review first-class: typed relationship candidates,
  confidence, rationale, source/assumption basis, accept/reject, and explain.
- [ ] Preserve the existing preview-first rule for all follow-up mutations.
- [ ] Cover the milestone with browser tests for: selected node update,
  source supplement, source compare, confidence repair action, and source-first
  action routing.

### Sankey Flow Lens

See `PRODUCT_GUIDE_SANKEY_FLOW_LENS.md` for product intent and review rules.

Goal: add an optional Sankey lens for directional weighted data so users can
query evidence flow, handoffs, dependencies, ownership/status movement, and
structured query results without creating a separate diagram state.

Target experience:

```text
eligible graph or structured data
-> detect source / target / value paths
-> show Sankey lens or preview
-> click flow path to inspect/filter source-backed rows
-> export reviewable flow rows with metric and source refs
```

Priority work:

- [x] Register Sankey as a supported chart/lens contract without making it a
  default canvas tab.
- [x] Detect structured data columns that can produce Sankey rows: source,
  target, value/count, group, status, owner, risk, confidence, and source refs.
- [x] Extend chart artifacts to support `chart_spec.chart_type = "sankey"`,
  preserving query id, result hash, selected metric, and source refs.
- [x] Render structured-data Sankey previews with existing Plotly dependencies.
- [ ] Add click-to-filter behavior from Sankey node/band to represented table
  rows and source context.
- [x] Add a first workspace Sankey projection helper for accepted structured
  evidence source/target/value paths.
- [ ] Expand workspace Sankey projection to source-to-node, node-to-output,
  handoff, dependency, owner/status, and evidence-flow paths.
- [x] Keep inferred paths preview-first and mark unsupported generated weights
  as `needs_review`.
- [x] Add Markdown/JSON export of Sankey flow rows, selected metric, review
  state, unsupported paths, and source refs.
- [x] Add focused tests for structured-data eligibility, Plotly Sankey spec
  generation, and source/ref preservation.
- [ ] Add tests for click filtering and export shape.

### Node AI Actions And Prompt Profiles

Status: the current Node AI Actions scope is complete. See
`NODE_AI_ACTIONS_ROADMAP.md` as a closed reference for the landed implementation
contract, browser coverage, and historical agent lanes. Track new AI action
work here or in a new focused follow-up roadmap.

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

### Intent-Driven Readiness

Goal: turn TraceSpace from a source-cited workspace mapper into an
intent-driven analysis system. Enterprise operating-graph work is one strong
intent pack, not the whole product identity. The same canonical graph,
source-ref, draft/accept, scoring, and export plumbing must also support
technical standards reviews, team roadmaps, compliance checks, training
packages, project recovery, research synthesis, and other source-backed use
cases.

The product should ask, explicitly or implicitly:

```text
What is the user trying to accomplish with these sources?
```

Then it should choose the right ontology, analysis pack, output shape, scoring
dimensions, and review rules for that intent.

Miro and monday.com live verification is blocked until usable API credentials
are available. Keep their payload tests and preview/confirmation flows healthy,
but do not gate enterprise graph work on live integration execution.

#### Intent Packs

- [ ] Treat enterprise operating graph as one registered intent pack, alongside
  standards completeness review, complex-issue-to-roadmap, SOP/checklist,
  training outline, source coverage, compliance/audit review, software
  rationalization, project recovery, and custom analysis.
- [ ] Add intent selection/routing that maps plain language prompts and
  Workspace Brief outputs to the right role, action, artifact type, scoring
  dimensions, and review policy.
- [ ] Keep every intent pack preview-first: generated findings, nodes, tasks,
  reports, and roadmaps must remain draft state until accepted.
- [ ] Let domain-specific packs add vocabulary without making the whole app
  business-only.

#### Standards And Technical Review

- [x] Add source-set/folder-review contracts for grouped files:
  file inventory, document classification, topic coverage, stale guidance,
  duplicate materials, and missing expected artifacts are now projected from
  the loaded source set.
- [x] Add native folder/file-set intake for source review:
  supported PDF, DOCX, Markdown, and TXT files preserve relative paths,
  source-set metadata, source-library records, and `native_folder_upload`
  status for review projections.
- [x] Add a standards-completeness intent for source folders and grouped files:
  identify required sections, missing standards, stale guidance, contradictions,
  weak source coverage, unclear ownership, and SME review questions.
- [x] Add starter guidance for Revit/BIM standards review, while keeping the
  pattern reusable for other technical standards libraries.
- [ ] Add source coverage and completeness scoring for standards packs:
  documented, partially documented, missing, conflicting, outdated, and
  needs_review.

#### Team Roadmap From Complex Sources

- [x] Add a complex-issue-to-team-roadmap intent that turns dense source
  material into a team-facing roadmap with context, decisions, workstreams,
  dependencies, risks, milestones, owners to assign, and source-backed appendix.
- [ ] Support roadmap outputs as outline, tasks, presentation sections, and
  executive/team summary views.
- [ ] Preserve assumptions separately from source-backed facts.

#### Enterprise Operating Graph

- [ ] Add a business ontology registry for enterprise node/entity types:
  business_unit, capability, process, system, application, role, team, owner,
  KPI, risk, control, project, decision, dependency, cost, and
  customer_segment.
- [ ] Add enterprise relationship types: owns, supports, depends_on,
  duplicates, conflicts_with, implements, measures, blocks, creates_risk_for,
  requires_approval_from, used_by, and funded_by.
- [ ] Preserve generic mind-map compatibility while allowing enterprise nodes
  and cross-links to be projected as an operating graph.
- [ ] Validate enterprise relationship edges with source refs or explicit
  assumptions, and mark inferred/unsupported relationships as needs_review.
- [ ] Add source-backed entity extraction guidance for business documents,
  inventories, org charts, process docs, standards, risks, controls, and project
  records.

#### Enterprise Scoring

- [ ] Add scoring dimensions for confidence, business impact, implementation
  effort, risk severity, source coverage, and owner clarity.
- [ ] Surface workspace-level enterprise readiness, including source coverage,
  owner coverage, review burden, cross-link density, unresolved decisions, and
  high-risk unsupported claims.
- [ ] Score analysis findings and recommended actions so executive outputs can
  be sorted by impact, risk, and effort.
- [ ] Keep scores explainable: each score must expose the fields, evidence, or
  assumptions that drove it.

#### Guided Analysis Packs

- [ ] Add guided enterprise prompts for:
  find process bottlenecks, find duplicate tools, find ownership gaps, find
  unsupported business-critical systems, create a 30/60/90 day improvement
  plan, and create a stakeholder review package.
- [ ] Add analysis pack output contracts for operating model visibility,
  technology rationalization, process improvement, project recovery, M&A
  integration planning, and compliance/audit readiness.
- [ ] Route analysis packs through draft-session preview/accept so no
  enterprise finding mutates the canonical graph without review.
- [ ] Include source coverage, assumptions, confidence, owner, impact, risk,
  and recommended next action on each finding where available.

#### Executive Outputs

- [ ] Add executive output mode with summary, key findings, recommended actions,
  risks, required decisions, and source-backed appendix.
- [ ] Add enterprise artifact types for operating_model_map, capability_map,
  process_improvement_report, software_rationalization_report,
  risk_opportunity_report, implementation_handoff_package, and
  decision_dependency_map.
- [ ] Export executive packages as Markdown/JSON first, with Miro/monday handoff
  candidates generated only after user confirmation and credential availability.
- [ ] Add review-ready appendix sections that show source refs, unsupported
  assumptions, low-confidence findings, and open SME questions.

#### Enterprise Governance

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

### GitHub Code Intelligence

Goal: connect a GitHub repo or folder and turn source code, docs, issues, and
PRs into a source-cited code knowledge graph that helps developers find weak
spots, missing tests, documentation gaps, dependency risks, and refactor
opportunities. This is a codebase understanding and handoff layer, not a
replacement for coding agents.

Target experience:

```text
Connect GitHub
-> select repo / branch / folder
-> choose analysis mode
-> build code knowledge graph
-> review source-backed findings
-> generate task candidates / roadmap / PR plan
```

Positioning:

- [ ] Treat GitHub integration as repo intelligence and engineering audit, not
  IDE autocomplete, autonomous coding, or another PR-writing agent.
- [ ] Use TraceSpace to explain, audit, map, prioritize, and hand off codebase
  understanding; let developers or coding agents execute accepted tasks.
- [ ] Keep every finding source-cited with file/line evidence where possible,
  or mark it `needs_review`.

#### GitHub Source Model

- [x] Add `github_repo` as a source type for scan results.
- [ ] Add child source types for `github_file`, `github_directory`,
  `github_issue`, `github_pull_request`, `github_commit`,
  `github_workflow_run`, `github_code_search_result`, and
  `github_dependency_manifest`.
- [x] Store GitHub file source refs with repo, branch, path, sha, language,
  source URL, and line ranges.
- [x] Support line-level citations for files, functions, components, and
  source-backed findings.
- [ ] Add route, issue, PR, commit, workflow-run, and roadmap-item citations.
- [ ] Preserve repo/source metadata through exports and draft-session
  provenance.

#### Read-Only GitHub Ingestion

- [x] Add BYO-token read-only GitHub client for per-request scans; tokens are
  not persisted or echoed.
- [x] Select repo, branch/ref, and folder scope through the backend scan
  request.
- [x] Fetch file tree with ignore patterns.
- [x] Ingest supported first-pass file types: `.py`, `.js`, `.jsx`, `.ts`,
  `.tsx`, `.md`, `.json`, `.yaml`, `.yml`, and `.toml`.
- [x] Exclude generated/build folders by default: `node_modules`, `dist`,
  `build`, `.venv`, `__pycache__`, and `coverage`.
- [x] Never ingest `.env`, private keys, or known secret files.
- [x] Add file size, file count, and repo scope limits for GitHub scans.
- [ ] Add warning metadata for skipped suspected secrets without exposing
  values.

#### Local-First Code Intelligence Foundation

- [x] Add hidden backend-only `backend/code_intelligence` package.
- [x] Scan a local repo/folder without GitHub auth.
- [x] Ignore generated/build folders and known secret files by default.
- [x] Emit source-cited file and symbol nodes with path, sha, line ranges, and
  quote snippets.
- [x] Emit code `source_documents` and symbol-level `document_chunks` compatible
  with the existing source/ref mental model.
- [x] Emit deterministic `contains`, local `imports`, external
  `uses_dependency`, conservative Python `calls`, file/symbol `tested_by`, and
  `missing_test_for` relationships.
- [x] Emit conservative `entrypoint_for` relationships from package scripts,
  frontend root files, and Python main patterns.
- [x] Emit gap nodes and source-backed findings for missing tests and missing
  public symbol documentation.
- [x] Include developer-only capability visibility metadata so later UI work can
  keep code intelligence hidden by default.
- [x] Add server-side capability contract and gated local scan endpoint; scanning
  requires `DOCMAP_ENABLE_CODE_INTELLIGENCE=true` and an allowlisted repo root.
- [x] Add gated BYO-token GitHub scan endpoint and Markdown report endpoint.

#### Deterministic Code Graph

- [x] Build deterministic code structure before AI interpretation.
- [x] Extract local starter code node types: repo, file, function, class,
  component, test, dependency, and gap.
- [ ] Add api_route, issue, risk, and PR/CI-backed nodes after the local file
  graph is stable.
- [x] Extract starter code relationships: contains, imports, calls, tested_by,
  missing_test_for, uses_dependency, and entrypoint_for.
- [ ] Add depends_on, documents, missing_docs_for, modified_by,
  referenced_by_issue, affected_by_pr, high_churn, and low_coverage.
- [x] Parse ASTs where practical, then use regex and path heuristics as
  documented fallbacks.
- [x] Parse package/dependency manifests for dependency nodes and package script
  entrypoints.
- [x] Link tests to source files and symbols using naming, path, import, and
  call heuristics.

#### AI Code Analysis Artifacts

- [x] Add deterministic `code_knowledge_graph` scan artifact and Markdown
  engineering report projection.
- [ ] Register AI-facing artifact types for repo_architecture_map,
  weak_spot_report, test_gap_report, dependency_risk_report, pr_impact_report,
  refactor_roadmap, developer_onboarding_map, and github_issue_candidates.
- [ ] Generate architecture maps that distinguish frontend, backend,
  integrations, routes, components, provider layers, and tests.
- [ ] Generate weak spot reports for large files, duplicate logic, schema drift,
  high-churn areas, missing validation, unreliable integration paths, and
  ownership gaps.
- [ ] Generate missing test reports for routes, schema changes, prompts,
  critical paths, high-churn files, and integration seams.
- [ ] Generate documentation gap reports for public APIs, complex modules,
  schemas, prompts, setup flows, and implemented-but-undocumented features.
- [ ] Generate dependency risk reports using manifests, lockfiles where
  appropriate, and security finding inputs.
- [ ] Generate refactor roadmaps and onboarding maps as reviewable draft
  artifacts before graph mutation or external handoff.

#### Developer Handoff

- [ ] Create GitHub issue candidates with preview and explicit confirmation.
- [ ] Export Markdown engineering reports.
- [ ] Export accepted task candidates to monday.com.
- [ ] Export architecture and impact maps to Miro.
- [ ] Add PR impact analysis for selected changed files: changed files,
  affected functions, affected routes/components, related tests, missing tests,
  related issues, and risk score.

#### GitHub Guardrails

- [ ] Read-only by default.
- [ ] Require repo allowlists and branch selection.
- [ ] Do not perform GitHub writes without explicit preview and confirmation.
- [ ] Keep deterministic parsing upstream of AI ranking/explanation.
- [ ] Mark uncited or inferred findings as `needs_review`.
- [ ] Support local-only scan mode for sensitive repos.

#### Audience And Capability Visibility

- [ ] Keep code intelligence hidden from the default TraceSpace experience.
- [ ] Do not add GitHub/code analysis to default navigation, source picker,
  Workspace Brief presets, nudges, or standard Ask AI profiles.
- [ ] Expose code intelligence only through an explicit developer capability
  gate such as `docmap:developerMode` or a server-provided entitlement.
- [ ] With the capability disabled, non-developer users should see no copy,
  controls, examples, or onboarding paths that suggest TraceSpace is for code
  repositories.
- [ ] Treat frontend hiding as UX only; backend endpoints must still enforce
  read-only scope, repo allowlists, and capability checks before scanning or
  connecting repositories.
- [x] Enforce backend capability checks and local repo root allowlists for the
  local-first scanner endpoint.

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
