# DocMap Roadmap

This is the living roadmap for the fork. Keep this file current when scope changes, a phase completes, or a new integration decision becomes durable.

## Product North Star

Build an internal document-to-structured-workspace engine:

```text
PDF/DOCX/MD/TXT upload
-> extracted document structure
-> source-cited normalized graph
-> editable mind map, outline, task list, table, and exports
-> post-review handoff actions to Miro and monday.com
```

The app is the canonical structure engine. Miro and monday.com are endpoints, not replacements for the internal graph.

## Roadmap Rules

1. The normalized graph is the source of truth.
2. Every view is a projection of that graph.
3. AI output should be schema-bound and source-cited.
4. External integrations must preserve internal node IDs.
5. Push to external tools before pulling changes back.
6. Do not build broad collaboration until the document-to-graph loop is reliable.
7. Keep neutral exports working even when external API credentials are unavailable.
8. Any AI-generated node without a source reference must be marked `needs_review`.
9. No export to Miro or monday.com should be considered final unless source refs are preserved or explicitly waived.
10. Any AI operation that mutates the graph must produce a preview diff and require user acceptance before persistence.
11. Workspace intent belongs in a structured brief, not in unbounded chat history; any context-only generation must be flagged as assumption-based until source-backed.
12. Miro and monday exports occur only after graph validation and user confirmation; they are handoff actions, not primary generation outputs.

## Current Phase

Phase 4 Integration Readiness / ExportBatch Hardening.

The document reliability, graph validation, review UI, local preview, and Miro execution paths are in place. The immediate priority is turning accepted local preview metadata into controlled monday exports, stabilizing `ExportBatch` as a durable schema, and verifying the full MVP acceptance loop with real upload fixtures.

Next product enhancement: make the Workspace Brief visible in the primary workflow so users can start from a document, document plus context, or context-only intent before deriving structure.

## Durable Schemas

These schemas should become stable contracts instead of implicit frontend state shapes.

- [x] `SourceDocument`
- [x] `DocumentChunk`
- [x] `GraphNode`
- [x] `GraphEdge`
- [x] `SourceRef`
- [x] `TaskProjection`
- [x] `ExternalRef`
- [x] `ExportBatch`
- [x] `GraphValidationReport`
- [ ] `WorkspaceBrief`

Minimum `WorkspaceBrief` shape:

```json
{
  "goal": "What the user wants to derive",
  "audience": "Who the output is for",
  "domain_context": "Relevant domain or project context",
  "desired_outputs": ["mind_map", "outline", "tasks", "checklist", "sme_questions", "source_coverage_report"],
  "source_mode": "source_only|source_plus_context|context_only",
  "assumptions_allowed": false,
  "preset": "custom|autodesk_standards|revit_building_blocks|software_inventory|training_guide|sop_workflow",
  "output_style": "technical_reference_map|project_execution_map|training_onboarding_map|sop_checklist_map|review_approval_map",
  "node_types": ["category", "standard", "workflow", "requirement", "task", "reference", "needs_review"],
  "review_policy": ["mark_uncited_needs_review", "mark_low_confidence_needs_review"],
  "review_rules": "How uncertain or uncited output should be handled"
}
```

UX status: guided Build DocMap modal, presets, internal output profiles, source strictness, node taxonomy controls, review policy, persistence slice, canvas status panel, source-picker entry point, QA request payload wiring, and frontend derivation metadata stamping are in place. Miro/monday remain post-generation handoff actions after review/validation. The next hardening step is a dedicated "derive from brief" generation action for true no-source workspaces.

Minimum `ExportBatch` shape:

```json
{
  "id": "export-uuid",
  "export_batch_id": "export-uuid",
  "integration": "miro|monday|json|markdown|csv",
  "workspace_id": "workspace-uuid",
  "workspace_title": "Workspace title",
  "target": "miro|monday|json|markdown|csv",
  "mode": "dry_run|confirmed_payload|executed",
  "scope": "workspace|branch",
  "root_node_id": "node-uuid",
  "created_at": "datetime",
  "created_by": "user-id",
  "external_target_id": "board-id-or-url",
  "item_count": 42,
  "status": "previewed|confirmed|executed|pushed|failed|partial"
}
```

