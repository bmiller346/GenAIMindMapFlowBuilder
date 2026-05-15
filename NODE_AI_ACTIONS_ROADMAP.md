# Node AI Actions Roadmap

This roadmap restores the original repo's exploratory "pick an agent/persona,
ask or expand from this node, and create a follow-up subtree" behavior while
preserving DocMap's canonical graph, validation, source-citation, and
preview/accept rules.

Use this alongside `ROADMAP.md`, `NODE_AUTHORING_UX_ROADMAP.md`, and
`WORKSPACE_CONTEXT_ROADMAP.md`. This file owns node/branch/workspace AI actions,
prompt profiles, custom prompts, preview diffs, and AI action history. It does
not own document ingestion, external integration execution, or the already
completed manual node-authoring UX.

## Product Intent

DocMap should support exploratory AI work from any useful graph scope:

```text
selected node / selected branch / workspace
-> choose AI role and action
-> optional custom instruction
-> generate preview
-> validate preview
-> accept as nodes, notes, tasks, checklist items, tables, or SME questions
-> persist canonical graph and AI action history
```

The original repo's generic personas should remain available under a General
group, but DocMap's primary choices should be domain/workflow roles.

## Current Status

Status: complete for the current Node AI Actions scope. Backend preview
contracts, prompt profile registry, frontend role/action picker, workspace/node/
branch entry points, inspector preview rendering, accept/reject, `AIActionRun`
snapshot persistence, and browser regression coverage exist. The legacy
data-source persona surface remains discoverable but no longer performs direct
graph mutation.

Preserved legacy surface:

- `frontend/src/modals/PromptModal.jsx` preserves the original General persona
  options inside the preview-first Ask AI modal.
- `frontend/src/prompts/promptsModel.js` defines `Strategic Advisor`,
  `Research Assistant`, `Productivity Coach`, `Data Interpreter`, and
  `Custom Prompts`.
- `frontend/src/global-components/Prompts.jsx` still exists for legacy
  compatibility but is no longer the source-card entry point.
- `frontend/src/nodes/PromptSelector.jsx` opens the preview-first Ask AI modal
  for data-source nodes.

Known notes:

- Workspace-level Ask AI is exposed from the header for opened workspaces.
- Legacy `Prompts.jsx` remains in the codebase for compatibility, but direct
  generation is disabled there so it cannot append graph changes outside
  preview/accept.
- Prompt profile roles include DocMap/domain roles and legacy General personas,
  but the UI should continue to prioritize DocMap roles and treat General
  personas as secondary/advanced options.

## Product Rules

1. Node-level AI actions must generate preview changes before mutating the
   canonical graph.
2. Custom prompts may create drafts, but only accepted and validated drafts
   become graph nodes.
3. Unsourced accepted AI nodes must be marked `needs_review`.
4. Accepted AI nodes must preserve source refs when the input scope has source
   support.
5. Every accepted action must create an `AIActionRun` history record.
6. Legacy generic personas may remain, but domain-specific DocMap roles are the
   primary role set.
7. Do not remove the legacy Choose Agent affordance until its behavior is
   available through the new preview system.

## Target Prompt Profiles

Primary DocMap roles:

- Standards Extractor
- Workflow Mapper
- Training Guide Builder
- SME Question Generator
- Task Planner
- Data/Table Interpreter
- Gap Analyst
- Source Ref Repair
- Integration Readiness Reviewer
- Custom

General legacy roles:

- Strategic Advisor
- Research Assistant
- Productivity Coach
- Data Interpreter

Each profile should define:

- role ID and label
- description
- supported scopes: node, branch, workspace
- supported actions
- system instructions
- default output shape
- source strictness
- default review status behavior

## Target Actions

Selected-node actions:

- expand this node
- ask follow-up
- generate child nodes
- convert to checklist
- create SME questions
- find missing source support
- interpret table/data
- generate tasks
- custom prompt

Selected-branch actions:

- summarize branch
- reorganize branch
- split branch into categories
- generate tasks
- generate checklist
- find gaps
- create SME questions
- custom prompt

Workspace actions:

- suggest follow-up questions
- find unsupported assumptions
- find duplicate or overlapping nodes
- generate training outline
- export branch as SOP draft

## Durable Schema

Add `AIActionRun`.

Minimum shape:

```json
{
  "ai_action_id": "uuid",
  "workspace_id": "workspace-001",
  "source_node_id": "node-014",
  "scope": "node|branch|workspace",
  "role": "SME Question Generator",
  "action": "generate_child_nodes",
  "custom_prompt": "string or null",
  "input_source_refs": [],
  "created_at": "datetime",
  "created_by": "user",
  "status": "previewed|accepted|rejected",
  "generated_node_ids": []
}
```

