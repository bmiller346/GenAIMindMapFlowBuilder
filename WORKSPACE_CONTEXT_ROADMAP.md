# Workspace Context Roadmap

This roadmap describes the next product layer for DocMap: workspace-native
context around the canonical graph. The graph remains the source of truth.
Activity, media, integrations, automations, and agents explain, enrich, or
operate on that graph.

## Product North Star

DocMap should feel like a structured workspace, not a file upload demo and not
a generic chat shell.

```text
Sources + brief + AI actions + manual edits
-> canonical workspace graph
-> durable timeline of how the graph was built
-> source library, integrations, automations, and role-based AI helpers
-> reviewable projections and handoffs
```

The workspace should answer:

1. What is the current structured map?
2. Where did each piece come from?
3. What changed, when, and why?
4. What systems is this connected to?
5. What actions can safely happen next?

## Design Principles

1. The graph stays central.
2. Context lanes support the graph; they do not become separate silos.
3. Any AI mutation must be previewable, reversible, and visible in activity.
4. Activity is project memory, not hidden logs.
5. Media means source library first, asset bucket second.
6. Integrations expose state and handoff readiness, not just buttons.
7. Automations should be small, explainable, and auditable.
8. Agents should be named workspace roles with narrow permissions.

## Proposed Workspace Shell

### Left Sidebar

- Projects
- Activity
- Sources / Media
- Integrations
- Automations
- AI Helpers

### Main Workspace

- Current graph map
- Outline / tasks / table / review projections
- Node inspector
- Source and integration metadata

### Activity Timeline

Persistent chronological feed with compact, human-readable entries:

- Created workspace from brief
- Uploaded `Project-Management-Plan-1.docx`
- Generated 18-node source-cited graph
- Added manual table under `Operations`
- Accepted branch-to-task preview
- Exported selected branch to monday
- Pulled monday status updates
- Reverted unsaved title change

Activity should be filterable by type: source, AI, manual edit, validation,
export, integration, automation, and system.

## Phase 1: Activity Timeline And Workspace Memory

Goal: make the app remember and explain how the workspace was built.

### Scope

- Add frontend `activityStore`.
- Add persisted `activity_events` to workspace JSON.
- Record events for:
  - workspace create/open
  - source upload/intake
  - brief derive
  - manual node/table create
  - node metadata apply
  - autosave/manual save/revert
  - validation run
  - preview accept
  - export
  - integration push/pull
- Add an Activity panel with filters and event detail expansion.
- Include activity entries in saved workspace snapshots.

### Event Shape

```json
{
  "id": "evt_...",
  "workspace_id": "...",
  "type": "manual_node_created",
  "title": "Manual table added",
  "summary": "Added Manual table under Operations.",
  "actor": "user",
  "created_at": "2026-05-14T00:00:00.000Z",
  "node_ids": ["node_1"],
  "source_ids": [],
  "integration": "",
  "metadata": {}
}
```

### Acceptance

- User can see a chronological history after creating/editing a workspace.
- Activity persists after save/reopen.
- Revert does not erase the audit trail; it records a revert event.
- Timeline entries link to affected nodes where possible.

## Phase 2: Sources / Media Library

Goal: make source context inspectable and reusable.

### Scope

- Add a Sources panel listing uploaded/generated inputs.
- Normalize source records across PDF, DOCX, Markdown, TXT, web, image, audio,
  video, and brief-only work.
- Show status: uploaded, parsed, chunked, used in graph, failed.
- Show source coverage: number of graph nodes citing each source.
- Let user select a source and see:
  - metadata
  - extracted chunks or transcript snippets
  - nodes citing it
  - source repair suggestions
- Record source intake and parse failures in Activity.

### Acceptance

- User can answer "what sources built this map?"
- User can find uncited nodes and source coverage gaps from the source panel.
- Source media persists with stable IDs in workspace context.

## Phase 3: Integrations Workspace Panel

Goal: turn Miro/monday from export menu items into visible workspace state.

### Scope

- Add Integrations panel with provider cards:
  - Miro
  - monday.com
  - future: SharePoint/Planner