## Phase 0 - Fork Alignment

Status: mostly complete.

- [x] Define the fork as DocMap, not a generic AI demo.
- [x] Add agent guidance in `AGENT.md`.
- [x] Document the one-graph-many-views architecture.
- [x] Add GPT-5.4 and GPT-5.5 as selectable OpenAI model targets.
- [x] Establish Miro as visual collaboration endpoint.
- [x] Establish monday.com as task execution endpoint.
- [ ] Remove or quarantine upstream demo paths that distract from DocMap.

## Phase 1 - MVP Spine

Goal: prove PDF/DOCX/MD/TXT -> AI hierarchy -> editable graph -> save/export.

- [x] Limit primary ingestion UI to PDF, DOCX, Markdown, and TXT.
- [x] Preserve source document metadata: ID, filename, type, hash, version, status.
- [x] Extract text with source location where possible.
- [x] Chunk documents by page, heading, and semantic boundaries.
- [ ] Generate strict JSON graph output from AI.
- [x] Validate generated graph for orphan nodes and broken edges.
- [x] Render graph in React Flow.
- [x] Save and reload workspaces using existing backend persistence.
- [x] Add internal graph export endpoint.
- [x] Add Markdown export endpoint.
- [x] Add CSV task export endpoint.
- [x] Add OPML export endpoint.
- [x] Add MMD-compatible JSON export endpoint.
- [x] Add Mermaid export endpoint.

## Phase 1.5 - Graph Reliability Layer

Goal: make document ingestion, AI graph generation, and graph validation reliable enough for editing, citations, and export.

- [x] Normalize source document metadata across all supported file types.
- [x] Implement source-aware chunk model.
- [x] Add deterministic chunk IDs.
- [x] Require AI graph output to pass schema validation.
- [x] Reject or repair orphan nodes.
- [x] Reject or repair invalid parent IDs.
- [x] Detect duplicate node IDs.
- [x] Enforce one root node.
- [x] Attach source refs to generated nodes where possible.
- [x] Add graph validation report in UI.
- [x] Add fallback `needs_review` state for low-confidence generated nodes.
- [x] Enforce file size limits.
- [x] Restrict allowed file extensions.
- [x] Sanitize uploaded filenames.
- [x] Hash uploaded files.
- [x] Prevent duplicate uploads unless versioned.
- [x] Add basic error handling for malformed PDFs/DOCX files.
- [x] Add environment-based API key handling.

## Phase 2 - Usable Internal Tool

Goal: make generated maps reviewable and useful before external handoff.

- [x] Add node-detail UI for title, type, review status, owner, due date, priority, confidence, source refs, and external refs.
- [x] Persist richer node metadata consistently through save/load.
- [x] Add source citation display in the node detail panel.
- [x] Add review-state badges on nodes.
- [x] Add confidence indicators on nodes.
- [x] Add graph validation panel showing orphan nodes, duplicate node IDs, missing source refs, low-confidence nodes, invalid external refs, and task nodes missing task metadata.
- [x] Add true outline view from the canonical graph.
- [x] Add true task-list view from the canonical graph.
- [x] Add table view from the canonical graph.
- [x] Add branch selection as a first-class operation.
- [x] Add branch-to-task preview before accepting generated tasks.
- [x] Add export buttons for neutral formats in the UI.
- [x] Add PNG/SVG export for visible mind maps.

## Phase 2B - Local AI Reconfiguration

Goal: reshape and repair graph branches locally before sending anything to external systems.

- [x] Convert branch to tasks with preview.
- [x] Convert branch to checklist with preview.
- [x] Identify missing information.
- [x] Create SME review questions.
- [x] Find or repair source references.

## Phase 3 - Miro Bridge

Goal: send source-cited visual branches to Miro without making Miro canonical.

