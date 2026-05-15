# Node Authoring UX Roadmap

This roadmap tracks the Taskade-style node authoring work: making manual mind
map creation feel intentional, compact, branch-based, and durable instead of
like full editor blocks appearing on the canvas.

Use this alongside `ROADMAP.md` and `WORKSPACE_CONTEXT_ROADMAP.md`. This file
owns only node creation/editing ergonomics, not document ingestion, exports, or
integration behavior.

## Product Intent

Manual node authoring should feel like direct manipulation of a map:

```text
root idea
-> visible receiver/source affordances
-> node-local add controls
-> compact editable subject
-> slash commands for block creation
-> three-dot menu for node actions/settings
-> heavier metadata only when explicitly opened
```

The map should not depend on AI to feel structured. AI can generate nodes, but
manual nodes must be first-class.

## Current Status

Status: complete for the current node-authoring UX scope. Core authoring,
schema/layout, node surface interactions, inspector/view compatibility,
persistence, AI-preview safety, and visual QA are covered by automated browser
regression tests.

Recently implemented:

- `Add root` and `Add root table` replace the global `Attach to` workflow.
- Response/manual nodes now expose a node-local plus button for child creation.
- Response/manual nodes expose a three-dot action menu.
- Slash command menu appears when typing `/` in a node title.
- Manual table nodes render a compact preview before opening the full table
  editor.
- Node metadata inspector opens explicitly from node settings and validation
  views, not just by selecting a node.
- Shared node/edge factory exists in `frontend/src/utils/manualNodes.js`.
- Snapshot parse/save normalizes response nodes into the canonical frontend node
  contract and applies layout-mode edge styles.
- React Flow fit zoom is capped to avoid billboard-sized single nodes.
- Root placement and focus now use shared Agent A helpers that bias new roots
  away from the bottom-left workspace controls.

Known rough edges:

- New root placement is deterministic and control-aware. Narrow viewport and
  dense graph smoke coverage now pass; unusual saved viewports remain a normal
  product-design watch item rather than an open roadmap blocker.
- Branch placement is deterministic with several modes; it is not yet a full
  graph layout engine for dense arbitrary maps.
- Node action menus are functionally present and covered across dark, light,
  narrow, and dense smoke scenarios.
- Slash command actions are preview-first for AI/review commands and local/manual
  for direct block creation.
- Metadata badges are hidden until hover, but validation warnings still need a
  clearer lightweight surface.
- Canonical node fields are published through `getWorkspaceNodeData`; legacy
  `response.data.summ/df/graph` fields are still emitted for renderer/backend
  compatibility at adapter boundaries.
- Agent B follow-up verified the node menu `Delete` action removes a branch,
  cleans connected edges, and persists through the focused node-authoring
  regression test.
- Agent B second pass migrated the node surface to Agent A's canonical
  `getWorkspaceNodeData` reader, grouped the node action menu, preserved slash
  command button semantics, and upgraded manual table preview to show cells.
- Final cleanup verified view compatibility, validation inspect/open behavior,
  AI-preview command safety, and the visual QA matrix in
  `frontend/tests/e2e/node-authoring-closeout.spec.js`.

## Agent D QA Results - 2026-05-14

Automated coverage added:

- `frontend/tests/e2e/node-authoring-regression.spec.js`

Commands run:

- `npm run test:source-library`: 5 passed.
- `npm run test:e2e`: 5 passed.
- In-app browser smoke at `http://127.0.0.1:5173`: Add root and Export visible;
  no console errors on initial load.

Agent B second-pass verification:

- `npm run test:manual-nodes`: 10 passed.
- `npm run test:flow-snapshots`: 3 passed.
- `npm run test:source-library`: 5 passed.
- `npm run test:e2e`: 6 passed.
- `npm run build`: passed.

Final cleanup verification:

- `npm run test:manual-nodes`: 10 passed.
- `npm run test:flow-snapshots`: 3 passed.
- `npm run test:source-library`: 5 passed.
- `npm run test:e2e`: 9 passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Pass notes:

- Root creation, inline rename, plus-created child, slash-created manual table,
  table edit, menu-created sibling, duplicate, sort children, settings metadata,
  save/reopen, JSON export, and Markdown export are covered by the new e2e
  regression.
- The saved snapshot preserves node titles, manual table rows, metadata edits,
  duplicated node IDs, direct child edges, and reopened table preview state.
- Manual nodes reflect correctly in map, outline, task, and table views.
- Branch selection and clear-branch behavior are covered.
- Validation issues can open the explicit node inspector.
- AI slash preview commands do not structurally mutate nodes or edges.
- Visual smoke coverage includes dark mode, light mode, narrow viewport, dense
  25+ node graph, long node titles, multiple sibling branches, table preview
  nodes, grouped action menus, and AI-generated nodes with long summaries.

