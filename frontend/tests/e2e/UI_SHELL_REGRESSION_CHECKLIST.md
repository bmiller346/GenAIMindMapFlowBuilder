# UI Shell Regression Checklist

Scope: selection, relationship lenses, metadata editing, AI preview-first flows, and major panel layout during the UI shell/ribbon refactor.

## Automated Coverage

- `selection-shell-regression.spec.js`
  - Shift-click additive node selection.
  - Shift-drag/lasso additive selection preserving existing selected nodes.
  - Selected node highlighting via React Flow selected state.
  - Selection action bar count and quick Ask AI answer flow.
  - Branch lens activation from the mind map relationship lens.
  - Branch root and out-of-scope node highlighting.
  - Relationship edge metadata editing through `EdgeInspector`.
  - Shell-flag right properties rail node metadata editing and local apply behavior.
  - Shell-flag right properties rail node metadata omits AI proposal/draft accept/reject and action-creation controls.
  - Shell-flag right properties rail relationship metadata editing and persisted save.
  - Shell-flag right properties rail editable branch properties from the active branch lens.
  - Shell-flag right properties rail editable source properties from the source library.
  - Shell-flag AI draft review routing to the bottom review tray while the right properties rail stays closed.
  - Shell-flag left navigator placement, tab switching, collapse/expand, resize handle visibility, and event-driven workspace tab open.
  - Shell-only left navigator Outline mode rendering the current hierarchy in the fixed left rail.
  - Shell-only left navigator Sources mode embedding the full source library in the fixed rail from WorkspaceDock `Sources > Library`.
  - Shell-only left navigator Activity mode embedding activity history in the fixed rail without opening the legacy floating activity panel.
  - Shell-only left navigator Workspace tab restoration after Outline/Activity and event-driven Workspace tab restoration while Activity is mounted.
  - Basic no-overlap assertion across current major floating panels.

- `review-tray-regression.spec.js`
  - Shell review tray Drafts, Sources/source draft, Issues, Connections, Tasks preview, Checklist Preview, and source repair routes.
  - Shell slot bounding-box coverage for ribbon, left rail, right rail, bottom review tray, and status bar at desktop and narrow widths.

- `shellStore.test.mjs`
  - Shell panel exclusivity rules.
  - Source and branch metadata routes opening the right panel and clearing review trays.
  - Workspace left-panel tab, collapsed, and width state updates.
  - Workspace navigation preserving ribbon/review/metadata state.

- `shellComponents.test.mjs`
  - Shell slot and ribbon server-render contract coverage.
  - Read-only branch/source properties summary rendering.

- `shell-foundation-smoke.spec.js`
  - Shell wrapper slot mounting, slot-state attributes, closed right rail policy, and narrow viewport shell bounds.

Existing related coverage:

- `node-authoring-regression.spec.js`
  - Node metadata editing and persistence.
  - Manual node/table operations and reopen persistence.
- `node-ai-actions-regression.spec.js`
  - Node, branch, workspace, source, and selected-node AI preview-first workflows.
  - AI draft accept/reject behavior and canonical graph mutation only after accept.
  - Inline node Ask AI direct answer and draft routing.
- `source-reconciliation-regression.spec.js`
  - Source repair preview, selective accept, scoped branch Ask AI, task preview acceptance, and persistence.
- `nudges-regression.spec.js`
  - Find connections nudge entry point opens relationship review surface.

## Manual QA Checklist

- Shift-click:
  - Open a workspace with at least three visible map nodes.
  - Shift-click one node, then another.
  - Confirm both nodes remain selected and the action bar count matches.
  - Confirm selected nodes have visible highlight styling and non-selected nodes do not.

- Shift-drag/lasso additive selection:
  - Select one node.
  - Hold Shift and drag a selection rectangle over additional nodes.
  - Confirm the original selection remains selected and newly lassoed nodes are added.
  - Release Shift and drag a normal lasso; confirm non-additive behavior still works.

- Branch highlighting:
  - Use the mind map branch legend to focus a branch.
  - Confirm the branch root is visually marked, in-scope descendants stay prominent, and out-of-scope nodes dim.
  - Clear the branch lens and confirm all nodes return to normal context.

- Relationship lenses:
  - Toggle mind map relationship lens modes and knowledge graph focus modes.
  - Confirm relationship edges/labels update without hiding hierarchy unexpectedly.
  - Confirm lens controls do not cover the selection action bar, properties inspector, or workspace rail.

- Node metadata editing:
  - Open node settings.
  - Change title, status/priority/type, and notes/summary fields.
  - Apply, save/reopen, and confirm values persist on the canvas and in the inspector.

- Edge metadata editing:
  - Open a relationship edge details panel.
  - Change relationship type, confidence, rationale, review state, branch label, condition, and exception path.
  - Apply, save/reopen, and confirm values persist and relationship badges/labels update.