- [x] Add preview/scaffold endpoints for Miro export payloads.
- [x] Add dry-run Miro layout preview before export.
- [x] Add selected-branch Miro frame execution endpoint behind `miro_api_token`.
- [x] Persist returned Miro board/item IDs in `external_refs`.
- [x] Add production UI flow for user-triggered selected-branch Miro export.
- [x] Implement whole workspace to Miro board export.
- [x] Use shapes and connectors as the durable fallback export.
- [x] Evaluate native Miro mind map API as optional export mode.
- [x] Preserve internal `node_id` on every exported Miro object.
- [x] Include source reference text on exported Miro objects.
- [x] Add Miro auth configuration and token handling.
- [x] Add "Generate SME review board" mode for `needs_review` nodes.
- [ ] Add Miro import/sync only after export mappings are stable.

## Phase 4 - monday.com Bridge

Goal: export actionable task subsets to monday.com with a preview/confirm flow.

- [x] Add preview/scaffold endpoints for monday export payloads.
- [x] Add branch-to-task preview UI component.
- [x] Expose accepted local preview metadata as monday selection input.
- [x] Wire monday selection input into monday export flow.
- [x] Require explicit user confirmation before creating new boards/groups/items.
- [x] Add export batch ID for monday exports.
- [x] Export task/procedure/needs_review nodes to an existing board/group.
- [ ] Create monday groups from top-level categories.
- [x] Create monday items in an existing group from accepted task nodes.
- [x] Map status, owner, due date, priority, source doc, source page, confidence, node type, review state, original node ID, app link, export batch ID, and last pushed timestamp.
- [x] Store monday board/item IDs in `external_refs`.
- [x] Add monday.com auth configuration and token handling.
- [x] Add a reusable "Autodesk Building Block Review" board template mapping.
- [x] Pull monday status back into node review status.
- [ ] Avoid full bidirectional sync until conflict handling exists.

## Phase 5 - Advanced AI Reconfiguration

Goal: support higher-order branch restructuring after local validation and preview workflows are reliable.

All Phase 5 graph mutations must be preview/confirm operations before they modify the canonical graph.

- [ ] Expand selected node.
- [ ] Summarize selected branch.
- [ ] Reorganize branch.
- [ ] Split branch into categories.
- [ ] Merge duplicate nodes.
- [ ] Generate training outline.
- [ ] Export branch as SOP.

## Phase 6 - Enterprise Readiness

Goal: make the tool supportable for internal use after the MVP loop is reliable.

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

AI output will vary, so fixtures and snapshots should protect the graph contract and projection behavior.

- [ ] Add fixture documents for PDF, DOCX, Markdown, and TXT.
- [x] Add parser tests for each file type.
- [x] Add graph schema validation tests.
- [x] Add orphan/broken-edge tests.
- [x] Add export snapshot tests for JSON, Markdown, CSV, OPML, MMD JSON, and Mermaid.
- [x] Add Miro payload snapshot tests.
- [x] Add monday payload snapshot tests.
- [x] Add end-to-end trace test proving source document -> chunk -> source ref -> graph node -> node inspector -> export payload.

## Integration Priority

1. Pull Miro review metadata/comment data.
2. Import/reconcile from Miro or monday.com.

## Acceptance Checkpoints

### MVP Required

- [ ] User uploads one PDF or DOCX.
- [x] System extracts text with source location.
- [x] System chunks the document.
- [ ] System generates schema-valid graph JSON.
- [ ] User sees an editable mind map.
- [ ] Each generated node has source references or is flagged `needs_review`.
- [ ] User can edit node metadata.
- [ ] User can save and reopen a workspace.
- [ ] User can export internal JSON and Markdown.

### MVP Plus

- [x] CSV task export.
- [x] OPML export.
- [x] MMD JSON export.
- [x] Mermaid export.
- [x] PNG/SVG export.
- [x] Branch-to-task preview.

### Miro Bridge

- [x] User selects a branch and previews the computed Miro layout.
- [x] User exports the selected branch to a Miro frame.
- [x] User exports the whole workspace to a Miro board frame.
- [x] Miro objects preserve hierarchy.
- [x] Miro objects include internal node IDs.
- [x] Miro objects include app backlinks and source reference text.
- [x] Backend stores returned Miro external refs for future sync.

### monday.com Bridge