- Each card shows:
  - credential state
  - last export batch
  - last pull status
  - mapped nodes count
  - warnings from validation/preflight
- Move or mirror common integration actions from Export menu:
  - Miro board/frame preview
  - Miro push
  - monday existing group preflight
  - monday push
  - monday status pull
- Add integration activity events for dry runs, pushes, failures, and pullbacks.

### Acceptance

- User can inspect where the workspace has been sent.
- User can see whether external refs are complete.
- Failed integration attempts are visible and actionable.

## Phase 4: Automations

Goal: support repeatable workspace maintenance without turning the app into a
black box.

### Initial Automations

- Revalidate graph after changes.
- Watch monday status for mapped nodes.
- Remind about `needs_review` nodes.
- Regenerate source coverage after new uploads.
- Export approved branch to monday or Miro after confirmation.

### Automation Model

```json
{
  "id": "auto_...",
  "name": "Pull monday status",
  "trigger": "manual_or_schedule",
  "scope": "workspace",
  "status": "active",
  "last_run_at": "",
  "next_run_at": "",
  "action": {
    "type": "monday_status_pull",
    "params": {}
  }
}
```

### Acceptance

- User can create, pause, run, and delete an automation.
- Every automation run creates Activity events.
- Automations never mutate graph structure without a preview/accept step.

### Implementation Status - 2026-05-14

Agent C implemented the first workspace-native integrations and automations
surface:

- Added an Integrations panel with Miro and monday.com provider cards.
- Cards show credential state, mapped node counts, complete external refs,
  last push/pull timestamps, export batch visibility, and validation warning
  counts.
- Mirrored common handoff actions into the workspace panel:
  - Miro board preview and push.
  - Miro selected branch frame preview.
  - monday existing group preflight and push.
  - monday status preview and status pull.
- Added integration Activity events for panel-triggered dry runs, pushes,
  pullbacks, and failures.
- Added an Automations panel with create, pause/resume, run, and delete
  controls.
- Added default manual automations for graph revalidation, monday status
  preview, needs-review reporting, and source coverage reporting.
- Automation runs write Activity entries and maintain a compact per-automation
  run history.
- Added persisted `automations` to workspace snapshots alongside nodes, edges,
  viewport, workspace brief, and `activity_events`.

Remaining Agent C follow-up:

- Extract shared Miro/monday action helpers so Header exports and the
  Integrations panel do not drift.
- Added focused tests for integration summary projection, snapshot automation
  persistence, and automation run history.
- Consider backend-owned automation storage if automations need to be queried
  outside the saved workspace JSON.

## Phase 5: AI Helpers / Agents

Goal: make AI capabilities crisp, role-based, and permissioned.

Avoid a vague "AI Agents" bucket. Use narrow helpers:

- Source Librarian
  - Finds uncited nodes.
  - Suggests source refs.
  - Builds source coverage reports.
- Project Planner
  - Converts branches to tasks/checklists.
  - Suggests owners, due dates, and priorities.
- Reviewer
  - Finds gaps, contradictions, and SME questions.
  - Prepares review packets.
- Integration Operator
  - Preflights Miro/monday handoffs.
  - Explains sync issues.

### Agent Rules

1. Helpers operate on selected scope: workspace, branch, source, or node.
2. Helpers produce previews, not direct graph mutations.
3. Accepted previews create Activity events.
4. Helper outputs must cite sources or mark assumptions.
5. Helper permission is explicit per action.

### Acceptance

- User can invoke a helper from a relevant panel or selected branch.
- Helper output is previewable and accept/rejectable.
- Accepted helper work becomes graph data plus timeline memory.

## Phase 6: Backend AI Helper Generation

Goal: make AI helpers produce real, source-aware preview artifacts from the
canonical workspace graph.

### Scope

- Add backend helper-preview endpoints, starting with Source Librarian:
  - `POST /api/workspaces/{id}/ai/source-librarian/preview`
  - future: Project Planner, Reviewer, and Integration Operator previews.