- Source properties:
  - Enable the shell flag and open Sources from the left rail.
  - Open the source library and choose Properties for a loaded source.
  - Confirm the source library closes, the right rail opens, and source coverage/citing-node details appear without opening the floating metadata dock.

- Quick Ask AI:
  - Multi-select nodes and submit a short quick Ask AI question.
  - Confirm it returns an inline answer and does not create graph nodes.
  - Submit a longer drafting prompt.
  - Confirm it opens a draft preview and does not mutate the graph before accept.

- Find connections:
  - Open the Find connections entry point from nudges/AI helpers/local views.
  - Confirm candidates appear in a review surface.
  - Accept selected candidates and confirm relationship edges are added only after accept.
  - Reject/close and confirm hierarchy is unchanged.

- AI preview-first workflows:
  - Run Ask AI from workspace, node, branch, selected nodes, and source scopes.
  - Confirm preview/draft appears before graph mutation.
  - Accept and reject each scope; verify only accept mutates canonical nodes/edges.
  - Reopen the workspace and confirm accepted changes and activity history persist.

- Major panel layout:
  - At 1600x1000, 1440x900, and 390x844 viewports, open combinations of workspace tools, relationship lens, selection bar, node/edge inspector, AI draft preview, source repair, and output/task surfaces.
  - Confirm no major panel hides another panel's primary controls.
  - Confirm the canvas remains usable with active review/metadata surfaces.

- Shell left navigator:
  - Enable `docmap.uiShellRibbon.enabled`.
  - Confirm WorkspaceDock appears in the fixed left rail and not as `workspaceTools` floating chrome.
  - Switch Sources, Health, Guide, and Build tabs.
  - From the Workspace Sources tab, click Library and confirm the full source library opens inside the fixed rail, not as floating source panel chrome.
  - Collapse and expand the rail.
  - Resize the rail manually and confirm the canvas column adjusts.
  - Switch to Outline mode and confirm the hierarchy renders in the fixed rail.
  - Return to Workspace and confirm the prior Sources/Health/Guide/Build tab is still active.
  - Use Branch and Inspect from Outline mode and confirm branch focus / metadata routing still work.
  - Switch to Activity mode and confirm activity history renders inside the rail, Workspace/Outline are not active, collapse/resize controls are available, and no floating activity panel appears.
  - Trigger a workspace open-tab action while Activity is active and confirm Workspace reopens on the requested tab.
  - Trigger Add sources / Start with node from the empty canvas and confirm Sources / Build opens in the rail.

## Current Gaps

- No screenshot diff baseline exists yet for panel overlap; current automated check is bounding-box only.
- Find connections full accept/reject is indirectly covered through nudges and graph projection tests, but not yet as a dedicated e2e for connection candidate accept/reject.
- Shell left navigator manual resize is unit-covered through shell state and manually listed above; browser-level drag automation needs a reliable pointer strategy before enabling.
- Shell Outline mode is read-only. Full branch management and saved-view navigation are not implemented yet.
- Shell Activity mode embeds the existing activity history surface. A redesigned timeline/notification model is not implemented yet.
- Legacy floating panel no-overlap remains a `test.fixme`; shell slot overlap now has bounding-box coverage, but no pixel screenshot diff baseline.

## Final Blockers Before Default Shell

Do not flip `docmap.uiShellRibbon.enabled` or `VITE_ENABLE_UI_SHELL_RIBBON` on by default until all items below are true. FloatingDock retirement is explicitly deferred; this gate blocks duplicate primary surfaces, broken routing, persistence regressions, and shell layout failures while the shell is enabled.

- `selection-shell-regression.spec.js`, `review-tray-regression.spec.js`, `shell-foundation-smoke.spec.js`, `shellStore.test.mjs`, `shellLayoutState.test.mjs`, and `shellComponents.test.mjs` pass.
- Shell-critical `test.fixme` coverage is either fixed or explicitly waived with a manual screenshot gate.
- Manual screenshot pass is complete at 1600x1000, 1440x900, and 390x844 with shell disabled and enabled.
- With shell enabled, WorkspaceDock, source library, Activity, AI Helpers, metadata properties, and review workflows route to shell slots without duplicate primary floating chrome.
- Right rail node, edge, branch, and source property edits apply and persist where expected; metadata-only right rail does not expose AI draft accept/reject or action-creation controls.
- Bottom review tray hosts Drafts, Sources/source repair, Issues, Connections, Tasks preview, and Checklist Preview without opening legacy local-output bridge surfaces.
- Quick Ask AI remains lightweight and separate from review workflows.
- Disabling the shell flag restores the legacy layout and existing workspace data remains intact.
- FloatingDock retirement remains a post-default cleanup item. Legacy FloatingDock code may remain if it is not mounted as duplicate primary chrome under the shell default.