Recommended preview shape:

```json
{
  "preview_id": "uuid",
  "ai_action_id": "uuid",
  "scope": "node|branch|workspace",
  "role": "Task Planner",
  "action": "generate_tasks",
  "draft_nodes": [],
  "draft_edges": [],
  "draft_annotations": [],
  "validation_report": {},
  "source_refs": [],
  "assumptions": []
}
```

## Agent Lanes

This work should use four agents. If staffing is limited, combine Agent A + C
as the contract/integration lane and Agent B + D as the UX/QA lane.

### Agent A: Backend AI Action Contract

Owns backend contracts, prompt profile registry, action preview endpoints, and
validation handoff.

Primary files:

- `backend/ai_helpers.py`
- backend graph/validation modules used by `backend/ai_helpers.py`
- backend tests under `backend/tests/`

Allowed supporting files:

- `frontend/src/prompts/promptsModel.js` only for shared profile labels or
  compatibility naming.
- `ROADMAP.md` and this roadmap for status updates.

Do not own:

- React node menu UI.
- Inspector preview rendering.
- Playwright browser tests except small API fixture coordination.

Deliverables:

- `AIActionRun` schema or backend-compatible serialized shape.
- Prompt profile registry with primary DocMap roles and legacy General roles.
- Preview endpoint for node, branch, and workspace action requests.
- Backend validation handoff that marks unsourced accepted drafts
  `needs_review`.
- Unit tests for profile lookup, preview shape, invalid action rejection, and
  validation/report behavior.

### Agent B: Node And Branch UX

Owns the user entry points for node/branch AI actions and the migration path
from the legacy Choose Agent modal.

Primary files:

- `frontend/src/nodes/ResponseNode.jsx`
- `frontend/src/modals/PromptModal.jsx`
- `frontend/src/global-components/Prompts.jsx`
- `frontend/src/prompts/promptsModel.js`
- `frontend/src/index.css`

Allowed supporting files:

- `frontend/src/global-components/AiHelpersPanel.jsx`
- `frontend/src/stores/store.js` for selected-node/branch state only.
- `frontend/src/utils/manualNodes.js` only through coordination with Agent C.

Do not own:

- Backend endpoint internals.
- Validation logic.
- Activity/history persistence.

Deliverables:

- Node menu or slash-menu entry for "Ask AI".
- Role/action picker for selected node and selected branch.
- Custom prompt field scoped to the selected node/branch.
- Follow-up question suggestions display.
- Legacy Choose Agent modal either routes through the new preview flow or is
  visibly marked as legacy until migrated.

### Agent C: Preview, Accept/Reject, And History

Owns turning AI previews into canonical graph mutations safely.

Primary files:

- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/global-components/AiHelpersPanel.jsx`
- `frontend/src/views/*Preview.jsx`
- `frontend/src/stores/activityStore.js`
- `frontend/src/utils/activityEvents.js`
- `frontend/src/utils/flowSnapshots.js`
- `frontend/src/utils/manualNodes.js`

Allowed supporting files:

- `frontend/src/stores/store.js`
- `frontend/src/views/graphProjection.js`
- `frontend/src/index.css` for preview/inspector states.

Do not own:

- Prompt copy except minor labels needed for preview rendering.
- Low-level backend prompt generation.
- Node menu placement unless coordinating with Agent B.

Deliverables:

- Preview model that can represent draft nodes, edges, notes, tasks, checklist
  items, SME questions, table interpretations, and assumptions.
- Accept/reject controls that never mutate the canonical graph before accept.
- Accepted drafts are normalized through the canonical node factory/update API.
- `AIActionRun` history is saved in workspace snapshots.
- Activity entries are recorded for previewed, accepted, and rejected actions.

### Agent D: QA, Persistence, And Regression

Owns verification for the full feature and preservation of legacy behavior.

Primary files:

- `frontend/tests/*`
- `frontend/tests/e2e/*`
- `frontend/playwright.config.js`
- `NODE_AI_ACTIONS_ROADMAP.md`

Allowed supporting files:

- Minimal test IDs or accessibility labels in frontend files after coordination.
- Backend test fixtures if Agent A needs shared test data.

Do not own:

- Feature implementation except small testability defects.
- Prompt/profile product decisions.

Deliverables:

- E2E coverage that selecting a node, choosing role/action, and previewing AI
  changes does not mutate nodes/edges before accept.
- E2E coverage that accept creates child nodes/edges and save/reopen preserves
  them.
- E2E coverage that reject leaves graph unchanged.
- Regression coverage that legacy generic personas and Custom Prompt remain
  discoverable.
- Unit or integration tests for `AIActionRun` snapshot persistence.
- Pass/fail notes in this roadmap.

## Coordination Rules

- Agent A publishes the action request/response shape before Agent B or C wire
  production UI against it.
- Agent B owns where the action starts; Agent C owns what happens after a
  preview returns.
- Agent C must use canonical node helpers when accepting generated nodes.
- Agent D should verify user workflows, not implementation details.
- No lane may reintroduce direct AI graph mutation without preview/accept.
- Legacy persona labels must remain searchable until the new profile picker is
  fully available.

## Suggested Agent Jobs

Use these as copy/paste prompts when dispatching work.

### Agent A Job

```text
You are Agent A for NODE_AI_ACTIONS_ROADMAP.md. Own backend AI action contracts
only. Add an AIActionRun-compatible schema/serialized shape, a prompt profile
registry with DocMap roles plus legacy General personas, and preview endpoints
for node, branch, and workspace AI actions. Do not edit React node menus or
inspector UI. Ensure previews validate draft graph changes, mark unsourced
accepted drafts needs_review through the validation handoff, add focused backend
tests, and update only your roadmap checkboxes/status notes.
```

### Agent B Job

```text
You are Agent B for NODE_AI_ACTIONS_ROADMAP.md. Own node and branch UX entry
points. Add an Ask AI entry from the selected node/branch UI, a role/action
picker, follow-up suggestion display, and a custom prompt field. Preserve the
legacy Choose Agent personas and migrate or route PromptModal/Prompts toward the
new preview flow without deleting the old affordance. Do not implement backend
contracts or accept/reject persistence. Coordinate with Agent C for preview
handoff state and update your roadmap checkboxes/status notes.
```

### Agent C Job

```text
You are Agent C for NODE_AI_ACTIONS_ROADMAP.md. Own preview, accept/reject, and
history integration. Take AI action previews from Agent A/B and render them in
the inspector or AI helper preview surface. Ensure draft nodes/edges/notes/tasks
never mutate the canonical graph before accept. On accept, normalize through the
canonical node helpers, preserve source refs, mark unsupported nodes
needs_review, record activity, and persist AIActionRun history in snapshots. Do
not own prompt profile copy or node menu placement. Add focused tests where
useful and update your roadmap checkboxes/status notes.
```

### Agent D Job

```text
You are Agent D for NODE_AI_ACTIONS_ROADMAP.md. Own QA and regression. Build
browser tests proving node/branch AI actions preview without mutating the graph,
accept creates durable children or metadata, reject leaves the graph unchanged,
save/reopen preserves accepted AIActionRun history, and the legacy Strategic
Advisor, Research Assistant, Productivity Coach, Data Interpreter, and Custom
Prompts choices remain discoverable. Do not implement core feature code except
small testability hooks after coordination. Update pass/fail notes in the
roadmap.
```

## Phase Checklist

### Phase 1: Contracts And Profiles

- [x] Agent A: Define `AIActionRun` shape.
- [x] Agent A: Define AI action preview request/response shape.
- [x] Agent A: Add prompt profile registry with DocMap roles.
- [x] Agent A: Preserve legacy generic personas under General.
- [x] Agent A: Add backend validation for unsupported role/action/scope
  combinations.
- [x] Agent A: Add backend tests.

### Phase 2: UX Entry Points

- [x] Agent B: Add Ask AI entry from selected node UI.
- [x] Agent B: Add Ask AI entry from selected branch UI.
- [x] Agent B: Add role picker.
- [x] Agent B: Add action picker filtered by selected scope.
- [x] Agent B: Add optional custom prompt field.
- [x] Agent B: Add follow-up suggestion display.
- [x] Agent B: Keep legacy Choose Agent affordance discoverable.

### Phase 3: Preview And Accept/Reject

- [x] Agent C: Render draft node/edge previews.
- [x] Agent C: Render non-node preview outputs: notes, tasks, checklist items,
  SME questions, table interpretations, assumptions.
- [x] Agent C: Add accept control.
- [x] Agent C: Add reject control.
- [x] Agent C: Ensure preview does not mutate canonical graph.
- [x] Agent C: Normalize accepted nodes through canonical helpers.
- [x] Agent C: Mark unsourced accepted nodes `needs_review`.
- [x] Agent C: Record activity for preview, accept, and reject.
- [x] Agent C: Persist `AIActionRun` history in snapshots.

### Phase 4: Legacy Migration

- [x] Agent B + C: Gate `PromptModal`/`Prompts` so the legacy data-source flow
  cannot directly append graph changes outside preview/accept.
- [x] Agent B: Preserve `Strategic Advisor`, `Research Assistant`,
  `Productivity Coach`, `Data Interpreter`, and `Custom Prompts`.
- [x] Agent C: Prevent legacy flow from directly appending graph changes.
- [x] Agent D: Add regression coverage for legacy persona discoverability.

### Phase 5: QA And Persistence

- [x] Agent D: Verify preview leaves nodes/edges unchanged before accept.
- [x] Agent D: Verify accept creates durable graph changes.
- [x] Agent D: Verify reject leaves graph unchanged.
- [x] Agent D: Verify save/reopen preserves accepted generated nodes and
  `AIActionRun` history.
- [x] Agent D: Verify source refs and `needs_review` behavior.
- [x] Agent D: Verify node, branch, and workspace scopes.
- [x] Agent D: Update pass/fail notes below.

## QA Results

Agent A implementation QA:

- Backend AI action contract tests passed on 2026-05-14 with
  `python -m poetry run pytest tests\test_ai_helper_previews.py` from
  `backend/`.
- `git diff --check` passed after the Agent A backend contract changes.

Agent B implementation QA:

- Node menu and slash menu now expose Ask AI for selected node and branch
  scopes.
- The Ask AI modal calls Agent A's `/api/workspaces/{flow_id}/ai/actions/.../preview`
  endpoints when a workspace exists, falls back to a local preview if the
  endpoint is unavailable, and sets Agent C's `activeAIActionPreview`.
- The role/action picker uses backend-compatible action IDs and filters actions
  to combinations supported by the selected role and scope.
- The legacy Choose Agent modal remains discoverable and is visibly marked as
  the legacy data-source flow.
- Verification: `npm run build`, `npm run lint`, `npm run test:flow-snapshots`,
  `node --test tests/aiActionRuns.test.mjs`, and `git diff --check` passed.

Preview/accept/reject and persistence QA is now covered for node, branch, and
workspace scopes.

Agent D implementation QA:

- Added `frontend/tests/e2e/node-ai-actions-regression.spec.js` covering node
  preview without graph mutation, accept-created durable child nodes,
  save/reopen persistence of accepted `AIActionRun` history, branch reject
  without graph mutation, workspace preview/accept from the header, and legacy
  General persona discoverability.
- Added a narrow handoff fix so `PromptModal` calls the AI action preview
  endpoint, sets `activeAIActionPreview`, and opens the inspector review path.
- Rejected AI action previews now mark the workspace dirty so rejected
  `AIActionRun` history can be persisted.
- Verification passed in the implementation pass: `npm run lint`,
  `node --test tests\aiActionRuns.test.mjs tests\flowSnapshots.test.mjs`,
  `npx playwright test node-ai-actions-regression.spec.js`, and
  `git diff --check`.
- Review verification on 2026-05-14 passed:
  - `python -m poetry run pytest tests\test_ai_helper_previews.py`: 24 passed
    with local pytest cache permission warnings.
  - `node --test tests/aiActionRuns.test.mjs`: 6 passed.
  - `npm run test:flow-snapshots`: 4 passed.
  - `npx playwright test tests/e2e/node-ai-actions-regression.spec.js`: 4
    passed.

Cleanup completion QA:

- Added a workspace-level Ask AI entry in the header for opened workspaces.
- Workspace Ask AI opens the same role/action picker with `scope: workspace`,
  generates a preview through the workspace preview endpoint, and displays it in
  the inspector preview surface.
- Legacy `Prompts` cards remain visible but show a migration message instead of
  calling the old follow-up API and directly appending nodes/edges.
- Verification passed:
  - `npm run lint`
  - `node --test tests/aiActionRuns.test.mjs`
  - `npm run test:flow-snapshots`
  - `npx playwright test tests/e2e/node-ai-actions-regression.spec.js`: 4
    passed.

## Completion Gate

This roadmap is complete when:

- Node, branch, and workspace AI actions are available from the map/editor.
- All AI graph mutations are preview-first and require accept/reject.
- Accepted outputs are valid canonical graph changes or explicit non-graph
  metadata.
- Unsupported accepted outputs are marked `needs_review`.
- `AIActionRun` history survives save/reopen.
- Legacy persona choices remain available under the new profile system.
- E2E tests cover preview, accept, reject, persistence, and legacy preservation.