- [ ] User selects a branch and previews generated tasks.
- [ ] User confirms which task nodes should be exported.
- [x] User explicitly confirms before creating board/group items.
- [x] monday items are created with source and review metadata.
- [x] monday external refs include board/item IDs, export batch ID, and last pushed timestamp.
- [x] The app stores monday external refs for future sync.
- [ ] The app can pull status back without overwriting canonical structure.

## Recently Completed

- Added Agent A document reliability layer for source metadata, deterministic chunk IDs, upload validation, filename sanitization, hashing, duplicate/version handling, and malformed document errors.
- Added source-location extraction for PDF pages, DOCX paragraphs/headings, Markdown/TXT character offsets, plus environment/API-key guards and setup docs.
- Added chunk-based source-ref grounding for generated mind-map nodes before persistence.
- Added parser coverage for PDF, DOCX, Markdown, and TXT source-location extraction using lightweight fixtures/generated documents.
- Added end-to-end backend source trace coverage from source document and chunk through generated node source refs, normalized graph task rows, and Miro/monday export payloads.
- Verified the strict MVP upload/extract/chunk contract for PDF, DOCX, Markdown, and TXT fixtures, and routed primary upload preparation through that contract so non-primary formats are rejected before extraction.
- Removed the test-only `reportlab` dependency from PDF parser verification by using a static PDF fixture payload.
- Limited the primary frontend source picker to workspace briefs plus PDF, DOCX, Markdown, and TXT by default, while preserving upstream demo sources behind the runtime `docmap:showLegacySources` browser flag.
- Updated source-ref grounding so ungrounded generated nodes carry `source_refs: []` and default to `needs_review` unless an explicit status already exists.
- Added neutral export scaffolding and endpoints for JSON, Markdown, CSV, OPML, MMD JSON, and Mermaid.
- Added Miro and monday preview export endpoints that do not call live external APIs yet.
- Added node metadata inspector for source refs, review fields, task fields, and external refs.
- Added node badges for review status, confidence, source citation presence, and node type.
- Added header export actions for neutral formats that save the current workspace before download.
- Added visible mind map export controls for both PNG and SVG downloads.
- Added graph validation review panel and richer node inspector citation display.
- Added backend graph contracts, validation repair, validation report data, and tests for Agent B graph reliability.
- Added Agent D local graph projection views for outline, task list, table, branch selection, and branch-to-task preview.
- Added Agent D branch-to-checklist preview flow with local accept metadata under `frontend/src/views/`.
- Added Agent D missing-information review preview with local accept metadata under `frontend/src/views/`.
- Added Agent D SME review-question preview with local accept metadata under `frontend/src/views/`.
- Added Agent D source-reference repair preview with local source suggestions and accept metadata under `frontend/src/views/`.
- Standardized Agent D local preview acceptance metadata so task, checklist, gap, SME, and source repair flows share a common handoff trail.
- Added Agent D monday selection input view that stages accepted local preview metadata as export-ready node data without calling monday APIs.
- Added Agent D monday selection manifest and board-template grouping hints for Agent E export/template mapping.
- Added Agent D monday status-back readiness view that stages local `monday_status_back_input` from monday external refs without calling monday APIs.
- Hardened Agent B graph/export contracts around durable monday `ExportBatch` payloads, reusable templates, executed response shapes, staged monday selection metadata, and persisted Miro/monday external refs.
- Simplified the main app navigation so core graph views remain visible while review and handoff tools sit behind compact grouped selectors.
- Added the first Workspace Brief UI slice with structured intent fields persisted in workspace JSON and included in normalized workspace exports.
- Reframed the roadmap around Phase 1.5 graph reliability before deeper views and live integrations.
- Updated project docs around the DocMap direction and integration stance.

## Next Best Work

1. Verify MVP Required acceptance with fixture uploads, save/reopen, and JSON/Markdown export.
2. Limit primary ingestion UI to PDF, DOCX, Markdown, and TXT.
3. Add reusable "Autodesk Building Block Review" board template mapping.
4. Add Miro SME review board mode for `needs_review` nodes.
5. Pull monday status back into node review status.

## Parallel Agent Slices

Use these ownership lanes when running multiple agents. Each slice should avoid editing another slice's owned files unless coordination is explicit.

### Next Parallel Round