- Define strict request and response contracts for helper previews.
- Feed helpers the selected scope: workspace, branch, node, or source.
- Require helper outputs to include proposed changes, citations or assumptions,
  confidence, and reviewer-readable rationale.
- Validate AI output before returning it to the frontend.
- Record preview generation and preview acceptance in Activity.
- Keep mutation frontend-mediated: backend proposes; the user accepts.

### Helper Preview Contract

```json
{
  "preview_id": "preview_...",
  "helper_id": "source_librarian",
  "action": "source_repair",
  "scope": {
    "type": "branch",
    "node_id": "node_1"
  },
  "generated_by": "openai",
  "preview_items": [
    {
      "id": "item_...",
      "preview_type": "source_repair",
      "node_id": "node_1",
      "title": "Repair source reference",
      "rationale": "Nearest cited ancestor supports this claim.",
      "confidence": "low",
      "source_refs": [
        {
          "document_id": "doc_1",
          "page": 3,
          "section": "Requirements",
          "quote_snippet": "..."
        }
      ],
      "assumptions": [],
      "proposed_mutation": {}
    }
  ],
  "warnings": []
}
```

### Acceptance

- Source Librarian can generate a fresh backend preview from current workspace
  or branch context.
- Invalid AI output is rejected before it reaches the frontend.
- Missing credentials produce a clear configuration warning or deterministic
  local preview, depending on request options.
- The frontend can inspect, accept, or reject generated helper preview items.
  Accepted items become graph metadata plus timeline memory.

### Recommended Phase 6 Agent Split

Phase 6 is large enough for four focused agents. The work separates cleanly
because the shared boundary is the helper preview contract: backends generate
validated previews, frontends display and accept them, and Activity records the
outcome.

#### Agent 1: Helper Contract And Backend Foundation

Owns:

- `backend/ai_helpers.py`
- helper preview schemas and validators
- shared OpenAI Responses API call path
- deterministic fallback behavior for local/dev/test
- request/response shape for helper preview endpoints
- focused backend tests for valid and invalid helper output

Primary deliverables:

- Harden `source_librarian` preview generation.
- Add reusable helpers for `project_planner`, `reviewer`, and
  `integration_operator` preview contracts.
- Ensure invalid model output returns clear 422 errors.

Avoid:

- Frontend helper UI.
- Direct graph mutation.
- Integration credentials or push/pull behavior.

#### Agent 2: Source Librarian And Reviewer Generation

Owns:

- Source Librarian generation quality.
- Reviewer generation quality.
- source coverage, uncited node, contradiction, gap, and SME question previews.
- prompt contracts that require citations or explicit assumptions.

Primary deliverables:

- `POST /api/workspaces/{id}/ai/source-librarian/preview`
- `POST /api/workspaces/{id}/ai/reviewer/preview`
- backend tests covering citation-backed and assumption-backed outputs.
- frontend wiring from Source Librarian and Reviewer buttons to backend
  previews.

Avoid:

- Project planning/task ownership generation.
- monday/Miro credentials and sync logic.

#### Agent 3: Project Planner Generation And Accept Flow

Owns:

- Project Planner backend preview generation.
- branch-to-task, checklist, owner, due date, and priority suggestions.
- frontend preview merge behavior for generated planner items.
- accepted preview metadata on graph nodes.

Primary deliverables:

- `POST /api/workspaces/{id}/ai/project-planner/preview`
- branch-scoped planning previews.
- preview accept/reject UI that marks accepted generated work as
  `needs_review` unless already approved.
- tests for generated planner item validation and acceptance metadata.

Avoid:

- Source coverage repair logic.
- Integration credential handling.

#### Agent 4: Integration Operator, Activity, And End-To-End Polish

Owns:

- Integration Operator preview generation.
- handoff readiness, sync issue explanation, and preflight preview summaries.
- activity events for helper preview generation, rejection, and acceptance.
- end-to-end UI polish and regression coverage across helper roles.

Primary deliverables:

