# UI Shell Contract

The shell is the default workspace scaffold. Set
`VITE_ENABLE_UI_SHELL_RIBBON=false` or localStorage
`docmap.uiShellRibbon.enabled=false` / `legacy` to use the legacy floating-dock
rollback path.

## Slots

- `ribbon`: fixed top command area.
- `leftPanel`: workspace navigation rail.
- `centerCanvas`: existing graph/canvas app surface.
- `rightPanel`: selected item properties.
- `statusBar`: lightweight workspace context and temporary view overrides.
- `bottomTray`: reviewable/generated work.
- `overlayLayer`: future modal/popover host.

`WorkspaceShell` exposes `data-has-left-panel`, `data-has-right-panel`, `data-has-bottom-tray`, and `data-has-status-bar` so tests and downstream lane owners can assert the mounted slot contract without depending on CSS class names.

## Empty State Policy

Closed optional slots collapse by default. A lane should pass `rightPanelPlaceholder` or `bottomTrayPlaceholder` only when it intentionally wants an empty visible surface.

## Ownership Boundaries

Shell/Foundation owns slot markup, shell-level CSS variables, responsive scaffold behavior, and feature-flag integration. It should not move graph logic, AI workflows, inspectors, source parsing, LocalViews behavior, or panel routing authority. Those migrations belong to their lane owners.

In shell mode, right-rail routing authority lives in `shellStore.rightPanel`.
Node, edge, source, and branch properties render from that route. AI Helpers /
Next Steps uses `rightPanel.kind === 'guide'`; it is a guide surface, not a
metadata or review surface. Legacy graph inspector ids are still supported as
compatibility inputs, but they should not be the rendered source of truth for
the shell right rail.

Shell node properties pass `metadataOnly` to `NodeInspector`. The shell right
rail may edit node metadata and show evidence facts, but AI proposal review,
draft-session accept/reject, and action-creating controls belong in the bottom
Review Tray or the shell-off legacy inspector path.

## FloatingDock Retirement Audit

Current status: `FloatingDock` is still a shell-off compatibility system. Do
not remove it broadly while the rollback path remains supported and default
shell visual checks are still open.

Remaining render-time `FloatingDock` surfaces in `frontend/src/App.jsx`:

| Dock id | Current purpose | Shell replacement | Shell-off compatibility needed? | Retirement readiness |
| --- | --- | --- | --- | --- |
| `workspaceTools` | Hosts `ShellWorkspaceNavigatorHost` as the legacy draggable workspace tools dock. | Shell left rail hosts the same workspace navigator. | Yes. It is the primary workspace navigation path when the shell flag is off. | Ready only after shell becomes default and the legacy rollback window closes. |
| `canvasLens` | Hosts `LocalViewsPanel` compact map controls for canvas views in the legacy layout. | Shell ribbon Map tab hosts `MapRibbonHost` and relationship command groups. | Yes. Legacy users still need map/view/filter controls without the shell. | Partial. Shell Map controls exist, but final map readability and lens QA should finish before retirement. |
| `workspaceOutput` | Hosts `LocalViewsPanel` expanded output/review workflow for non-canvas views in the legacy layout. | Reviewable outputs route to the shell Review Tray; accepted Table/Executive/Flowchart/Tasks/Kanban route to structured canvas/output surfaces; shell-only output surfaces cover handoff/status routes. `chartData` has a shell output surface but no current Outputs ribbon command. | Yes. Legacy users still need the old output workflow when shell is off. | Partial. Needs focused QA for Table, Executive, Flowchart, Tasks, Kanban, Checklist Preview, `chartData`, `mondayInput`, and `mondayStatus` before retirement. |
| `mindmapRelationships` | Legacy mind-map relationship lens controls and branch legend. | Shell ribbon Map tab renders `MindmapRelationshipRibbonGroup`. | Yes. Legacy mind-map users need relationship lens controls while shell is off. | Functionally replaced, but removal is still gated by default-shell rollout, rollback window, map readability rules, and shell ribbon coverage. |
| `kgRelationships` | Legacy knowledge-graph relationship focus controls and top insights. | Shell ribbon Map tab renders `KnowledgeGraphRelationshipRibbonGroup`. | Yes. Legacy knowledge-graph users need relationship controls while shell is off. | Functionally replaced, but removal is still gated by default-shell rollout, rollback window, and shell Map tab relationship-control QA. |
| `metadataInspector` | Legacy node/edge metadata inspector dock. | Shell right rail renders node, edge, source, branch, and guide routes. | Yes. Shell-off metadata editing and legacy AI review paths still depend on it. | Blocked. Keep until the shell is default, right-rail metadata is fully verified, and legacy `NodeInspector` AI-review compatibility is no longer required. |

Supporting dependencies:

- `frontend/src/global-components/FloatingDock.jsx` owns drag, dock, context-menu,
  reset, and placement behavior for all legacy floating surfaces.
- `frontend/src/config/localSettings.js` persists placement for
  `canvasLens`, `kgRelationships`, and `workspaceTools` only. Other dock ids
  use their default placement but still render through `FloatingDock`.
- `.floating-dock*` rules in `frontend/src/index.css` still style the legacy
  dock frame, metadata inspector dock, LocalViews dock layouts, and
  relationship dock layouts.

## Non-FloatingDock Floating Surfaces

The audit above covers only `FloatingDock` mounts. Several other floating or
canvas-anchored surfaces still exist and need their own overlay/slot decision
before the rollback path can be retired:

| Surface | Current purpose | Shell direction | Retirement or ownership note |
| --- | --- | --- | --- |
| React Flow `Panel` branch scope banner | Shows active branch scope and branch-lens context. | Treat as temporary canvas context until status-bar/ribbon lens controls fully own the state. | Keep for now; verify it does not collide with ribbon or right rail. |
| React Flow `Panel` selection action bar | Quick actions for selected nodes/branches. | Keep as a small canvas affordance only if it stays below shell chrome and does not duplicate Review Tray. | Agent E visual QA should decide whether it remains a canvas affordance or moves to ribbon/status. |
| Shell output surface panel | Hosts shell-only non-review output panels such as handoff/status surfaces. | Accepted outputs should prefer structured canvas/output surfaces; reviewable previews stay in Review Tray. | Needs route QA for Executive, Flowchart, Tasks, Implementation, Status, and `chartData`. |
| Shell-off AI Helpers panel | Legacy AI helper surface when shell is disabled. | Shell path uses `rightPanel.kind === 'guide'`. | Keep until shell default and rollback window close. |
| AI generation / empty-state panels | Canvas-start actions and generation status. | Likely overlay-layer or left/ribbon actions later. | Do not retire during shell layout migration. |
| `SourceDraftReviewPanel` legacy floating review | Reviews generated source drafts when shell is off. | Shell path routes source draft review to Review Tray. | Keep until shell-off compatibility is no longer required. |

Safe retirement path:

1. Keep all `!useWorkspaceShell` FloatingDock branches intact while the
   rollback path is explicitly supported.
2. Finish shell QA for Map ribbon/lens controls and accepted output surfaces.
3. Verify shell-off regression coverage still passes while the rollback path is
   available, because those tests are the compatibility guardrail.
4. After the rollback window closes, remove one dock family
   at a time: relationship docks, canvas/output docks, workspace tools, then
   metadata inspector last.
5. Remove `FloatingDock.jsx`, `floatingDocks` localSetting persistence, and
   `.floating-dock*` CSS only after no render path imports or mounts
   `FloatingDock`.