These are the clean next assignments after Agents A-E completed the first slice.

- Agent A: verify MVP upload/extract/chunk acceptance with PDF, DOCX, Markdown, and TXT fixtures, then close any ingestion UI/API gaps.
- Agent B: support remaining graph/export contract checks as monday execution persistence lands.
- Agent C: verify node metadata edit -> save -> reopen behavior and polish validation/inspector UX only where acceptance testing exposes gaps.
- Agent D: available for local projection support if Agent E needs more monday status-back fields.
- Agent E: add monday board template mapping after existing-board/group export is exercised.

Do not add monday pull/sync or Miro import until `ExportBatch`, accepted-preview selection, and monday external-ref persistence are stable.
Keep the main header and graph-view strip restrained: core workspace actions in the header, core graph views visible, and review/integration workflows grouped behind secondary controls.

### Agent A - Document Reliability

Goal: harden ingestion, source documents, and chunks.

Next task:
- Verify the MVP upload/extract/chunk path with PDF, DOCX, Markdown, and TXT fixtures, then close any primary ingestion UI/API gaps that allow unsupported formats into the main flow.

Completed first-slice items:
- Normalized source document metadata across supported file types.
- Implemented source-aware chunk model.
- Added deterministic chunk IDs.
- Enforced file size limits, allowed extensions, filename sanitization, hashing, duplicate/version handling, and malformed file errors.

Primary files:
- `backend/app.py`
- `backend/Models/model.py`
- New files under `backend/documents/`
- New tests/fixtures under `backend/tests/` or `examples/fixtures/`

Avoid:
- Frontend header/export UI.
- Node inspector UI.
- Miro/monday live clients.

### Agent B - Graph Contracts And Validation

Goal: make graph output trustworthy before it reaches views or integrations.

Next task:
- Support graph/export contract checks exposed by monday pull/status-back work when that begins.

Completed first-slice items:
- Defined durable schemas for `GraphNode`, `GraphEdge`, `SourceRef`, `TaskProjection`, `ExternalRef`, and `GraphValidationReport`.
- Required graph output to pass schema validation.
- Repaired orphan nodes, invalid parent IDs, duplicate node IDs, broken edges, and missing roots.
- Marked uncited AI nodes as `needs_review`.
- Marked low-confidence AI nodes as `needs_review`.
- Added export snapshot tests for validated graph JSON, validation report data, Markdown, CSV, OPML, MMD JSON, and Mermaid projections.
- Revalidated selected branches so branch exports carry branch-scoped validation reports and projections.
- Completed durable `ExportBatch` schema and threaded it through Miro/monday payloads, Miro responses, and persisted Miro external refs.
- Added backend validation for incomplete Miro/monday external refs, including missing board IDs, item IDs, export batch IDs, and push timestamps.
- Added monday export contract checks for payload/template/result shapes and graph validation coverage for staged `monday_selection_input` metadata.

Primary files:
- `backend/export/workspace_graph.py`
- New files under `backend/graph/`
- New validation tests under `backend/tests/`

Avoid:
- Header export controls.
- React Flow node rendering.
- External API auth.

### Agent C - Review And Validation UI

Goal: expose trust signals to reviewers inside the app.

Next task:
- Continue reviewer polish around backend `validation_report` data only if new report fields are added.

Completed first-slice items:
- Added graph validation report UI.
- Improved source citation display in the node detail panel.
- Surfaced missing source refs, low confidence, invalid external refs, and task metadata gaps.
- Wired review UI toward backend `validation_report` data while preserving frontend fallback checks.
- Exposed backend report validity, repair status, root node ID, issue codes, edge IDs, and repaired issue flags.
- Added validation report triage filters and issue search for reviewer workflows.
- Surfaced selected-node validation findings inside the node inspector.
- Verified reviewer acceptance for editing, applying, closing, and reopening node metadata while preserving source refs, review status, confidence, external refs, and validation findings.
- Cleared React Flow node selection when closing the inspector so reviewers can immediately reopen the same node from the canvas.
- Aligned frontend fallback validation with durable Miro/monday external ref requirements and surfaced export batch/push metadata in the node inspector.