- `POST /api/workspaces/{id}/ai/integration-operator/preview`
- generated helper previews visible in Activity.
- consistent loading/error states for backend AI helper calls.
- Playwright coverage for helper invocation, preview display, accept, and
  Activity entry.

Avoid:

- Implementing provider credential storage.
- Autonomous mutation or background agent behavior.

### Phase 6 Sequencing

1. Agent 1 finishes and stabilizes the shared helper preview contract.
2. Agent 2 expands real Source Librarian and Reviewer generation.
3. Agent 3 adds Project Planner generation and generated task/checklist
   acceptance.
4. Agent 4 completes Integration Operator previews, Activity instrumentation,
   and end-to-end verification.

Agents 2 and 3 can work in parallel after Agent 1 lands the shared contract.
Agent 4 should start once at least one generated helper preview reaches the
frontend.

### Implementation Status - 2026-05-14

Agent 1 foundation is in progress with the shared contract now available:

- Added `backend/ai_helpers.py`.
- Added registered helper/action validation for Source Librarian, Reviewer,
  Project Planner, and Integration Operator.
- Added reusable helper preview builders and scope normalization.
- Added strict helper preview validation for scopes, duplicate preview item IDs,
  source refs, assumptions, proposed mutations, warnings, and metadata.
- Added reusable OpenAI Responses API payload plumbing for helper preview
  generation.
- Added deterministic fallback generation for Source Librarian source-repair
  previews.
- Added `POST /api/workspaces/{id}/ai/source-librarian/preview`.
- Added `POST /api/workspaces/{id}/ai/helpers/{helper_id}/preview`.
- Added focused backend tests for helper preview parsing, validation, registered
  future roles, branch scoping, reusable OpenAI payload building, and
  deterministic Source Librarian output.

Agent 2 and Agent 3 can build on:

- `build_helper_preview(...)`
- `build_openai_helper_preview_payload(...)`
- `generate_helper_preview(...)`
- `validate_ai_helper_preview(...)`
- `normalize_helper_scope(...)`
- `validate_helper_action(...)`

Agent 2 Source Librarian and Reviewer generation is now implemented:

- Added Source Librarian `source_coverage` generation alongside source repair.
- Added Reviewer `missing_information`, `sme_questions`, and `contradictions`
  generation with deterministic fallback previews.
- Added `POST /api/workspaces/{id}/ai/reviewer/preview`.
- Wired Source Librarian and Reviewer helper buttons to backend preview
  generation and the shared generated-preview frontend cache.
- Existing source repair, gap, and SME preview views can inspect and accept
  generated backend preview items while preserving local projection fallback.
- Added backend coverage for citation-backed and assumption-backed Source
  Librarian and Reviewer outputs.

Agent 3 Project Planner generation and accept flow is now implemented:

- Added Project Planner `task_projection` and `checklist_projection`
  generation with deterministic fallback previews.
- Added `POST /api/workspaces/{id}/ai/project-planner/preview`.
- Wired Project Planner helper actions to backend preview generation.
- Generated task previews can be accepted into node task metadata with
  generated preview IDs and review status.
- Generated checklist previews can be accepted into checklist metadata while
  preserving source and assumption context.
- Added backend coverage for generated planner item validation and reviewable
  acceptance metadata.

Agent 4 Integration Operator, Activity, and end-to-end polish is now
implemented:

- Added Integration Operator `handoff_readiness` and `sync_issue_review`
  generation with deterministic fallback previews.
- Added `POST /api/workspaces/{id}/ai/integration-operator/preview`.
- Wired Integration Operator helper actions to backend preview generation and
  the shared generated-preview frontend cache.
- Generated handoff readiness previews can be inspected and staged from the
  monday selection input view.
- Generated sync issue previews can be inspected and staged from the monday
  status-back view.
- Generated preview generation failures, acceptances, and rejections create
  Activity entries across helper workflows.
- Added Playwright coverage for Integration Operator invocation, preview
  display, acceptance, and Activity entry.

Phase 6 integration verification completed on 2026-05-14:

- Backend: `python -m poetry run pytest --basetemp=.pytest-tmp` from
  `backend` passed, 95 tests.
