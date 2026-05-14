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
- Add focused tests for integration summary projection, snapshot automation
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
8. Expand helpers only after the preview/accept loop is stable.

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