Primary files:
- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/global-components/GraphValidationPanel.jsx` if created
- `frontend/src/App.jsx`
- `frontend/src/index.css`

Avoid:
- Header export controls while another agent owns them.
- Backend parser/chunking internals.
- Miro/monday client code.

### Agent D - Local Views And Task Preview

Goal: turn the canonical graph into local usable views before live integrations.

Next task:
- Available for local projection support if Agent E needs more monday status-back fields.

Completed first-slice items:
- Added true outline view from the canonical graph.
- Added true task-list view from the canonical graph.
- Added table view from the canonical graph.
- Added branch selection as a first-class operation.
- Added branch-to-task preview before accepting generated tasks.
- Added branch-to-checklist preview before accepting checklist metadata.
- Added missing-information review preview before accepting review metadata.
- Added SME review-question preview before accepting question metadata.
- Added source-reference repair preview before accepting source repair metadata.
- Standardized accepted local preview metadata into a common `local_preview_acceptances` trail.
- Added monday selection input projection from accepted local preview metadata without touching monday client/API code.
- Coordinated with Agent E so staged `monday_selection_input` is consumed by monday exports without adding API coupling.
- Added branch/workspace monday selection manifest and grouping/template hints for board-template mapping.
- Added monday status-back readiness projection and staging metadata without touching monday client/API code.

Primary files:
- New files under `frontend/src/views/`
- New files under `frontend/src/global-components/`
- `frontend/src/stores/store.js`
- `frontend/src/App.jsx`

Avoid:
- Header export dropdown while Agent E owns it.
- Backend ingestion/chunking.
- Miro/monday auth/client code.

### Agent E - Export And Integration Bridges

Goal: keep exports and external handoff moving without making integrations canonical.

Next task:
- Pull Miro review metadata/comment data.

Completed first-slice items:
- Maintained neutral export buttons and PNG/SVG export controls.
- Added Miro dry-run layout preview.
- Added Miro shapes/connectors payload scaffolding.
- Added export batch IDs for monday exports.
- Added explicit confirmation before creating monday boards/groups/items.
- Added export snapshot tests for neutral exports, Miro payloads, and monday payloads.
- Added selected-branch Miro frame client operation generation.
- Added selected-branch Miro frame execution endpoint behind `miro_api_token`.
- Added Miro external ref persistence for returned board/item IDs.
- Added selected-branch Miro frame plan/push actions to the export menu.
- Added whole-workspace Miro board plan/push actions to the export menu.
- Added controlled monday existing-board/group plan/push actions with `ExportBatch` and external-ref persistence.
- Wired Agent D staged `monday_selection_input` into monday export selection and item mapping.
- Added reusable Autodesk Building Block Review monday column template mapping.
- Added SME review Miro board plan/push mode for `needs_review` nodes.
- Added controlled monday status pull-back into node review status.
- Evaluated experimental native Miro mind map API and added opt-in dry-run planning while keeping shapes/connectors as the default.
- Removed the Vite large chunk warning by lazy-loading heavy frontend analysis/export modules and adding intentional vendor chunking.

Primary files:
- `frontend/src/global-components/Header.jsx`
- `backend/integrations/miro/`
- `backend/integrations/monday/`
- `backend/export/`

Avoid:
- Node inspector UI.
- Parser/chunking work.
- Graph schema internals except through public validation/export functions.

## Coordination Rules

1. Each agent should announce its slice and owned files before editing.
2. If two slices need `frontend/src/App.jsx`, the later agent should inspect latest diff first and keep changes minimal.
3. `ROADMAP.md` and `AGENT.md` are shared coordination files; update them in small patches only.
4. Do not mark a roadmap item complete unless the code path builds or has a documented blocker.
5. Prefer adding new modules over expanding already-contended files.
6. Treat Miro and monday work as projections of the validated graph, not as graph owners.
7. Do not fabricate `source_refs`; ungrounded generated nodes should remain uncited and validation should mark them `needs_review`.
8. If creating `external_refs.miro` or `external_refs.monday`, include durable provider fields: `board_id`, `item_id`, `export_batch_id`, and `last_pushed_at`; otherwise expect validation warnings in Agent C's UI.