- Frontend unit checks passed:
  - `npm run test:source-library`
  - `npm run test:manual-nodes`
  - `npm run test:flow-snapshots`
- Frontend quality gates passed:
  - `npm run lint`
  - `npm run build`
- End-to-end: `npx playwright test` passed, 6 tests.

Residual release note:

- The Phase 6 helper-preview loop is release-candidate ready based on the
  verification above.
- The repository worktree still contains unrelated dirty and untracked files
  from adjacent workstreams; those should be reviewed before producing a final
  release commit.

## Recommended Agent Workstreams

This roadmap can be split cleanly across four implementation agents.

### Agent A: Activity And Persistence

Owns:

- `activityStore`
- activity event schema
- snapshot persistence
- Activity panel UI
- event emission helpers

Primary files:

- `frontend/src/stores/activityStore.js`
- `frontend/src/global-components/ActivityPanel.jsx`
- `frontend/src/utils/activityEvents.js`
- `frontend/src/utils/flowSnapshots.js`
- save/load call sites

Avoid:

- Miro/monday client logic.
- Source parsing internals.

### Agent B: Sources / Media Library

Owns:

- source/media panel
- source coverage projection
- source-to-node relationships
- parse failure display

Primary files:

- `frontend/src/global-components/SourcesPanel.jsx`
- `frontend/src/views/graphProjection.js`
- document ingestion response mapping
- source ref repair preview UI

Avoid:

- automation scheduler.
- integration push/pull behavior.

### Agent C: Integrations And Automations

Owns:

- integrations workspace panel
- provider cards
- automation model and UI
- monday/Miro status summaries
- automation activity events

Primary files:

- `frontend/src/global-components/IntegrationsPanel.jsx`
- `frontend/src/global-components/AutomationsPanel.jsx`
- `frontend/src/config/localSettings.js`
- existing Miro/monday export paths
- backend integration endpoints as needed

Avoid:

- changing canonical graph semantics without coordination.

Status:

- First pass complete as of 2026-05-14.
- Integration and automation panels are implemented in the frontend.
- Automation definitions and compact run history persist through workspace
  snapshots.
- Manual automation runs are supported; no autonomous background scheduler has
  been added.

### Agent D: AI Helpers / Preview Workflows

Owns:

- helper roles
- helper action menus
- preview/accept flows
- prompt contracts for helper actions
- branch/node scoped assistant UX

Primary files:

- `frontend/src/global-components/AiHelpersPanel.jsx`
- `frontend/src/views/*Preview.jsx`
- backend AI generation endpoints
- graph validation/contract helpers

Avoid:

- unreviewed direct graph mutation.
- integration credential handling.

## Sequencing Recommendation

1. Build Phase 1 Activity first.
2. Add source/media library on top of activity.
3. Move integrations into a workspace panel.
4. Add automations that record to activity.
5. Add role-based AI helpers using the preview/accept pattern.

Activity should be the first foundation because every later lane needs a
durable "what happened and why" record.

## Single-Agent Implementation Path

If one agent implements everything, use this order:

1. Add activity event schema, store, panel, and snapshot persistence.
2. Instrument manual node/table, brief derive, node inspector apply, save,
   revert, and export events.
3. Add source/media panel with coverage counts.
4. Add integrations panel that reads existing external refs and export status.
5. Add automation data model without background scheduling.
6. Add manual "run automation" actions.
7. Add AI helper shell with one real helper: Source Librarian.
8. Add the backend Source Librarian generation endpoint.
9. Expand helpers only after the preview/accept loop is stable.

## Non-Goals For This Roadmap

- Full multiplayer collaboration.
- Broad marketplace of integrations.
- Autonomous background agents that mutate graph structure.
- Replacing the graph with chat memory.
- Full bidirectional sync with conflict resolution.

## Definition Of Robust And Crisp

- Every workspace action is visible in Activity.
- Every source is inspectable.
- Every external handoff has status.
- Every automation is explainable.
- Every AI helper produces a preview before mutation.
- The graph remains canonical and exportable at all times.