Open notes:

- Delete follow-up passed in the focused node-authoring regression: branch
  removal, connected-edge cleanup, autosave, save/reopen, and export persistence
  are now covered.
- Copy-link and last-edited menu affordances are deferred until durable app links
  and node edit timestamps exist.
- Node-level AI actions and prompt profiles are intentionally out of this
  roadmap's completed manual-authoring scope. They are split into
  `NODE_AI_ACTIONS_ROADMAP.md`; future agents should reuse the completed
  node-local menus and slash-command affordances while preserving preview/accept
  graph mutation rules.

## Design Principles

1. Node subjects should be compact by default.
2. Heavy editors belong behind explicit actions.
3. Branch creation should happen from the parent node, not from a detached
   toolbar selector.
4. The left side of a node should communicate "receiver/parent side"; the right
   side should communicate "growth/child side."
5. Slash commands should create blocks without forcing the user into metadata
   forms.
6. Three-dot node menus should contain structural actions and access to
   settings.
7. Generated and manual nodes should converge onto one durable node schema.
8. Layout should be predictable before it is clever.

## Agent Lanes

The work is large enough for four agents. If staffing is limited, combine
Agent A + B as the implementation lane and Agent C + D as the verification lane.

### Agent A: Node Model And Layout

Owns canonical node/edge creation, positioning, branch layout, collapse state,
and schema cleanup.

Primary files:

- `frontend/src/utils/manualNodes.js`
- `frontend/src/stores/store.js`
- `frontend/src/utils/flowSnapshots.js`
- `frontend/src/views/graphProjection.js`
- focused tests under `frontend/tests/` when available

Allowed supporting files:

- `frontend/src/App.jsx`
- `frontend/src/global-components/Header.jsx`
- backend/export files only when projection compatibility requires it

Do not own:

- Detailed node menu/slash UI rendering.
- Visual CSS polish except classes required by layout state.
- Long-form metadata inspector UX.

Deliverables:

- Deterministic branch placement helper.
- Stable create/update node API.
- Save/reopen-safe display/collapse/layout state.
- Tests or test fixtures for node factory and projection compatibility.

### Agent B: Node Surface And Interactions

Owns the compact node component, node-local plus button, three-dot actions,
slash command menu, table preview, and direct manipulation behavior.

Primary files:

- `frontend/src/nodes/ResponseNode.jsx`
- `frontend/src/global-components/ManualNodeControls.jsx`
- `frontend/src/global-components/ManualTableEditor.jsx`
- `frontend/src/index.css`

Allowed supporting files:

- `frontend/src/utils/manualNodes.js` only through Agent A coordination.
- `frontend/src/stores/store.js` only for minimal UI state hooks.

Do not own:

- Canonical schema decisions.
- Export/projection behavior.
- Backend graph validation.

Deliverables:

- Node-local child/sibling creation UX.
- Slash menu keyboard and filtering behavior.
- Three-dot menu completion.
- Compact generated/manual node visual grammar.

### Agent C: Inspector, Validation, And Views

Owns metadata access, validation affordances, and keeping map/outline/tasks/table
views coherent with the new node authoring model.

Primary files:

- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/global-components/GraphValidationPanel.jsx`
- `frontend/src/views/*`
- `frontend/src/nodes/NodeMetadataBadges.jsx`

Allowed supporting files:

- `frontend/src/App.jsx`
- `frontend/src/stores/store.js` for inspector/view selection state.
- `frontend/src/index.css` for inspector/view-specific classes.

Do not own:

- Node creation primitives.
- Node menu/slash command implementation.
- Backend integrations.

Deliverables:

- Metadata remains explicit and non-dominant.
- Validation can open problem nodes without hijacking basic selection.
- Manual nodes project correctly into outline/task/table views.
- Lightweight review indicators that do not clutter the map.

### Agent D: QA, Persistence, And Regression

Owns automated/manual verification, save/reopen coverage, browser smoke tests,
and regression documentation.

Primary files:

- `frontend/tests/*`
- `frontend/playwright.config.js`
- `NODE_AUTHORING_UX_ROADMAP.md`
- test fixtures or scripts under `frontend/` or `scripts/`

Allowed supporting files:

- Minimal testability hooks in frontend components after coordination.
- Documentation updates in `DEVELOPER_NOTES.md` if verification procedure
  changes.

Do not own:

- Feature implementation unless fixing a small testability defect.
- Product/design decisions.

Deliverables:

- Phase 1 save/reopen QA matrix completed.
- Browser smoke test for root, plus, menu, slash, table, settings, delete.
- Console/runtime error check.
- Clear pass/fail notes in this roadmap.

## Coordination Rules

- Agents should not edit another lane's primary files without noting it in their
  final handoff.
- Agent A must define or approve any changes to canonical node shape.
- Agent B can add UI fields only through the current node factory until Agent A
  changes the schema.
- Agent C treats node metadata as read/write through existing store APIs unless
  Agent A publishes a new update API.
- Agent D should verify behavior against user workflows, not internal function
  names.
- Any destructive behavior such as delete-with-children must remain explicitly
  confirmed until the UX has undo.
- All lanes should preserve the rule that AI mutations are preview-first and do
  not directly persist without user acceptance.

## Suggested Agent Jobs

Use these as copy/paste prompts when dispatching work.

### Agent A Job

```text
You are Agent A for NODE_AUTHORING_UX_ROADMAP.md. Own node model and layout only.
Implement a deterministic branch layout helper and stabilize create/update node
factory behavior. Keep changes focused to your lane files. Do not alter the node
surface UI except where needed to consume layout state. Verify with focused
tests or a small reproducible fixture, and update the roadmap checkboxes you
complete.
```

### Agent B Job

```text
You are Agent B for NODE_AUTHORING_UX_ROADMAP.md. Own the compact node surface,
node-local plus, three-dot menu, slash commands, and table preview interactions.
Do not change canonical schema without Agent A coordination. Add keyboard
navigation/filtering for slash commands and finish node menu actions. Verify in
the browser and update the roadmap checkboxes you complete.
```

### Agent C Job

```text
You are Agent C for NODE_AUTHORING_UX_ROADMAP.md. Own inspector, validation
affordances, and local views. Ensure metadata opens explicitly, validation can
focus problem nodes, and manual nodes appear correctly in outline/task/table
views. Avoid node factory/layout work unless coordinated with Agent A. Update
the roadmap checkboxes you complete.
```

### Agent D Job

```text
You are Agent D for NODE_AUTHORING_UX_ROADMAP.md. Own QA and regression. Build
or run browser tests for root creation, plus child, menu sibling, slash table,
settings edit, save/reopen, revert, delete, and export JSON/Markdown. Do not
implement features except tiny testability fixes. Record pass/fail results in
the roadmap.
```

## Phase 1: Stabilize Current Node Authoring Pass

- [x] Agent A: Add shared manual node factory.
- [x] Agent A: Add shared manual edge factory.
- [x] Agent B: Replace global `Attach to` with root-only creation.
- [x] Agent B: Add node-local child creation.
- [x] Agent B: Add node-local actions menu.
- [x] Agent B: Add slash command menu.
- [x] Agent C: Gate metadata inspector behind explicit settings/open actions.
- [x] Agent B: Add table preview mode.
- [x] Agent A: Cap React Flow fit zoom.
- [x] Agent D: Verify save/reopen preserves nodes created from plus, menu, and slash
  commands.
- [x] Agent D: Verify autosave marks dirty on plus, menu create, slash table,
  table edit, settings, duplicate, and sort actions.
- [x] Agent D: Verify node settings opens from the three-dot menu and applies changes.
- [x] Agent D: Verify deletion removes connected edges and persists cleanly.
- [x] Agent D: Verify duplicate preserves useful fields but creates a new stable ID.
- [x] Agent D: Verify sort children only rearranges direct children.
- [x] Agent D: Verify manual table preview can reopen editor and persist edits.
- [x] Agent D: Verify no console/runtime errors during create/edit/delete/export smoke
  flows.

## Phase 2: Layout And Branching

- [x] Agent A: Replace simple child positioning with a deterministic branch layout
  helper.
- [x] Agent A: Support stacking modes:
  - [x] vertical children
  - [x] balanced left/right map
  - [x] outline-like stack
  - [x] compact task stack
- [x] Agent A: Add per-node collapse/expand state.
- [x] Agent B: Add fold all/check all/sort branch actions where appropriate.
- [x] Agent A: Make edge style consistently orthogonal or smoothstep by mode.
- [x] Agent A: Avoid overlap between bottom-left controls and newly focused root nodes.
- [x] Agent A: Preserve user-dragged positions unless the user explicitly runs layout.

## Phase 3: Slash Commands

- [x] Agent B: Add slash command menu shell.
- [x] Agent B: Add local commands for task, table, question, and note.
- [x] Agent B: Remove the typed `/` when a command is chosen.
- [x] Agent B: Add keyboard navigation: ArrowUp, ArrowDown, Enter, Escape.
- [x] Agent B: Filter commands by typed text after `/`.
- [x] Agent B: Add command groups:
  - [x] Blocks
  - [x] AI
  - [x] Review
  - [x] Handoff
- [x] Agent B + C: Wire AI commands to preview-first actions:
  - [x] AI assistant
  - [x] brainstorm
  - [x] generate questions
  - [x] outline
  - [x] expand
  - [x] rewrite
- [x] Agent C: Ensure AI commands never mutate canonical graph without accept/reject.

## Phase 4: Node Action Menu

- [x] Agent B: Add node-local three-dot menu shell.
- [x] Agent B: Add task above/below, child, duplicate, sort children, reviewed, delete,
  and settings actions.
- [x] Agent C: Defer copy link until durable app links exist.
- [x] Agent A + B: Add move/copy to branch once branch movement is safe.
- [x] Agent B: Add add note as a first-class command.
- [x] Agent B + C: Add highlight/status styling.
- [x] Agent B + C: Add due date/assign quick actions only if they remain compact.
- [x] Agent C: Defer "last edited" metadata until node edit timestamps exist.
- [x] Agent B: Confirm destructive actions when deleting a node with children.

## Phase 5: Compact Node Surface

- [x] Agent B: Render node subject as the primary surface.
- [x] Agent B: Hide metadata badges until hover.
- [x] Agent B: Collapse table nodes into preview mode.
- [x] Agent B: Make generated response nodes compact by default while preserving a
  "details" expansion.
- [x] Agent B: Move long summaries into an expandable note/details area.
- [x] Agent C: Prevent source/validation badges from visually dominating the node.
- [x] Agent C: Add subtle review indicators for missing source/needs review.
- [x] Agent B: Tune node dimensions for readability and layout stability.
- [x] Agent D: Verify text truncation/wrapping across short and long titles.

## Phase 6: Canonical Schema Cleanup

- [x] Agent A: Define one frontend node creation/update API:
  `createWorkspaceNode`, `updateWorkspaceNode`, `createWorkspaceEdge`.
- [x] Agent A: Normalize manual and AI-generated nodes into the same durable shape.
- [x] Agent A: Keep legacy `response.data.summ/df/graph` compatibility only at the
  adapter boundary.
- [x] Agent A + C: Decide the canonical fields for:
  - [x] title
  - [x] body/details
  - [x] node type
  - [x] status
  - [x] task metadata
  - [x] source refs
  - [x] external refs
  - [x] display/collapse state
- [x] Agent D: Add focused tests for node factory behavior.
- [x] Agent D: Add focused tests for graph projection compatibility.

## Phase 7: QA Matrix

### Core Flows

- [x] Create blank workspace.
- [x] Add root.
- [x] Rename root inline.
- [x] Add child via plus.
- [x] Add sibling via node menu.
- [x] Add table via slash command.
- [x] Edit table values.
- [x] Open node settings from menu.
- [x] Apply metadata edit.
- [x] Save.
- [x] Reopen workspace.
- [x] Confirm edges, titles, tables, and metadata persist.

### View Compatibility

- [x] Mind map reflects manual changes.
- [x] Outline view reflects manual changes.
- [x] Task view reflects task-type manual nodes.
- [x] Table view reflects table/reference manual nodes.
- [x] Branch selection still works.
- [x] Validation panel can select/open problem nodes.

### Visual QA

- [x] Dark mode desktop.
- [x] Light mode desktop.
- [x] Narrow viewport.
- [x] Dense graph with 25+ nodes.
- [x] Long node titles.
- [x] Multiple sibling branches.
- [x] Table preview nodes.
- [x] AI-generated nodes with long summaries.

### Persistence And Regression

- [x] Autosave after inline title edit.
- [x] Autosave after plus-created child.
- [x] Autosave after slash-created node.
- [x] Autosave after menu action.
- [x] Revert restores prior graph.
- [x] Delete persists after reopen.
- [x] Export JSON includes manual nodes and edges.
- [x] Markdown export handles manual nodes sensibly.

## Acceptance Criteria

This work is done when:

- Users can build a small map without using a detached parent selector.
- New nodes are created from the node they belong to.
- Root nodes, children, siblings, notes, tables, and question nodes can be
  created with predictable placement.
- Node menus and slash commands are keyboard/mouse usable.
- Metadata remains available but does not dominate the map surface.
- Save/reopen preserves the graph exactly enough for continued editing.
- Manual nodes appear correctly in map, outline, task, and table projections.
- The node system feels usable even when no AI generation has occurred.

## Current Implementation Files

- `frontend/src/utils/manualNodes.js`
- `frontend/src/global-components/ManualNodeControls.jsx`
- `frontend/src/nodes/ResponseNode.jsx`
- `frontend/src/global-components/ManualTableEditor.jsx`
- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/App.jsx`
- `frontend/src/stores/store.js`
- `frontend/src/stores/flowStore.js`
- `frontend/src/index.css`

## Next Recommended Work

Node Authoring UX is closed for the current scope.

Future follow-ups, outside this roadmap's completion gate:

1. Add copy-link actions when durable app links/routes exist.
2. Add last-edited metadata when node-level edit timestamps exist.
3. Revisit dense-graph automatic layout if users start building large maps by
   hand rather than through generated drafts.
