# UI Shell And Ribbon Refactor Roadmap

Last updated: 2026-05-20

## Current Progress Snapshot

This refactor is being worked by multiple lanes. Do not treat a partially migrated shell surface as a regression until the owning lane marks the specific work package complete.

### Coordination Checkpoint: 2026-05-20

Current global status: the shell refactor is a real opt-in MVP, not a default product rollout. The review-tray compatibility bridge has been removed, AI Helpers / Next Steps now route through the shell right-rail guide route, node/edge/source/branch metadata use shell right-panel authority, and shell-mode `NodeInspector` is metadata-only. Home/Sources ribbon commands, first Outputs command groups, left navigator Health/Build modes, review-tray UX labels, bottom status bar, and default-readiness gates have all landed behind the feature flag.

Working-tree caution:

- Keep ownership narrow and check `git status --short` before editing. As of this checkpoint, there may be active uncommitted work around map readability, Outputs ribbon grouping, and shell output tests. Do not overwrite that work while updating the roadmap.

Feature flag:

- Environment flag: `VITE_ENABLE_UI_SHELL_RIBBON`
- Local storage flag: `docmap.uiShellRibbon.enabled`
- Default behavior: unchanged legacy/floating layout.
- Shell behavior: opt-in shell with left rail, right properties rail, direct bottom review tray routes, and compatibility preserved only for the default non-shell layout.

Ready for agents to build on:

- Shell slot contract exists:
  - top ribbon
  - left navigator
  - center canvas
  - right properties panel
  - bottom review tray
  - overlay layer
- `shellStore` exists and has routing actions for ribbon, left panel, right panel, guide panel, bottom tray, overlay, and active scope.
- Left navigator MVP is mounted behind the shell flag.
- Node/edge properties MVP is mounted behind the shell flag.
- Review tray MVP is mounted behind the shell flag for AI draft sessions, source draft review, workspace health validation issues, Connections, task preview/checklist, source repair, and Issues review.
- AI Helpers / Next steps route through `shellStore.rightPanel.kind === 'guide'` behind the shell flag instead of the React Flow bottom-right overlay.
- LocalViews controls have been split into smaller modules. The shell Map tab now uses a dedicated `MapRibbonHost` rather than mounting the full `LocalViewsPanel`.
- Home and Sources ribbon command groups now expose stable shell command surfaces.
- Outputs ribbon commands now distinguish accepted workspace views, execution projections, checklist preview, and handoff outputs for Table, Executive, Flowchart, Tasks, Kanban, Checklist Preview, Implementation, and Status.
- Shell Review Tray labels now distinguish task/checklist previews from accepted task views.
- Left navigator now has first-class Workspace, Sources, Outline, Activity, Health, and Build modes behind the shell flag.
- Shift additive click/lasso selection has active shell regression coverage.
- A map readability / lens product guide now documents branch highlighting, relationship-label lenses, and branch color language.

Not ready for broad QA or cleanup:

- Do not QA the shell as a finished layout.
- Do not retire `FloatingDock` yet.
- Do not expect all output/review surfaces to be final. Connections, task preview, checklist preview, source repair, and Issues review outputs now have direct shell tray routes; accepted/canonical `tasks` remains a structured canvas view. Source and branch properties now have editable shell right-rail MVPs. Output command grouping is improving, but accepted output surfaces still need visual QA and product polish.
- Do not treat default legacy layout as a failure. The shell is intentionally flag-gated.
- Do not run full visual regression against the shell without checking the lane readiness notes below; several surfaces are scaffolded but not product-complete.

Current verification:

- `npm run build` from `frontend/`: passing.
- `node --test tests/shellComponents.test.mjs tests/shellStore.test.mjs tests/shellLayoutState.test.mjs tests/uiShellFeatureFlag.test.mjs` from `frontend/`: passing, 38 tests.
- `npx playwright test tests/e2e/shell-foundation-smoke.spec.js` from `frontend/`: passing, 3 tests.
- `npx playwright test tests/e2e/selection-shell-regression.spec.js tests/e2e/review-tray-regression.spec.js tests/e2e/shell-foundation-smoke.spec.js` from `frontend/`: passing, 21 passed and 1 intentional `fixme` skip.

Known active QA gaps:

- Legacy floating panel overlap in the old layout is documented as a `fixme`; the shell migration is the intended long-term fix.
- Manual visual QA is still needed for ribbon/tray/right-rail density, especially with map lens controls active.
- Branch highlighting and relationship-label lenses are documented and have first e2e coverage for default-off / toggle-on label behavior. Manual visual QA and projection-level unit coverage are still needed before default-shell rollout.

### Default Shell Go/No-Go

Current decision: **no-go for default-on** until every pre-default row below is
green or explicitly waived with a dated owner note. This gate is about making
the shell the default workspace UI, not about retiring legacy code.
`FloatingDock` removal remains deferred unless a separate audit proves a surface
is dead in both shell-on and shell-off paths.

| Blocker | Surface | Risk | Required verification | Status | Pre-default required? |
| --- | --- | --- | --- | --- | --- |
| Visual density QA for ribbon, right rail, review tray, and status bar | Shell geometry | Default shell feels crowded or hides controls at common desktop/narrow sizes | Run shell e2e geometry coverage plus manual screenshots at 1600x1000, 1440x900, and 390x844 with shell on/off | Automated narrow/header/ribbon/tray coverage passing; manual screenshot signoff still open | Yes |
| Accepted output surfaces need verification | Outputs ribbon and accepted workspace views | Accepted Table/Executive/Flowchart/Tasks/Kanban commands route to an invisible surface or wrong tray workflow | Verify Table, Executive, Flowchart, Tasks, and Kanban open accepted canvas/output surfaces; verify Checklist Preview opens the Review Tray | E2E route coverage passing for Table, Executive, Flowchart, Tasks, Kanban, Implementation, Status, and Checklist Preview | Yes |
| Preview vs accepted artifact split stays intact | Review Tray, structured canvas, checklist artifacts | Preview candidates become canonical work before acceptance, or accepted artifacts remain trapped in preview UI | E2E or component coverage for Table/Kanban not opening tray, Checklist Preview opening tray, accepted tasks staying in structured canvas, and checklist artifact persistence | Route split covered; accepted checklist artifact persistence still open | Yes |
| Automated shell verification is green | Build, unit, and e2e suite | Default-on ships with an untested shell route or stale fixture | Run `npm run build`, shell unit tests, shell foundation smoke, selection shell regression, and review tray regression after all active shell edits land | Current bundle passing: build, 38 shell unit tests, 21 shell e2e passed, 1 intentional skip | Yes |
| Map readability and relationship lenses are visually verified | Map ribbon, branch scope, relationship labels | Branch focus, selected nodes, and relationship labels compete visually or confuse review | Visual QA plus coverage that mind map relationship labels default off and can be toggled on intentionally | Default-off / toggle-on e2e passing; manual visual QA and projection unit coverage still open | Yes |
| Preview-first graph mutation remains safe | Connections review and generated previews | Find Connections or related candidate acceptance mutates canonical graph without review | Verify generated connection candidates enter Review Tray first and accept/reject preserves existing mutation behavior | Open | Yes |
| Legacy overlap `fixme` has disposition | Shell-off FloatingDock compatibility layout | Known overlap remains ambiguous when shell becomes default and rollback is needed | Either keep skipped with explicit shell-off waiver/manual screenshot gate, narrow to shell-only geometry, or replace with stable bounding-box coverage | Disposition documented: skipped as shell-off compatibility territory while shell slot geometry guards default readiness | Yes |
| Shell-off compatibility remains covered | Feature flag rollback path | Default-on rollout cannot be safely disabled or corrupts existing workspace data | Run shell-off smoke/manual pass and confirm legacy FloatingDock surfaces still open, edit, save, and reopen existing workspace data | Open | Yes |
| Right rail metadata stays metadata-only and persistent | Node, edge, branch, source properties | AI review/action UI leaks into properties rail, or property edits are lost | Run selection shell regression for node/edge/branch/source properties and metadata-only NodeInspector assertions | Mostly covered; rerun after active test edits land | Yes |
| Review Tray remains authoritative for reviewable generated work | Bottom tray | AI drafts, source drafts, issues, connections, tasks preview, or checklist preview fall back to legacy/full-panel routes | Run review tray regression for direct tray routes and close behavior | Mostly covered; rerun after active tray/output edits land | Yes |
| FloatingDock removal | Legacy floating layout | Removing compatibility chrome breaks shell-off rollback | Keep audit-only until default shell and output cleanup are complete | Deferred | No |
| Richer source/branch metadata | Right rail properties | Default properties are useful but not fully product-complete | Product follow-up with field expansion and persistence tests | Deferred | No |
| Full map projection helper extraction | Mind map projection/lens internals | Lens work remains harder to evolve but current behavior can ship | Refactor plan after branch/lens styling stabilizes | Deferred | No |

### Current Open Items / Agent Split

Use this section when splitting the remaining shell work across parallel agents.
Before any agent starts, check `git status --short`; active work may exist in
`PRODUCT_GUIDE_MAP_READABILITY_AND_LENSES.md`, `frontend/src/App.jsx`,
`frontend/src/ribbon/AiRibbonGroups.jsx`, `frontend/src/index.css`,
`frontend/tests/shellComponents.test.mjs`, and
`frontend/tests/e2e/selection-shell-regression.spec.js`.

#### Landed Shell Lanes

- NodeInspector / Metadata Purity: complete for the shell path. Shell node
  metadata passes `metadataOnly`; task readiness, structured-evidence review,
  AI draft takeover, and AI proposal actions are suppressed in the right rail.
  Legacy shell-off behavior remains intact.
- Ribbon / Outputs: first command surface pass complete. Home and Sources are
  real command groups, and Outputs has accepted/execution/handoff grouping in
  progress. Accepted `tasks` remains a structured canvas view; Checklist
  Preview remains a Review Tray route.
- Review Tray UX: first polish pass complete. Tray headings, scope copy, single
  purpose tabs, Task Preview / Checklist Preview labels, and close behavior are
  routed through the shell tray host.
- Left Navigator / Project Browser: first-class Workspace, Sources, Outline,
  Activity, Health, and Build modes are complete behind the shell flag.
- QA / Default Readiness: shell slot bounding-box coverage exists for ribbon,
  left rail, right rail, review tray, status bar, and narrow Outputs ribbon
  command groups. Shift additive selection/lasso coverage is active. One legacy
  major floating-panel overlap `fixme` remains intentionally skipped with a
  documented shell-off compatibility disposition.

#### Landed Agent A: Default Shell Readiness

Status: landed as documentation/checklist work. Captured default-shell go/no-go
blockers and separated pre-default requirements from post-default cleanup.

Owns:

- `UI_SHELL_RIBBON_REFACTOR_ROADMAP.md`
- `UI_SHELL_RIBBON_REGRESSION_CHECKLIST.md`
- `frontend/tests/e2e/UI_SHELL_REGRESSION_CHECKLIST.md`

Remaining validation:

- Keep the blocker table current as Agent E visual QA and output verification
  land.
- Mark rows green only after the named verification passes.
- Keep `FloatingDock` retirement deferred unless a concrete safe path exists.

Avoid:

- Large UI implementation.
- Broad `App.jsx` changes.

#### Landed Agent B: FloatingDock Retirement Audit

Status: landed for render-time `FloatingDock` mounts. A follow-up must inventory
non-`FloatingDock` floating React Flow panels before any retirement work starts.

Owns:

- `frontend/src/App.jsx` read-only unless a tiny dead-path cleanup is obvious.
- `frontend/src/views/LocalViewsPanel.jsx` read-only unless a tiny dead-path
  cleanup is obvious.
- `frontend/src/global-components/FloatingDock.jsx`
- `frontend/src/shell/README.md`
- `UI_SHELL_RIBBON_REFACTOR_ROADMAP.md`

Remaining validation:

- Keep `FloatingDock` removal blocked until default-on, rollback coverage, and
  metadata/output/map QA are complete.
- Track non-`FloatingDock` panels separately from `FloatingDock` retirement.

Avoid:

- Removing `FloatingDock` broadly.
- Changing shell default behavior.

#### Landed Agent C: Map Readability And Lenses

Status: product guide, first branch styling polish, relationship-label
default-off / toggle-on coverage, and structural-only branch edge emphasis fix
landed. Manual visual QA and projection-level tests remain.

Owns:

- `PRODUCT_GUIDE_MAP_READABILITY_AND_LENSES.md`
- `PRODUCT_GUIDE_WORKSPACE_SHELL.md` only for product-rule alignment.
- Focused map/lens code if implementing a small visual improvement.

Remaining validation:

- Verify branch scope highlighting is direct and readable, not hatch-like in
  manual screenshots.
- Keep relationship labels as a lens/filter control, not an always-on map
  decoration.
- Keep branch scope, selected node state, and relationship-label state visually
  distinct.
- Add projection-level tests for semantic relationship edge exclusion from
  strong branch emphasis before broad lens expansion.

Avoid:

- New popups.
- Large `projectCanvasGraph` refactors before helper extraction is planned.

#### Landed Agent D/E: Visual QA And Shell Geometry

Status: first automated visual QA slice landed. It found and fixed a real
narrow-width header/ribbon collision by reserving a taller shell-only narrow
header and keeping header actions in one horizontally scrollable row.

Owns:

- `frontend/tests/e2e/selection-shell-regression.spec.js`
- `frontend/tests/e2e/review-tray-regression.spec.js`
- `frontend/tests/e2e/shell-foundation-smoke.spec.js`
- small CSS fixes only when isolated.

Landed work:

- Added narrow-width Outputs ribbon geometry coverage for command group overlap
  and body overflow at 390px.
- Kept the legacy FloatingDock overlap test skipped and documented its
  disposition as shell-off compatibility coverage territory.
- Verified shell e2e bundle: 20 passed, 1 intentional skip.

Remaining validation:

- Manual screenshot signoff at 1600x1000, 1440x900, and 390x844 with shell on
  and shell off.
- Recheck the 390px guard whenever future global header actions are added.

#### Next Agent E: Checklist And Accepted Output Continuation

Primary goal: keep preview/accepted output boundaries crisp.

Owns:

- `UX_NUDGES_AND_OUTPUTS_ROADMAP.md`
- `PRODUCT_GUIDE_STRUCTURED_WORK_OUTPUTS.md`
- focused output/checklist surfaces if implementing a small next step.

Work:

- Preserve the three-state split:
  - Checklist Preview: Review Tray.
  - Checklist View / Checklist Artifact: accepted workspace/output layer.
  - Tasks: structured canvas view after acceptance.
- Continue persistent checklist artifact planning or implementation.
- Align Outputs ribbon grouping with accepted views, execution projections, and
  handoff surfaces.

Avoid:

- Moving task candidates into the Tasks view before acceptance.
- Making Checklist Preview an accepted canvas view.

### Consolidated Refactor Game Plan

The parallel-agent split was useful for discovering and landing ownership
boundaries, but the remaining work is now integration-heavy. Move from broad
parallel lanes to one integration owner plus targeted audit agents.

Recommended operating model:

- One integration owner keeps `App.jsx`, shell routing, roadmap/checklists, and
  final staging coherent.
- Use short-lived read-only audit agents for focused questions: visual QA,
  FloatingDock/non-FloatingDock inventory, map/lens correctness, and output
  route coverage.
- Avoid five simultaneous implementation agents touching shared files such as
  `App.jsx`, `frontend/src/index.css`, and shell e2e specs.

Next sequence:

1. Add accepted checklist artifact persistence coverage or explicitly defer it
   as a post-default artifact concern.
2. Add projection-level tests for semantic relationship edge exclusion from
   strong branch emphasis.
3. Add a non-`FloatingDock` floating surface inventory and decide which are
   shell overlays, temporary canvas affordances, or retirement candidates.
4. Complete manual screenshot signoff for shell on/off at desktop and narrow
   widths.
5. Rerun build, shell units, shell e2e, and review tray e2e as the final
   pre-default verification bundle.
6. Only after those pass, decide whether to flip the shell default flag. Keep
   `FloatingDock` retirement as a post-default cleanup track.

#### Deferred Integration: FloatingDock Retirement

Do not assign this as a standalone implementation lane yet. Retire
`FloatingDock` only after Ribbon, Properties, Review Tray, Left Navigator, and
QA all mark their shell paths ready. Until then, FloatingDock remains the
compatibility shell-off path and a guardrail against breaking existing users.

### Agent 1: Shell/Foundation

Status: MVP scaffold complete behind the shell flag; more foundation work remains before the shell can become the default path.

Completed:

- Added shell components under `frontend/src/shell/`:
  - `WorkspaceShell.jsx`
  - `ShellRibbon.jsx`
  - `ShellLeftRail.jsx`
  - `ShellRightPanel.jsx`
  - `ShellBottomTray.jsx`
- Added the feature flag helper at `frontend/src/config/uiShellFeatureFlag.js`.
- Wrapped the existing app body in `WorkspaceShell` only when the shell flag is enabled.
- Preserved the default behavior by rendering the existing app body directly when the flag is off.
- Added shell CSS variables and layout classes in `frontend/src/index.css`.
- Added the initial shell state store at `frontend/src/stores/shellStore.js`.
- Added `frontend/src/shell/WorkspaceShellAdapter.jsx` so the feature-flagged shell wrapper/ribbon orchestration is no longer embedded directly in the App return branch.
- Stabilized the `ShellRibbon` extension API with `renderContent({ activeTab, activeTabConfig, tabs })`.
- Added stable `data-testid` markers for shell wrapper slots and ribbon content.
- Made shell-store open/close/sync actions idempotent so App mirror effects can safely call them without creating React render loops.
- Added `frontend/tests/e2e/shell-foundation-smoke.spec.js` to verify the feature-flagged shell wrapper, ribbon, left slot, canvas slot, and absence of legacy primary floating dock chrome.
- Expanded the shell foundation smoke suite to cover narrow viewport slot behavior and the right-properties slot empty/collapsed policy.
- Added first-pass responsive shell CSS so narrow viewports use bounded overlay rails, horizontally scrollable ribbon tabs, and constrained tray height.
- Added optional right-panel and bottom-tray placeholder hooks to `WorkspaceShell` / `WorkspaceShellAdapter`; current App integration intentionally does not pass placeholders, so closed slots collapse unless an owning lane opens content.
- Added slot-state attributes to `WorkspaceShell`: `data-has-left-panel`, `data-has-right-panel`, and `data-has-bottom-tray`.
- Added tab/tabpanel ARIA wiring to `ShellRibbon`; ribbon content receives the normalized active tab id.
- Added `frontend/src/shell/README.md` to document the feature flag, slot contract, empty-slot policy, and Shell/Foundation ownership boundaries.
- Clamped shell-left layout width in `useShellLayoutState` before it reaches CSS/WorkspaceDock, guarding against invalid persisted or programmatic widths.
- Added `frontend/tests/uiShellFeatureFlag.test.mjs` for the shell feature flag server-safe default and localStorage parsing.
- Added `frontend/tests/shellComponents.test.mjs` for fast server-rendered shell slot and ribbon contract coverage.
- Extracted `deriveShellLayoutState` and added `frontend/tests/shellLayoutState.test.mjs` for default, clamped, and collapsed left-rail layout contracts.
- Integrated shell slots with other lane MVPs:
  - `leftPanel` hosts `WorkspaceDock` in shell mode.
  - `rightPanel` hosts node/edge metadata in shell mode.
  - `bottomTray` hosts review tray MVP in shell mode.
  - `ribbon` hosts `ShellRibbon`; the Map tab now mounts the compatibility LocalViews map controls and relationship ribbon groups behind the shell flag.
- Verified build, shell store tests, and shell foundation smoke tests pass.

Not complete yet:

- The shell wrapper is not the default UI.
- The top ribbon is not product-complete; it currently hosts a dedicated Map ribbon host plus first Home, Sources, AI, Review, and Outputs command groups.
- The overlay layer exists but is not the authoritative popover/modal router.
- Shell responsive behavior is predictable enough for smoke coverage, but still needs CSS/Layout Systems follow-up before product QA or default rollout.
- The shell does not yet own all panel state. Legacy local state still drives live behavior in several areas.
- Floating docks are still the default and still exist for compatibility.
- `data-has-bottom-tray` may be `true` in fixtures where Review Tray or LocalViews output migration opens a tray by default. Shell/Foundation owns whether the attribute matches mounted markup, not whether an owning workflow should open the tray.

Dependencies:

- Depends on Ribbon/LocalViews to provide the actual command groups for `ShellRibbon`.
- Depends on State/Panel Router before shell state becomes authoritative instead of mirrored from legacy App state.
- Depends on Properties Panel before right rail can cover source metadata and editable branch metadata.
- Depends on Review Tray before all generated/reviewable work leaves floating or LocalViews surfaces.
- Depends on CSS/Layout Systems for final z-index, rail sizing, tray sizing, and mobile/narrow layouts.
- Depends on QA for shell-flag smoke coverage before flipping the shell on by default.
- Depends on Properties Panel + QA to keep the right-rail coverage green as source metadata and branch editing are added.

QA guidance:

- Safe to QA now with shell flag on:
  - shell wrapper renders
  - header remains fixed
  - canvas remains usable
  - left rail appears with WorkspaceDock
  - right rail appears for node/edge metadata routes
  - bottom tray appears for supported draft/source review routes
  - narrow viewport shell slots remain present and bounded
  - shell slot-state attributes match the mounted optional slots
  - ribbon tab/tabpanel ARIA wiring tracks the active tab
- Safe to QA now with shell flag off:
  - legacy behavior remains unchanged
- Do not fail yet:
  - non-Map ribbon tabs have first command groups but are not yet product-final
  - Map controls still carry some old styling inside the ribbon
  - relationship controls still have compatibility wiring and are not final ribbon groups
  - overlay layer is unused
  - narrow/mobile shell layout is not product-final
  - full shell selection regression still contains intentional `fixme` coverage, but active tests are green

Next steps for Agent 1:

1. Keep shell wrapper/ribbon orchestration inside `WorkspaceShellAdapter`; future shell slot changes should prefer adapter props over more App return-branch logic.
2. Audit shell slot props and remove unused placeholder paths only if no owning lane depends on them.
3. Coordinate with CSS/Layout Systems on final desktop and narrow rail sizing before any default-shell rollout.
4. Do not make the shell default yet.
5. Add only small shell contract tests when slot behavior changes.
6. Keep FloatingDock compatibility until Ribbon, Properties, Review Tray, and QA all mark their primary migrations complete.

Do not touch:

- Review workflow internals.
- Source editing.
- AI draft logic.

### Agent 2: State/Panel Router

Status: sixth safe slice complete behind the shell flag. Shell slot hosts, left navigator host, typed review-tray route actions, authoritative local-output review tray routes, and shell-owned source-library left routing are in place; legacy App behavior remains intact.

Completed:

- Added `frontend/src/shell/WorkspaceShellAdapter.jsx`.
- Moved the `WorkspaceShell` + `ShellRibbon` wrapper orchestration out of the App return branch.
- Added `frontend/src/shell/useWorkspaceShellRouter.js`.
- Moved shell synchronization effects for node/edge right-panel routing, AI draft tray routing, and source draft tray routing out of `App.jsx`.
- Added `frontend/src/shell/ShellPropertiesPanelHost.jsx`.
- Added `frontend/src/shell/ShellReviewTrayHost.jsx`.
- Moved shell right-panel and bottom-tray render branching out of `App.jsx`.
- Added `frontend/src/shell/useShellLayoutState.js`.
- Added `frontend/src/shell/ShellOverlayHost.jsx`.
- Moved the shell store selector, left-rail width derivation, and overlay rendering out of `App.jsx`.
- Added `frontend/src/shell/ShellWorkspaceNavigatorHost.jsx`.
- Moved `WorkspaceDock` rendering and shell outline/workspace navigator wrapping out of `App.jsx`.
- Kept React Flow rendering, canvas event handling, data fetching, and legacy fallback behavior in `App.jsx`.
- Added explicit shell-store route actions:
  - `openDraftReviewTray(sessionId)`
  - `openSourceDraftReviewTray(sourceDraftId)`
  - `openValidationIssuesTray(validationId)`
  - `openLocalOutputReviewTray(tray, { view })`
- Replaced ad hoc App `bottomTray.context` setup for AI draft sessions and source draft review with those route actions.
- Added `localOutputReview` bottom-tray routing for reviewable output views:
  - `connections` -> `Connections`
  - `preview` / `checklist` -> `Tasks`
  - `gaps` / `sme` -> `Issues`
  - `sources` -> `Sources`
- `useWorkspaceShellRouter` now derives local-output review tray routes from `activeView` on the shell path.
- `ShellReviewTrayHost` now consumes routed `bottomTray` state for Connections, Tasks, Checklist, Sources, and Issues directly. The old `ShellLocalOutputReviewTrayHost` / `LocalViewsPanel outputOnly` bridge has been removed.
- Added `openSourceLibrary({ width })` to `shellStore`.
- Shell-path source-library openers now route to `shellStore.leftPanel.kind === 'sources'` instead of opening the legacy floating `SourcesPanel`.
- `ShellLeftNavigatorHost` / `ShellWorkspaceNavigatorHost` now expose a `Sources` navigator mode and embed the existing `SourcesPanel` in the left rail while preserving the default legacy panel path.
- Removed duplicate direct `openRightPanel` / `openDraftReviewTray` calls from App paths that already update inspector or draft state; `useWorkspaceShellRouter` now derives those shell routes.
- Extended `frontend/tests/shellStore.test.mjs` to cover typed review tray routes, including validation issues, local-output review routes, and source-library left routing.
- Extended `frontend/tests/shellLayoutState.test.mjs` and `selection-shell-regression.spec.js` for source-left-rail routing.
- Verified:
- `node --test frontend/tests/shellStore.test.mjs` passes.
- `npm run build` from `frontend/` passes.
- `node --test tests/shellStore.test.mjs tests/shellLayoutState.test.mjs tests/shellComponents.test.mjs tests/uiShellFeatureFlag.test.mjs` from `frontend/` passes.
- `npx playwright test tests/e2e/selection-shell-regression.spec.js` from `frontend/` passes active shell coverage, including shift additive selection/lasso; one legacy overlap `fixme` remains intentionally skipped in the combined shell e2e run.

Not complete yet:

- `WorkspaceShellAdapter`, `ShellPropertiesPanelHost`, and `ShellReviewTrayHost` still receive app state as props; they do not own data fetching or canvas state.
- `App.jsx` still owns workflow state, but no longer imports `shellStore` directly.
- `isSourcesOpen` remains for the default legacy path only; shell-path source-library opening is routed through `shellStore.leftPanel`.
- `isAiHelpersOpen` remains for the default legacy path only; shell-path AI Helpers / Next steps route through `shellStore.rightPanel.kind === 'guide'`.
- Legacy inspector ids can still be promoted into `shellStore.rightPanel`, but `rightPanel` is the shell-path render authority for node, edge, source, branch, and guide surfaces.
- `shellStore.bottomTray` is now authoritative for the currently migrated tray hosts and for local-output review tray route intent. Connections, task preview, checklist preview, source repair, and Issues review outputs now render directly through `ShellReviewTrayHost`; accepted/canonical `tasks` remains in the structured canvas `Tasks` view; no shell local-output fallback bridge remains.

Next steps for Agent 2:

1. Keep `isAiHelpersOpen` legacy-only and prevent new shell code from reading it as layout state.
2. Keep source-library routing shell-only until QA confirms the embedded left-rail source library on narrow viewports.
3. Continue retiring legacy inspector-id callers only where the default/floating path has a clear replacement.
4. Do not route generated/reviewable work through the guide panel; keep those flows in Review Tray.

### Agent 3: Ribbon / LocalViews Split

Status: in progress, extraction complete, first shell ribbon placement complete behind the shell flag.

Completed:

- Split compact and expanded map controls out of `frontend/src/views/LocalViewsPanel.jsx`.
- Added extracted control modules under `frontend/src/views/localViews/`:
  - `MapControls.jsx`
  - `FilterControls.jsx`
  - `OutputWorkflowControls.jsx`
  - `FollowUpActionsBar.jsx`
  - `ReviewExplanationContent.jsx`
- Added `frontend/src/ribbon/CanvasRibbon.jsx` as a ribbon-facing export point for the extracted map controls.
- Added `frontend/src/ribbon/RelationshipRibbonGroups.jsx` for the mind map and knowledge graph relationship lens groups.
- Added `frontend/src/views/localViews/localViewConfig.js` so the shell ribbon host and legacy/full LocalViews panel share one source for canvas views, output groups, node-density options, next-action copy, and graph filters.
- Added `frontend/src/ribbon/MapRibbonHost.jsx` so the shell Map tab mounts extracted map controls directly, instead of mounting the full `LocalViewsPanel`.
- Mounted the dedicated Map ribbon host in `ShellRibbon` when `VITE_ENABLE_UI_SHELL_RIBBON` / `docmap.uiShellRibbon.enabled` is enabled and the Map tab is active.
- Moved relationship lens UI into shell ribbon groups for the shell path while preserving the legacy floating relationship docks when the shell flag is off.
- Split non-canvas output/review rendering into `frontend/src/views/OutputPanel.jsx`.
- Routed reviewable local output views through the bottom Review Tray on the shell path:
  - `connections` -> Connections tab
  - `preview` / `checklist` -> Tasks tab
  - `gaps` / `sme` -> Issues tab
  - `sources` -> Sources tab
- Kept non-review output surfaces, such as table/executive/handoff views, outside this first tray migration.
- Added shell AI, Review, and Outputs ribbon command groups in `frontend/src/ribbon/AiRibbonGroups.jsx`.
- Added shell AI commands for Find connections, Find software overlap, Create table, and Generate tasks. These reuse the preview-first PromptModal flow and route reviewable results toward the tray-backed views.
- Extracted the Connections review surface to `frontend/src/review/ConnectionsReviewSurface.jsx`.
  - `OutputPanel` now delegates the `connections` view to this component.
  - This gives Review Tray a stable component to mount directly without importing all of `LocalViewsPanel`.
- Extracted task review surfaces to `frontend/src/review/TasksReviewSurface.jsx`.
  - Includes `TaskPreviewSurface` for preview/acceptance; `AcceptedTasksSurface` remains available for legacy/full-panel compatibility, but product routing keeps canonical accepted tasks in the structured canvas `Tasks` view.
  - `OutputPanel` now delegates the `preview` and legacy/full-panel `tasks` views to this component.
- Extracted source repair/coverage review to `frontend/src/review/SourcesReviewSurface.jsx`.
  - Wraps the existing `SourceRepairPreview` behavior with a tray-ready import path.
  - `OutputPanel` now delegates the `sources` view to this component.
- Removed the temporary `frontend/src/review/reviewSurfaceRegistry.js` after shell review routing moved to `shellStore` and direct tray hosts.
- Preserved current behavior: LocalViews still drives the same store state, popovers, output routing, follow-up action launching, task preview acceptance, and relationship review actions.
- Verified `npm run build` from `frontend/` passes.

Not complete yet:

- The existing `LocalViewsPanel` remains a compatibility wrapper for legacy/full-panel routes, but major output/review rendering now lives in `OutputPanel` for the non-shell path and direct shell review-tray hosts for the shell path. Shell Map tab controls mount through `MapRibbonHost`.
- Find connections setup now has an AI ribbon entry. Candidate review has a clean `ConnectionsReviewSurface`, and Agent 6 now mounts it directly in `ShellReviewTrayHost` through `useConnectionsReviewController`.
- Task preview now has clean `TasksReviewSurface` exports, and Agent 6 mounts task candidate routes directly in `ShellReviewTrayHost` through `useTasksReviewController`. Accepted/canonical `tasks` stays in the structured canvas Tasks view. Checklist Preview is also routed through the direct tray host.
- Source repair/coverage review now has a clean `SourcesReviewSurface` export, and Agent 6 now mounts it directly in `ShellReviewTrayHost` through `useSourcesReviewController`.
- First non-review output surfaces now have shell Outputs command routes. Table, Executive, Flowchart, Tasks, Kanban, Implementation, and Status are exposed through the grouped Outputs ribbon.
- Home and Sources ribbon tabs now have first command groups. They still need product polish and visual QA, but they are no longer placeholders.
- Agent 3's component extraction dependency for Agent 6 is complete. Direct tray routes exist for Connections, Tasks, Checklist, Sources, and Issues. The old `useLocalOutputReviewController`, `reviewSurfaceRegistry`, `ShellLocalOutputReviewTrayHost`, and `LocalViewsPanel outputOnly` bridge have been removed.
- The shell Map tab no longer mounts `LocalViewsPanel`; it uses a thin `MapRibbonHost` with the extracted compact map controls and shared LocalViews config.

Dependencies:

- Depends on State/Panel Router for richer ribbon tab/context state before Home/AI/Review/Sources/Outputs can become authoritative command tabs.
- Review Tray direct routes are complete for the current reviewable local-output views. Future dependencies are around UX polish and additional workflows, not the old compatibility bridge.
- Coordinates with Left Rail before moving any saved view/source/navigation style controls out of LocalViews.

QA guidance:

- Safe to QA: existing LocalViews behavior, shell Map tab ribbon rendering behind the shell flag, map view switching, filters, branch scope, node density, reflow dispatch, relationship lens mode switching, mind map branch focus, KG insight edge opening, output menu routing, relationship review copy/download, and task preview acceptance.
- Do not fail yet: "Find connections is still also available from LocalViews/ribbon output menu", "`OutputPanel` still supports legacy/full-panel output routes", or "Home/Sources/Outputs ribbon commands are not product-final." Those are known incomplete migration steps.

Next steps for Agent 3:

1. Finish visual QA for the Home, Sources, and Outputs command groups.
2. Keep ribbon commands thin by routing through shell/router actions as remaining review controllers land.
3. Complete accepted/execution/handoff Outputs grouping without moving preview candidates into accepted views.
4. Keep Checklist Preview routed through the direct tray path, while Checklist View / Checklist Artifact remain accepted workspace/output-layer concerns.
5. Keep relationship labels lens-driven, not always-on.
6. Do not redesign the whole ribbon visually yet; finish command ownership first.

### Agent 4: Left Navigator

Status: first visible left-rail migration complete behind the shell flag; default compatibility behavior preserved.

Completed:

- Made `frontend/src/global-components/WorkspaceDock.jsx` controllable for:
  - `activeTab` / `onActiveTabChange`
  - `open` and `collapsed` / `onOpenChange` / `onCollapsedChange`
  - `width` / `onWidthChange`
- Preserved fallback internal state, so existing callers still work without controlled props.
- Preserved `WORKSPACE_DOCK_OPEN_TAB_EVENT`; event callers still expand the dock and switch tabs.
- `shellStore.leftPanel` now owns WorkspaceDock active tab, collapsed state, and width; `App.jsx` adapts that state into the controlled dock props.
- When `VITE_ENABLE_UI_SHELL_RIBBON` or localStorage `docmap.uiShellRibbon.enabled` is enabled, the same WorkspaceDock instance is mounted into `WorkspaceShell` as the `leftPanel`.
- When the shell flag is off, WorkspaceDock still renders through the existing `FloatingDock id="workspaceTools"` path.
- Added shell-left CSS so WorkspaceDock fills the shell rail without floating dock chrome.
- Threaded the controlled WorkspaceDock width into `WorkspaceShell` so resize/collapse adjusts the shell left column.
- Added `shellStore` helpers for left-panel tab, collapse, and width updates.
- Added unit coverage for left-panel tab/collapse/width updates and focused Playwright coverage for shell-flag left rail placement, tab switching, collapse/expand, and event-driven open-tab behavior.
- Split WorkspaceDock tab bodies into focused components under `frontend/src/global-components/workspaceDock/`:
  - `WorkspaceSourcesTab.jsx`
  - `WorkspaceHealthTab.jsx`
  - `WorkspaceGuidanceTab.jsx`
  - `WorkspaceBuildTab.jsx`
- Added `workspace-dock-nav` as a stable nav hook while preserving existing `workspace-dock-tabs` styling.
- Verified the Health tab's `Review issues in tray` action opens the shell bottom tray `Issues` tab with `GraphValidationPanel`.
- Added `frontend/src/shell/ShellLeftNavigatorHost.jsx` as a shell-only left navigator host.
- Added a read-only `Outline` route in the shell left navigator using the current workspace nodes/edges.
- Workspace remains the default left navigator surface; Outline is available through the shell-only mode switch.
- Added a shell-only `Activity` route in the left navigator using the existing ActivityPanel in embedded mode.
- Embedded Activity keeps event filtering/history behavior but removes the floating close button and stays inside the left rail.
- Moved shell open-tab event handling up to `ShellWorkspaceNavigatorHost`, so `WORKSPACE_DOCK_OPEN_TAB_EVENT` can restore WorkspaceDock tabs even while Outline or Activity is mounted.
- Preserved the last active WorkspaceDock tab when switching through Outline or Activity.
- Added collapse and resize controls for shell-only Outline and Activity modes.
- Hardened Outline root projection so malformed/cyclic hierarchy edges fall back to a visible node list instead of an empty tree.
- Added a shell-left `Sources` route for the full source library behind the shell flag.
- Routed WorkspaceDock `Sources > Library` and Drawer source-library opens to the shell-left `Sources` route when the shell flag is enabled; legacy still uses the existing floating `SourcesPanel`.
- Kept WorkspaceDock's `Sources` tab distinct from the shell-left source library route.
- Verified `npm run build` from `frontend/` passes.

Not complete yet:

- WorkspaceDock internals are split into smaller tab components, but the old Sources, Health, Guide, and Build behavior is preserved rather than redesigned.
- Branch/outline tree, saved views, and source navigation grouping are not split into dedicated left-nav sections yet.
- A first read-only Outline route exists, but it is not yet a full branch/outline management surface.
- A first Activity route exists, but it is the existing activity history surface embedded in the rail, not a redesigned timeline or notification center.
- A first Sources route exists for the source library, and source metadata editing is owned by the shell Properties Panel; source internals are still the existing `SourcesPanel`.
- Outline/Activity collapse and resize now exist, but browser-level drag automation is still limited to visibility/state coverage rather than precise drag-distance assertions.
- The left rail is only visible in the shell-flag path. The default path intentionally remains the old floating dock.
- `isSourcesOpen` is now legacy-only for the shell-off path. Do not treat source library internals still looking like the existing SourcesPanel as a left-nav failure yet.
- FloatingDock is not retired globally; only the workspace tools dock is bypassed when the shell flag is on.

Dependencies:

- Depends on Shell/Foundation for the feature-flagged `WorkspaceShell` slot contract and shell CSS.
- State/Panel Router dependency for left-panel tab/collapse/width ownership and first source-library routing is resolved for this slice.
- Depends on Ribbon/LocalViews before any saved-view/map command content should be moved into the left navigator.
- Depends on QA for shell-flag visual checks of left rail resize/collapse, tab switching, and any remaining `WORKSPACE_DOCK_OPEN_TAB_EVENT` callers outside the tested shell path.

QA guidance:

- Safe to QA now with the shell flag on: WorkspaceDock appears in the fixed left rail, tabs switch, collapse/expand works, resize handles are present, Sources/Health/Guide/Build content still works, WorkspaceDock `Sources > Library` opens the full source library in the left rail, Drawer source-library opens route to the same shell-left library surface, Health can open validation issues in the bottom tray, the shell-only Outline mode renders the current hierarchy read-only, Activity mode renders the existing activity history embedded in the fixed rail, returning from Outline/Activity preserves the last WorkspaceDock tab, and open-tab events can restore Workspace mode from Activity.
- Safe to QA now with the shell flag off: WorkspaceDock still appears in the floating dock and behaves as before.
- Do not fail yet: "left nav is not redesigned", "source library internals still look like the existing SourcesPanel", "outline/saved views are not full management surfaces", "Activity is not redesigned", or "other floating docks still exist."

Next steps for Agent 4:

1. Add manual screenshot QA for shell-flag left rail at desktop and narrow widths, including Workspace, Sources, Outline, Activity, collapse, and interaction with right panel/bottom tray.
2. Add a dedicated source-left-rail e2e once the broader shell suite is reorganized; the focused shell-left regression currently covers WorkspaceDock `Sources > Library`.
3. Expand Branches only after product confirms whether branch navigation belongs beside Outline or remains lens-driven.
4. Coordinate with Agent 5 before making source metadata editable.
5. Keep `WorkspaceDock` compatibility intact while moving one tab at a time.
6. Do not turn the left rail into another inspector.

### Agent 6: Review Tray

Status: MVP plus direct local-output review slices complete behind the shell flag. Review tray hosts exist for routed review workflows, direct Connections review, direct task preview/checklist preview review, direct source repair review, and direct gaps/SME Issues review. Accepted/canonical `tasks` remains a structured canvas view. The fallback local-output bridge has been removed from the shell path.

Completed:

- Added `frontend/src/review/ReviewTray.jsx`.
- `ReviewTray` provides the common bottom-tray frame, review tabs, close behavior, empty states, and AI draft session hosting.
- `AiDraftSessionPanel` can render in the `Drafts` tab through the existing `activeAIDraftSession` route.
- `SourceDraftReviewPanel` now supports `variant="tray"` so it can render inside the shell tray without its React Flow floating `Panel` wrapper.
- When `VITE_ENABLE_UI_SHELL_RIBBON` or localStorage `docmap.uiShellRibbon.enabled` is enabled, pending source drafts open in the bottom tray under the `Sources` tab.
- `GraphValidationPanel` can render in the `Issues` tab from the shell left-rail Health panel through "Review issues in tray."
- Shell Review/Outputs ribbon routes now route local output review surfaces into the bottom tray:
  - `preview` / `checklist` -> `Tasks` tab
  - `gaps` / `sme` -> `Issues` tab
  - `sources` -> `Sources` tab
- Agent 2 added authoritative `shellStore.bottomTray` route actions for those local-output review tabs.
- Added `frontend/src/review/useConnectionsReviewController.js` as the first direct tray controller extracted from `LocalViewsPanel`.
- `ShellReviewTrayHost` now mounts `ConnectionsReviewSurface` directly for `localOutputReview` / `connections` routes, without `LocalViewsPanel outputOnly` or `OutputPanel`.
- Added `frontend/src/review/useTasksReviewController.js` for direct task preview routes and checklist controller props.
- `ShellReviewTrayHost` now mounts `TasksReviewSurface` directly for task preview routes.
- `ShellReviewTrayHost` now mounts `ChecklistPreview` directly for `localOutputReview` / `tasks` routes with `view: checklist`.
- Added `frontend/src/review/useSourcesReviewController.js` for direct source repair / coverage review.
- `ShellReviewTrayHost` now mounts `SourcesReviewSurface` directly for `localOutputReview` / `sources` routes.
- Added `frontend/src/review/IssuesReviewSurface.jsx` and `frontend/src/review/useIssuesReviewController.js` for direct gaps / SME Issues review.
- `ShellReviewTrayHost` now mounts `IssuesReviewSurface` directly for `localOutputReview` / `issues` routes while preserving the separate Health validation `Issues` route.
- Removed `ShellLocalOutputReviewTrayHost`, `useLocalOutputReviewController`, `reviewSurfaceRegistry`, and the `LocalViewsPanel outputOnly` branch after direct tray hosts covered the shell routes.
- When the shell flag is off, source draft review still uses the legacy floating React Flow panel.
- Added `frontend/tests/e2e/review-tray-regression.spec.js` for shell-flag tray smoke coverage.
- Added regression coverage that shell Review/Outputs ribbon local-output routes open the bottom tray through shell state; Connections, Tasks, Checklist, Issues, and Sources render without the LocalViews/OutputPanel wrapper, and the tray closes cleanly.
- Verified `npm run build` from `frontend/` passes.
- Verified `npx playwright test tests/e2e/review-tray-regression.spec.js` from `frontend/` passes.

Not complete yet:

- Direct tray surfaces are now live for Connections, Tasks preview, Checklist Preview, Sources repair/coverage, and Gaps/SME Issues.
- Validation issue review is in the `Issues` tab, but the Health panel still also hosts the same validation component. This is intentional during migration.
- `AiDraftSessionPanel` still owns a large mixed preview/apply surface; this pass changed placement, not behavior or internal structure.
- `LocalViewsPanel` still owns legacy output/review controller state for the non-shell and full-panel paths and should not be QA-failed for that yet. The shell tray no longer imports `LocalViewsPanel outputOnly`.

Dependencies:

- Depends on Shell/Foundation and CSS/Layout for final bottom-tray sizing, responsive behavior, and avoiding overlap with left/right rails.
- State/Panel Router dependency for authoritative local-output tray route actions is resolved.
- The Connections controller extraction dependency is resolved for the first direct tray slice.
- Direct controller extraction is complete for Connections, Tasks, Checklist, Sources, and Issues.
- Depends on QA for shell-flag smoke coverage of AI draft session review and source draft review in the bottom tray.

QA guidance:

- Safe to QA now with the shell flag on: AI draft sessions open in the `Drafts` tab; pending source draft review opens in the `Sources` tab; workspace health opens in the `Issues` tab from Health -> "Review issues in tray"; Review ribbon Connections opens direct `ConnectionsReviewSurface`; task previews open direct `TasksReviewSurface`; checklist previews open direct `ChecklistPreview`; source repair opens direct `SourcesReviewSurface`; gaps/SME issues open direct `IssuesReviewSurface`; accepted/canonical tasks remain in the structured canvas `Tasks` view; accept/cancel/close behavior still updates the same underlying state; the canvas remains visible while reviewing.
- Safe to QA now with the shell flag off: source draft review still opens as the legacy floating panel.
- Do not fail yet: "Find connections is still also available from LocalViews/ribbon output menu" or "Health still also shows validation issues." Those are known follow-up/migration compatibility states.

Next steps for Agent 6:

1. Keep AI draft, source draft, validation issue, Connections, Tasks, Checklist, Issues, and Sources tray tests green.
2. Coordinate with Ribbon/LocalViews before removing any legacy/full-panel output paths that still depend on `OutputPanel`.
3. Polish tab labels, empty states, and close behavior now that the shell tray has no fallback local-output bridge.

### Agent 5: Properties Panel

Status: node/edge properties rail plus editable source/branch properties MVPs complete behind the shell flag; default compatibility behavior preserved.

Completed:

- Routed selected node and selected edge metadata into the `WorkspaceShell` `rightPanel` slot when `VITE_ENABLE_UI_SHELL_RIBBON` or localStorage `docmap.uiShellRibbon.enabled` is enabled.
- Reused `frontend/src/shell/ShellRightPanel.jsx` as the right rail host instead of creating a parallel properties container.
- Preserved the shell-flag-off path: metadata still renders through `FloatingDock id="metadataInspector"` by default.
- Kept `NodeInspector` and `EdgeInspector` save/apply mutation logic unchanged.
- Added `metadataOnly` support to `NodeInspector` so the shell right rail shows node metadata without also becoming the AI proposal/draft review host.
- Shifted shell-path node/edge metadata authority to `shellStore.rightPanel`; legacy inspector ids can still be promoted for compatibility, but the shell properties host now renders from the right-panel route.
- Stopped legacy AI action previews from mounting the floating metadata inspector when the shell flag is enabled; reviewable proposal surfaces should continue moving toward the bottom tray.
- Added Playwright coverage for shell-flag node metadata editing and shell-flag relationship metadata editing in `frontend/tests/e2e/selection-shell-regression.spec.js`.
- Added an explicit branch Properties action to the active branch-lens banner and an editable `BranchPropertiesPanel` in the shell right rail.
- Added Playwright coverage for shell-flag branch properties routing and verified AI draft review still routes to the bottom tray instead of the right rail.
- Added an explicit source library Properties action and an editable `SourcePropertiesPanel` in the shell right rail.
- Added Playwright coverage for shell-flag source properties routing from the source library while keeping the source library surface closed after routing.
- Added branch title/type/status/owner/due/summary editing from the shell right rail, applied to the canonical branch root node.
- Added source title/status/classification/version/path editing from the shell right rail, applied to the persisted source library and synced to matching data-source nodes when present.
- Added shell-store coverage that source and branch metadata routes open the right panel and clear review trays.
- Added server-rendered component coverage that source and branch properties panels render their summaries.
- Added server-rendered component coverage that `ShellPropertiesPanelHost` uses the shell right-panel route as its metadata source.
- Fixed a shell-mount React Flow update loop by stabilizing React Flow config props and avoiding redundant selected-node array state updates.
- Verified `node --test tests/shellStore.test.mjs` and `node --test tests/shellComponents.test.mjs` from `frontend/` pass.
- Verified `npx playwright test tests/e2e/selection-shell-regression.spec.js` from `frontend/` passes active coverage.
- Verified `npm run build` from `frontend/` passes.

Not complete yet:

- Source and branch properties now support focused metadata editing; richer source internals and branch governance fields remain future work.
- AI draft sessions, AI action previews, source draft review, and other reviewable workflows are not moved to the right rail. That is intentional; those belong to Review Tray.
- `NodeInspector` still contains AI review code for compatibility with the legacy/floating path. It has only been suppressed in the shell right rail via `metadataOnly`.
- The right rail appears only in the shell-flag path. The default path intentionally remains the old floating metadata dock.
- Full retirement of `metadataInspector` FloatingDock is deferred until Review Tray and default-shell rollout are ready.

Dependencies:

- Depends on Shell/Foundation for the stable `WorkspaceShell` `rightPanel` slot and shell sizing tokens.
- Node/edge shell routing now uses `shellStore.rightPanel` as the active metadata route. A later cleanup can remove legacy graph-store inspector ids after the default/floating path is retired.
- Depends on Review Tray before AI draft/session/proposal surfaces can be removed from `NodeInspector` entirely.
- Depends on Left Navigator / source-library work before source properties move beyond explicit source-library Properties routing into richer editing.
- Depends on Ribbon/LocalViews and State/Panel Router before branch properties can move beyond explicit branch-lens Properties routing into richer editing.
- Depends on QA for shell-flag visual and behavioral checks before marking the properties rail product-complete.

QA guidance:

- Safe to QA now with the shell flag on: selecting/opening a node or edge routes metadata to the fixed right rail, the active branch lens can open and edit branch properties explicitly, source library Properties can edit source metadata, and node/edge/source/branch properties do not appear at the same time.
- Safe to QA now with the shell flag off: metadata still appears in the floating dock and behaves as before.
- Do not mark the properties lane complete yet: richer source internals, richer branch governance fields, and final legacy inspector-id cleanup still need follow-up.
- Do not fail yet: "source metadata fields are still limited", "branch metadata fields are still limited", "AI draft review is not in the right rail", or "legacy NodeInspector still contains AI review code." Those are known deferred steps.
- Do not preemptively QA full FloatingDock retirement from this lane; that depends on Review Tray and default-shell rollout.

Next steps for Agent 5:

1. Keep node/edge metadata green.
2. Keep source-property edits scoped to library metadata until Agent 4 defines deeper source-library ownership.
3. Keep branch-property edits scoped to the branch root node until richer branch save semantics are clear.
4. Keep selecting node, edge, source, or branch opening exactly one right-panel surface.
5. Add focused tests for source and branch panel behavior once editable.
6. Do not put AI proposal review into the right panel.

### Agent 7: QA / Regression

Status: active coverage and tracking in place; Shell/Foundation smoke is green, but the broader shell selection/properties suite is intentionally not a global green gate yet.

Completed:

- Added `frontend/tests/e2e/UI_SHELL_REGRESSION_CHECKLIST.md` as the manual and automated QA checklist for this refactor.
- Expanded `frontend/tests/shellStore.test.mjs` to cover:
  - metadata/right-panel routing exclusivity with bottom tray
  - AI proposal bottom-tray routing
  - workspace navigation state
  - invalid panel/tray/ribbon fallback behavior
  - overlay close/clear behavior
- Added and maintained `frontend/tests/e2e/selection-shell-regression.spec.js` coverage for:
  - quick Ask AI scope/result behavior
  - branch lens focus/clear behavior
  - shell flag mounting the ribbon, left navigator, and canvas slots
  - shell left navigator tab switching, collapse, event-driven open-tab behavior, and resize handle visibility
  - shell right rail node metadata edit/apply local behavior
  - shell right rail relationship metadata edit/apply/save
  - shell right rail editable branch properties from the active branch lens
  - shell AI draft review routing to the bottom tray instead of the right rail
- Maintained `frontend/tests/e2e/review-tray-regression.spec.js` coverage for:
  - shell review tray Sources path for generated source draft review before accept
  - shell review tray Issues path from the left-rail Health action
- Updated `frontend/playwright.config.js` so Playwright can use `PLAYWRIGHT_DEV_PORT` while preserving the default 5173 behavior.
- Verified current frontend build, shell store unit tests, review tray smoke, and Shell/Foundation smoke pass.

Not complete yet:

- `selection-shell-regression.spec.js` active coverage is green; the legacy major-panel overlap case remains deferred as `fixme`.
- Shift-click and shift-drag additive selection now have active shell regression coverage.
- Full major-panel overlap assertion remains as `test.fixme`; it should be converted into shell-slot visual coverage after migrated slots are fully populated.
- Review tray e2e coverage exists for Drafts, generated source draft review, validation Issues, and direct local-output review routes for Connections, Tasks, Checklist, Issues, and Sources.
- Left rail drag-resize still needs active browser automation once the handle interaction is stable; current coverage verifies collapse, event open, tab switch, and resize handle presence.
- Ribbon-mounted relationship/map controls need screenshot or e2e coverage after the command groups settle.

QA guidance:

- Treat the shell as an opt-in MVP. Test default legacy behavior and shell-flag behavior separately.
- Passing criteria for Shell/Foundation now include: build green, shell store unit tests green, and `shell-foundation-smoke.spec.js` green.
- Passing criteria for Properties Panel include the green right-rail subset of `selection-shell-regression.spec.js`; remaining source/branch-editing work is tracked separately.
- Do not block unrelated shell-slot work on the remaining legacy major-panel
  overlap `fixme`; shift additive selection/lasso now has active coverage.

Next steps for Agent 7:

1. Keep current shell checks as the green gate:
   - shell unit tests
   - build
   - shell-foundation-smoke
   - review-tray-regression
   - selection-shell-regression active coverage
2. Resolve or waive the remaining legacy major-panel overlap `fixme`; keep
   shift additive selection/lasso coverage active.
3. Add or adjust direct tray tests when new direct surfaces replace the remaining fallback compatibility host.
4. Keep source-left-rail coverage green now that shell-path source library opening is routed through `shellStore.leftPanel`.
5. Keep manual screenshot QA for relationship lens/ribbon layout until CSS stabilizes.

## Coordination Status

This section is the source of truth for agent handoffs. Do not treat a slot, panel, or tray as product-complete just because its state route or scaffold exists.

### Completed In This Pass

- Shell/Foundation scaffold exists behind `VITE_ENABLE_UI_SHELL_RIBBON` / `docmap.uiShellRibbon.enabled`.
  - Files: `frontend/src/shell/*`, `frontend/src/config/uiShellFeatureFlag.js`.
  - Status: scaffold only. Current behavior remains the default compatibility path.
- State/Panel Router safe shell-router slices are implemented through the slot-host extraction.
  - File: `frontend/src/stores/shellStore.js`.
  - File: `frontend/src/shell/WorkspaceShellAdapter.jsx`.
  - File: `frontend/src/shell/useWorkspaceShellRouter.js`.
  - File: `frontend/src/shell/ShellPropertiesPanelHost.jsx`.
  - File: `frontend/src/shell/ShellReviewTrayHost.jsx`.
  - File: `frontend/src/shell/useShellLayoutState.js`.
  - File: `frontend/src/shell/ShellOverlayHost.jsx`.
  - Tests: `frontend/tests/shellStore.test.mjs`.
  - Verified: `node --test frontend/tests/shellStore.test.mjs` passes and `npm run build` passes.
- `App.jsx` now mirrors a few safe legacy actions into shell state:
  - Node/edge selection opens `rightPanel`.
  - AI Helpers / Next Steps opens `rightPanel.kind === 'guide'` on the shell path.
  - AI draft review opens `bottomTray`.
  - Workspace dock tab open opens `leftPanel`.
  - Structured AI and empty-canvas Ask AI set ribbon tab/scope.
  - AI draft/source draft review and validation issues use typed shell-store route actions instead of ad hoc tray contexts.
  - Local-output review views now route through `shellStore.bottomTray` with `localOutputReview` context and direct `ShellReviewTrayHost` surfaces.
  - Source-library openers now route through `shellStore.leftPanel` on the shell path; `isSourcesOpen` remains legacy-only.
- LocalViews split work is partially present under `frontend/src/views/localViews/*`.
  - Status: extracted compatibility components are available, but full ribbon placement is not complete.
- Left Navigator first visible migration is implemented.
  - Files: `frontend/src/global-components/WorkspaceDock.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`, `frontend/src/shell/WorkspaceShell.jsx`.
  - Status: shell-flag path mounts WorkspaceDock in the left rail; default path remains FloatingDock compatibility.
  - Verified: `npm run build` from `frontend/` passes.
- Review Tray MVP plus Issues slice is implemented.
  - Files: `frontend/src/review/ReviewTray.jsx`, `frontend/src/shell/ShellReviewTrayHost.jsx`, `frontend/src/global-components/SourceDraftReviewPanel.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`.
  - Status: shell-flag path hosts AI draft sessions in `Drafts`, source draft review in `Sources`, workspace health validation in `Issues`, direct Connections review, direct task preview/checklist preview review, direct source repair review, and direct gaps/SME Issues review; accepted/canonical tasks remain in the structured canvas `Tasks` view; default path preserves legacy source draft floating panel.
  - Tests: `frontend/tests/e2e/review-tray-regression.spec.js`.
  - Coverage includes Drafts, generated source draft review, Health -> Issues, direct Connections, Tasks, Checklist, Issues, and Sources tray rendering, tab switching across Connections/Tasks/Issues/Sources, close behavior, and tray bounds with the left rail.
  - Verified: `npm run build` and `npx playwright test tests/e2e/review-tray-regression.spec.js` from `frontend/` pass.
- Properties rail MVP is implemented.
  - Files: `frontend/src/App.jsx`, `frontend/src/global-components/NodeInspector.jsx`, `frontend/src/shell/ShellRightPanel.jsx`, `frontend/src/shell/ShellPropertiesPanelHost.jsx`, `frontend/src/shell/BranchPropertiesPanel.jsx`, `frontend/src/index.css`.
  - Status: shell-flag path hosts selected node and edge metadata plus editable source/branch properties in the right rail; default path preserves the legacy metadata floating dock.
  - Tests: `frontend/tests/e2e/selection-shell-regression.spec.js` covers node, edge, branch, source properties, and AI draft tray separation.
  - Verified: `npx playwright test tests/e2e/selection-shell-regression.spec.js` and `npm run build` from `frontend/` pass.

### Not Complete Yet

- The shell store is currently a migration router, not the only UI renderer.
- `isSourcesOpen` remains for the default legacy source library path only.
- `isAiHelpersOpen` remains for the default legacy AI Helpers path only; shell-path helpers use `shellStore.rightPanel.kind === 'guide'`.
- `inspectorNodeId`, `inspectorEdgeId`, `activeAIDraftSession`, and `activeAIActionPreview` still drive live legacy surfaces.
- `NodeInspector` still hosts metadata and AI preview/draft content together for the legacy shell-off path; shell node properties pass `metadataOnly` and omit AI proposal/draft review plus action-creation controls.
- Bottom tray state and host exist; AI draft sessions, source draft review, and workspace health validation have routed tray hosts.
- Find connections, task preview, checklist preview, source repair, and gaps/SME Issues are directly mounted in the shell tray. Accepted/canonical tasks remain in the structured canvas `Tasks` view.
- Right rail state and host exist for node/edge metadata plus editable source/branch properties, with shell node metadata kept metadata-only. Richer source/branch semantics remain future work.
- WorkspaceDock is controlled and shell-mounted behind the flag, and the source library has a shell-left route. Deeper left-nav IA and source internals remain future work.
- QA should validate the current compatibility behavior and shell-store unit rules now. Full shell screenshots are now required before default-on because the primary visible shell slots have landed behind the feature flag.
- Full shell selection/review/foundation e2e coverage is green for active cases; one legacy major floating-panel overlap `fixme` remains skipped.

### Dependency Order For Next Agents

1. Agent 6 / Agent 2: identify any remaining fallback `OutputPanel` cases and remove the bridge only after every needed route has a direct controller.
2. Agent 3: keep ribbon entries thin and aligned to the direct tray controllers.
3. Agent 2: clean shell route authority around each direct controller as it lands.
4. Agent 7: add or update regression coverage.
5. After that, Agent 4/5 can tackle richer source library internals and source properties.

Do not flip the shell on by default yet. The shell is alive, but it still has compatibility plumbing underneath.

### State/Panel Router Handoff

Agent 2 can continue with narrow shell-router extraction, but should not move ownership of a product surface before that surface's visible host exists and has QA guidance. Completed in the latest slice:

- Extracted shell synchronization effects from `App.jsx` into `useWorkspaceShellRouter`.
- Moved shell wrapper/ribbon orchestration out of the App return branch through `WorkspaceShellAdapter`.
- Added authoritative `shellStore.bottomTray` route actions for local-output review tabs while preserving the compatibility host renderer.
- Added authoritative `shellStore.leftPanel` source-library routing for the shell path while preserving `isSourcesOpen` for the default legacy path.
- Added authoritative `shellStore.rightPanel.kind === 'guide'` routing for shell-path AI Helpers / Next Steps while preserving `isAiHelpersOpen` for the default legacy path.

The next safe State/Panel Router work is:

- Replace direct App cleanup calls with shell actions where the visible shell route is active.
- Add adapters from legacy inspector/draft/output-controller state into `rightPanel` and `bottomTray` renderers only as those renderers grow.
- Keep `isSourcesOpen` and `isAiHelpersOpen` legacy-only on the non-shell path.
- Keep all current legacy behavior intact until the shell flag path is visually verified.

## Goal

Replace the current collection of floating docks, overlapping popups, and panel-specific state with a controlled workspace shell that feels intentional, closer to a professional authoring tool such as Revit:

- Top ribbon for commands.
- Left workspace/navigation rail.
- Center canvas with minimal overlays.
- Right properties rail for selected node/edge/source metadata.
- Bottom review tray for AI drafts, connection candidates, validation issues, task candidates, and source repair.

The target mental model is:

```text
Sources -> Map -> AI proposals -> Review tray -> Accepted workspace -> Outputs
```

## Current Problem

The UI feels accidental because `frontend/src/App.jsx` currently acts as:

- Canvas renderer.
- Layout scheduler.
- Focus manager.
- Floating dock router.
- Selection coordinator.
- AI workflow launcher.
- Inspector host.

Several components also mix multiple responsibilities:

- `frontend/src/views/LocalViewsPanel.jsx`
  - Canvas ribbon.
  - View switcher.
  - Filter controls.
  - Output picker.
  - Follow-up action launcher.
  - Full output/review surfaces such as Find connections.
- `frontend/src/global-components/NodeInspector.jsx`
  - Node metadata editor.
  - AI preview host.
  - AI draft session host.
- `frontend/src/global-components/AiHelpersPanel.jsx`
  - AI command menu.
  - Next-step launcher.
  - Scope selector.
  - View router.
- `frontend/src/global-components/FloatingDock.jsx`
  - Presentation, persistence, drag behavior, and docking rules, but no global collision model.

## Target Layout

### Technical App Layout Model

Use Revit as a familiar spatial reference, not as a parity target. TraceSpace
should feel like a controlled technical workspace: commands above, navigation
beside the model, properties beside the selected object, lightweight context at
the bottom, and reviewable/generated work in a dedicated approval tray.

Slot grammar:

- Top ribbon: commands, modes, lens controls, view controls, and workflow
  launchers.
- Left workspace rail: workspace/source/outline/activity navigation.
- Center canvas: the readable map/model surface with only lightweight transient
  overlays.
- Right properties/guide rail: selected-object metadata plus lightweight guide
  surfaces.
- Bottom status bar: selection count, active scope, active lens/filter, source
  coverage state, and temporary view overrides.
- Bottom review tray: generated or reviewable work that requires accept/reject
  before mutating the accepted workspace.
- Overlay layer: short-lived menus, confirmations, and true modal flows.

Routing rule of thumb:

- If it edits or describes the selected object, route it to the right rail.
- If it navigates workspace content, route it to the left rail.
- If it reviews generated candidates before mutation, route it to the bottom
  review tray.
- If it changes canvas display, route it to the ribbon or bottom status bar.
- If it is only a short choice or confirmation, use a menu, popover, or modal.

Temporary view overrides should be explicit. Branch isolate, evidence coloring,
relationship labels, source coverage coloring, relationship candidate overlays,
and risk/evidence lenses should surface as visible temporary state instead of
feeling like accidental map changes.

### Top Ribbon

Persistent command area below the header.

Tabs:

- `Home`
- `Map`
- `AI`
- `Review`
- `Sources`
- `Outputs`

Suggested groups:

- Home: workspace status, add source, add node, ask AI, settings.
- Map: view mode, layout/reflow, scope, filters, branch colors, relationship lens.
- AI: scope selector, ask, find connections, create knowledge graph, create flowchart, generate tasks.
- Review: needs review, missing sources, confidence, validation, source repair, draft sessions.
- Sources: source library, upload/import, coverage, citations, reconcile/repair.
- Outputs: table, checklist, executive summary, Kanban, PDF/export, external handoff.

### Left Workspace Rail

Stable navigation, not a floating tool drawer.

Sections:

- Workspace/source list.
- Branch/outline tree.
- Saved views.
- Activity/history.
- Health summary.

### Center Canvas

The canvas should be visually quiet.

Allowed overlays:

- Selection action bar.
- Branch scope banner.
- AI progress toast.
- Empty canvas starter.
- Maybe small fit/minimap controls.

Avoid:

- Large workflow panels.
- Large Ask AI panels.
- Full output tables.
- Persistent relationship toolbars that collide with the ribbon.

### Right Properties Rail

One contextual place for "what is selected."

Modes:

- Node properties.
- Edge/relationship properties.
- Branch properties.
- Source reference details.
- AI draft impact summary for selected item.

Existing components to migrate here:

- `NodeInspector`
- `EdgeInspector`
- selected source metadata

### Bottom Status Bar

One lightweight strip for "what mode am I in?"

This is not the Review Tray. It should stay compact and explain active context:

- Selection count and selected scope.
- Active branch or isolated branch state.
- Active map view, lens, and relationship label state.
- Source/evidence/risk coloring state.
- Confidence/source coverage summary.
- Temporary override chips with clear actions.

Examples:

- `3 selected`
- `Branch isolate: Sandbox execution plan`
- `Lens: Structure Only`
- `Relationship labels visible`
- `Evidence coloring active`
- `19/20 sourced`
- `3 review candidates pending`

Temporary overrides should be easy to clear from this strip without opening a
large form. The status bar can also expose compact view-filter menus when the
full ribbon would be too far away.

### Bottom Review Tray

One place where unresolved generated work waits for approval.

Tabs:

- Drafts
- Connections
- Issues
- Tasks
- Sources
- Activity

Existing surfaces to migrate here:

- `SourceDraftReviewPanel`
- `AiDraftSessionPanel`
- Find connections candidate review
- task/checklist previews
- source repair previews
- validation issue review

## Core Interaction Rules

1. Opening a node selects it and shows right properties. It should not open a floating popup.
2. Opening an edge shows right relationship properties.
3. Selecting multiple nodes shows lightweight selection commands in the ribbon or small canvas bar.
4. AI actions always use explicit scope: workspace, branch, selected nodes, selected source, or filtered view.
5. AI proposals go to the bottom review tray first. They do not silently mutate the canvas.
6. "Find connections" proposes relationship candidates and never rewrites hierarchy directly.
7. Map lens and relationship filters live in the ribbon, not as a floating top panel.
8. Outputs are downstream of accepted workspace state and should warn when source/review confidence is weak.

## Proposed Shell State

Add a shell/layout state separate from graph data.

```js
{
  ribbon: {
    activeTab: 'home' | 'map' | 'ai' | 'review' | 'sources' | 'outputs',
    context: object | null
  },
  leftPanel: {
    kind: 'workspace' | 'sources' | 'outline' | 'activity' | 'health' | 'build',
    tab?: string,
    id?: string | null,
    collapsed?: boolean,
    width?: number | null
  } | null,
  rightPanel: {
    kind: 'node' | 'edge' | 'branch' | 'source' | 'guide' | null,
    id: string | null
  },
  statusBar: {
    selectionCount?: number,
    activeLens?: string | null,
    activeScopeLabel?: string | null,
    temporaryOverrides?: Array<{
      id: string,
      label: string,
      clearable?: boolean
    }>
  },
  bottomTray: {
    kind: 'drafts' | 'connections' | 'issues' | 'tasks' | 'sources' | 'activity',
    id?: string | null,
    context?: object | null
  } | null,
  overlay: {
    kind: 'modal' | 'popover' | null,
    id: string | null,
    anchorId?: string | null
  },
  activeScope: {
    type: 'workspace' | 'branch' | 'nodes' | 'source' | 'filtered',
    nodeId?: string,
    nodeIds?: string[],
    sourceId?: string
  }
}
```

The existing graph state should stay in `frontend/src/stores/store.js` at first. The shell state can live in a new `frontend/src/stores/shellStore.js` or a small extension to the existing workspace panel store.

Current implementation: `frontend/src/stores/shellStore.js` exists and should remain separate from graph data until the flagged shell path is stable.

## Architecture Plan

### Phase 0: Stabilize Current UI

Purpose: stop adding one-off panel exceptions.

Tasks:

- Document all current floating surfaces.
- Keep the current build green.
- Avoid adding new floating panels unless they are temporary compatibility wrappers.

Exit criteria:

- This roadmap exists and is used for follow-up work.
- No new workflow is added as an unmanaged dock.

### Phase 1: Add Shell Skeleton Behind Existing UI

Purpose: create layout slots without moving behavior yet.

Create:

- `frontend/src/shell/WorkspaceShell.jsx`
- `frontend/src/shell/ShellRibbon.jsx`
- `frontend/src/shell/ShellLeftRail.jsx`
- `frontend/src/shell/ShellRightPanel.jsx`
- `frontend/src/shell/ShellBottomTray.jsx`
- `frontend/src/stores/shellStore.js`

Implementation notes:

- The shell should accept slot props such as `ribbon`, `leftPanel`, `rightPanel`, `bottomTray`, and `canvas`.
- Initially render current `ReactFlow` and current panels exactly as before.
- Add CSS layout tokens for fixed shell dimensions.
- Keep `FloatingDock` operational during this phase.

Exit criteria:

- App still behaves as before.
- Shell layout components exist and can host content.
- `npm run build` passes.

Suggested owner: Shell/Foundation Agent.

### Phase 2: Centralize Layout State

Status: safe slices complete for shell-path source routing, right-panel metadata, AI Helpers / Next Steps guide routing, local-output review tray routing, ribbon tab, and active scope. This phase is not fully complete because legacy booleans and graph-store inspector state still support the default non-shell layout.

Purpose: remove scattered local booleans from `App.jsx`.

Move or adapt:

- `isSourcesOpen`
- `isAiHelpersOpen` for the default legacy path only
- inspector open state
- active workspace dock tab
- bottom review tray open state

Implementation notes:

- Keep graph data state where it is.
- Add helper actions such as:
  - `openRightPanel({ kind, id })`
  - `closeRightPanel()`
  - `openBottomTray(kind)`
  - `setRibbonTab(tab)`
  - `setActiveScope(scope)`
- Preserve existing store setters during transition.

Exit criteria:

- Opening one panel does not require scattered manual cleanup calls in random event handlers.
- The current UI still functions.
- Build passes.

Current exit status:

- Build passes.
- Shell panel exclusivity is covered by `frontend/tests/shellStore.test.mjs`.
- Full cleanup of scattered App calls is deferred until the visible shell slots are mounted by the relevant lanes.

Suggested owner: State/Panel Router Agent.

### Phase 3: Convert WorkspaceDock To Left Rail

Status: first pass complete behind the shell flag. WorkspaceDock is controlled and shell-mounted when `VITE_ENABLE_UI_SHELL_RIBBON` / `docmap.uiShellRibbon.enabled` is enabled. The default non-shell path still uses `FloatingDock` for compatibility.

Purpose: make the first visible layout improvement with low risk.

Change:

- `frontend/src/global-components/WorkspaceDock.jsx`

Make it controlled:

- `activeTab`
- `onActiveTabChange`
- `collapsed`
- `onCollapsedChange`
- `width`
- `onWidthChange`

Keep temporarily:

- `WORKSPACE_DOCK_OPEN_TAB_EVENT`

Move:

- Workspace tools dock from floating dock to shell left rail.

Exit criteria:

- Sources, Health, Guide, Build live in a stable left panel: complete behind the shell flag.
- No floating left workspace dock by default: complete only in the shell-flag path; intentionally not changed for the default compatibility path.
- Existing open-tab events still work: complete.
- Build passes: complete from `frontend/`.

Remaining work:

- Tab/collapse/width ownership has moved into `shellStore.leftPanel` for this first slice.
- Shell-flag QA coverage exists for tab switching, collapse/expand, fixed left-rail placement, resize handle availability, and event-driven tab open.
- Browser-level synthetic resize drag assertion is deferred because Playwright did not reliably trigger the pointer resize path; store-level width mutation is covered by `shellStore.test.mjs`.
- WorkspaceDock internals are split into dedicated tab components; deeper navigator IA is still pending product/QA feedback.

Suggested owner: Left Rail Agent.

### Phase 4: Split LocalViewsPanel

Purpose: separate compact ribbon controls from large output/workflow surfaces.

Current file:

- `frontend/src/views/LocalViewsPanel.jsx`

Create:

- `frontend/src/ribbon/CanvasRibbon.jsx` - created as a shell-facing export point.
- `frontend/src/views/localViews/MapControls.jsx` - created.
- `frontend/src/views/localViews/OutputWorkflowControls.jsx` - created.
- `frontend/src/views/localViews/FollowUpActionsBar.jsx` - created.
- `frontend/src/views/localViews/FilterControls.jsx` - created.
- `frontend/src/views/localViews/ReviewExplanationContent.jsx` - created.
- `frontend/src/views/OutputPanel.jsx` - created as a compatibility host for non-canvas output/review surfaces.

Move:

- Canvas view controls to top ribbon: complete behind the shell feature flag on the Map tab.
- Output workflow content to bottom tray or accepted output surfaces depending on type: direct review tray routes are complete for migrated preview/review workflows; accepted output routes have first shell command surfaces.
- Find connections setup to AI ribbon: complete for the shell path.
- Accepted/proposed relationship review to bottom tray: complete for the direct Connections tray route.

Exit criteria:

- `LocalViewsPanel` is reduced to a compatibility wrapper or removed: partially complete. It delegates controls and output rendering, but still owns derived state, menu state, and acceptance actions.
- Canvas controls do not render as a floating dock: complete behind the shell feature flag. Legacy floating dock remains when the shell flag is off.
- Large output surfaces no longer occupy the top lane in the shell path for the migrated review workflows; accepted output surfaces still need visual QA and product polish.
- Build passes: complete for the current extraction (`npm run build` from `frontend/`).

Suggested owner: Ribbon/LocalViews Agent.

### Phase 5: Move Properties To Right Rail

Purpose: make metadata predictable.

Status: shell path complete for current metadata ownership. Node and edge metadata plus editable source/branch details are in the shell right rail behind the feature flag; shell node metadata omits AI review/proposal controls via `metadataOnly`. Richer source/branch fields remain.

Migrate:

- `NodeInspector` - complete for metadata mode behind shell flag.
- `EdgeInspector` - complete behind shell flag.
- selected branch details - editable MVP complete behind shell flag; richer branch governance fields not started.
- selected source details - editable MVP complete behind shell flag; richer source governance fields not started.

Implementation notes:

- Keep mutation logic inside current inspectors initially: complete.
- Remove draggable/floating dock wrapper for metadata by default: complete only in shell-flag path; default compatibility still uses `FloatingDock`.
- Use shell right panel sizing: complete for node/edge rail with `--workspace-shell-right-width`.
- Add empty state: scaffold exists in `ShellRightPanel`; App currently mounts the right panel only when a node or edge is selected/open.
- Keep AI proposal/review content out of the right rail: complete for the shell path via `NodeInspector metadataOnly`.

Exit criteria:

- Node click/open opens right rail: complete behind shell flag for the existing inspector route.
- Edge click/open opens right rail: complete behind shell flag.
- No metadata drawer floats over the canvas by default: not globally complete; shell-flag path is complete, default compatibility path intentionally still floats.
- Build passes: complete from `frontend/`.

Suggested owner: Properties Panel Agent.

### Phase 6: Create Bottom Review Tray

Status: MVP plus direct local-output review surfaces complete behind the shell flag on 2026-05-19. The tray hosts currently support AI draft session review, source draft review, workspace health validation review, direct Connections review, direct task preview/checklist preview review, direct source repair review, and direct gaps/SME Issues review. Accepted/canonical tasks remain in the structured canvas `Tasks` view. The fallback local-output compatibility bridge has been removed.

Purpose: centralize generated/reviewable work.

Create:

- `frontend/src/review/ReviewTray.jsx` - complete.
- `frontend/src/shell/ShellReviewTrayHost.jsx` - complete for routed draft/source/validation hosts and direct local-output review hosts.
- `frontend/src/shell/ShellLocalOutputReviewTrayHost.jsx` - removed after direct review surfaces covered the shell routes.
- `frontend/src/review/DraftsTab.jsx` - deferred until draft UI needs more than the existing `AiDraftSessionPanel` host.
- `frontend/src/review/useConnectionsReviewController.js` - complete for the first direct Connections tray slice.
- `frontend/src/review/ConnectionsTab.jsx` - deferred; `ShellReviewTrayHost` currently mounts `ConnectionsReviewSurface` directly.
- `frontend/src/review/IssuesTab.jsx` - deferred; first issues workflow is hosted directly through `GraphValidationPanel`.
- `frontend/src/review/useTasksReviewController.js` - complete for direct task preview and checklist controller props.
- `frontend/src/review/TasksTab.jsx` - deferred; `ShellReviewTrayHost` currently mounts `TasksReviewSurface` / `ChecklistPreview` directly for task routes.
- `frontend/src/review/useSourcesReviewController.js` - complete for direct source repair / coverage review.
- `frontend/src/review/SourcesTab.jsx` - deferred; source draft is hosted directly and `ShellReviewTrayHost` currently mounts `SourcesReviewSurface` directly for source repair routes.
- `frontend/src/review/IssuesReviewSurface.jsx` - complete for direct gaps / SME Issues review.
- `frontend/src/review/useIssuesReviewController.js` - complete for direct gaps / SME Issues review.

Migrate:

- `SourceDraftReviewPanel` - first slice complete behind the shell flag; legacy floating path remains when the shell flag is off.
- `AiDraftSessionPanel` - placement route complete through the `Drafts` tab; internal behavior unchanged.
- connection candidate review - directly hosted in the tray through `ShellReviewTrayHost` and `useConnectionsReviewController`.
- task preview / checklist preview - directly hosted in the tray through `ShellReviewTrayHost` and `useTasksReviewController`; accepted/canonical tasks remain in the structured canvas `Tasks` view.
- source repair previews - directly hosted in the tray through `ShellReviewTrayHost` and `useSourcesReviewController`.
- gaps / SME issues - directly hosted in the tray through `ShellReviewTrayHost` and `useIssuesReviewController`.
- validation issue lists - first slice complete through `GraphValidationPanel` in the `Issues` tab.

Exit criteria:

- AI outputs appear in the review tray first: complete for shell-routed AI draft sessions, source draft review, direct Connections review, task preview/checklist review, source repair review, and Issues review.
- Accept/reject/review actions are consolidated: partially complete for hosted draft flows and validation review.
- Canvas remains visible while reviewing: complete for the shell-flag tray path.
- Build passes: complete from `frontend/`.

Suggested owner: Review Tray Agent.

### Phase 7: Add Bottom Status Bar And Temporary View Overrides

Status: first MVP complete behind the shell flag. `ShellStatusBar` renders as a
dedicated shell slot, separate from the bottom Review Tray, and currently shows
view, selection, source coverage, review count, branch focus, graph filters, and
relationship-lens temporary overrides.

Purpose: make map context and temporary display state visible without opening
more panels.

Create:

- `frontend/src/shell/ShellStatusBar.jsx` - complete.
- status-bar shell slot in `WorkspaceShell` / `WorkspaceShellAdapter` - complete.
- status derivation helper for selection count, active branch/scope, active
  lens, relationship labels, filter chips, and source/evidence coloring -
  first pass complete in `App.jsx`.

Route here:

- Selection count and multi-select scope.
- Active branch isolate/focus.
- Active graph filters and relationship lens.
- Relationship labels on/off.
- Source coverage / evidence coloring / risk coloring state.
- Pending review candidate count as a compact indicator.
- Clear temporary override actions.

Do not route here:

- Accept/reject review flows.
- Metadata editing.
- Long AI forms.
- Full filter configuration panels.
- Export/output previews.

Exit criteria:

- Shell flag path shows a compact bottom status strip when there is meaningful
  selection, scope, lens, filter, or temporary override state: complete for the
  MVP set.
- Clearing a temporary override from the status bar updates the same state as
  the corresponding ribbon/map control: complete for branch focus, filters, and
  relationship lenses.
- The bottom status bar and bottom Review Tray do not visually fight each other;
  the tray may sit above or replace the status strip while active, but the user
  should not see two unrelated bottom command systems: first pass covered by
  review tray and shell smoke tests.
- Build passes and shell screenshot coverage proves the status bar does not
  overlap left/right rails or the ribbon: build and shell smoke pass; broader
  screenshot QA remains useful before default rollout.

Suggested owner: Shell/Foundation + Ribbon/LocalViews Agent.

### Phase 8: Retire FloatingDock As Primary Layout

Purpose: remove the accidental overlap system.

Keep `FloatingDock` only for optional temporary/power-user tools, or remove it if no longer needed.

Clean up:

- `frontend/src/global-components/FloatingDock.jsx`
- floating dock persistence in `frontend/src/config/localSettings.js`
- `.floating-dock*` CSS in `frontend/src/index.css`
- one-off collision rules in `App.jsx`

Exit criteria:

- Primary layout is shell-owned.
- Floating docks are not used for navigation, review, metadata, or AI workflows.
- Build passes.

Suggested owner: Cleanup Agent.

## Agent Responsibility Lanes

### Shell/Foundation Agent

Owns:

- New shell components.
- Layout CSS variables.
- Feature flag or compatibility wrapper.

Files:

- `frontend/src/shell/*`
- `frontend/src/index.css`
- `frontend/src/App.jsx`

Definition of done:

- Shell renders without changing core behavior.
- Slots are ready for later migration.

### State/Panel Router Agent

Owns:

- `shellStore`.
- Panel exclusivity.
- Scope state.
- Replacing scattered `setIsAiHelpersOpen`, `setInspectorNodeId`, and `setInspectorEdgeId` cleanup patterns.

Files:

- `frontend/src/stores/shellStore.js`
- `frontend/src/App.jsx`
- possibly `frontend/src/stores/store.js`

Definition of done:

- One declarative panel router controls right panel and bottom tray.

### Ribbon Agent

Owns:

- Top ribbon.
- Ribbon tabs/groups.
- Map lens and relationship filters.
- AI command entry points.

Files:

- `frontend/src/ribbon/*`
- `frontend/src/views/LocalViewsPanel.jsx`
- `frontend/src/App.jsx`

Definition of done:

- Canvas commands are fixed in the top ribbon, not in floating docks.

### Left Rail Agent

Owns:

- Workspace navigation rail.
- Sources/outline/activity/health grouping.
- Controlled `WorkspaceDock`.

Files:

- `frontend/src/global-components/WorkspaceDock.jsx`
- `frontend/src/shell/ShellLeftRail.jsx`
- `frontend/src/index.css`

Definition of done:

- Workspace tools are stable on the left by default.

### Properties Panel Agent

Owns:

- Right rail.
- Node metadata.
- Edge metadata.
- Source/branch details.

Files:

- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/global-components/EdgeInspector.jsx`
- `frontend/src/shell/ShellRightPanel.jsx`
- `frontend/src/index.css`

Definition of done:

- Selection details never appear as uncontrolled canvas popups.

### Review Tray Agent

Status: MVP plus Issues slice complete; lane remains active for staged workflow migration.

Owns:

- Bottom tray.
- AI draft review.
- Connection candidates.
- Source repair.
- Validation issues.
- Task/checklist candidates.

Files:

- `frontend/src/review/*`
- `frontend/src/global-components/AiDraftSessionPanel.jsx`
- `frontend/src/global-components/SourceDraftReviewPanel.jsx`
- `frontend/src/views/LocalViewsPanel.jsx`

Definition of done:

- Reviewable work has one home.

Current status:

- First home exists as `frontend/src/review/ReviewTray.jsx`.
- AI draft sessions, source draft review, and workspace health validation are hosted there behind the shell feature flag.
- Other reviewable work is intentionally still in legacy locations until its owning workflow is split.

### CSS/Layout Systems Agent

Owns:

- Layout tokens.
- Z-index tokens.
- Responsive behavior.
- Removing one-off floating panel CSS.

Files:

- `frontend/src/index.css`
- optionally new CSS modules if the project adopts them later.

Definition of done:

- Shell surfaces do not overlap.
- Mobile/narrow layouts degrade predictably.

### QA/Regression Agent

Owns:

- Playwright/e2e coverage.
- Smoke test scenarios.
- Visual regression screenshots.

Suggested scenarios:

- Upload source and accept draft.
- Switch map/knowledge graph/flowchart/table views.
- Select node and edit metadata.
- Select edge and edit relationship metadata.
- Run Find connections and review results.
- Open source repair.
- Generate task preview.
- Accept/reject AI draft.

Files:

- `frontend/tests/e2e/*`
- `frontend/test-results`

Definition of done:

- Each phase has at least one regression check.

## Suggested Work Packages

### Work Package 1: Shell Skeleton

Agent: Shell/Foundation Agent

Scope:

- Add shell components and CSS.
- Wrap current app content without moving behavior.

Deliverables:

- `WorkspaceShell.jsx`
- basic shell CSS
- build passes

### Work Package 2: Layout State Store

Agent: State/Panel Router Agent

Status: third safe slice complete on 2026-05-19.

Scope:

- Add `shellStore`.
- Implement panel open/close actions.
- Wire only one low-risk path first, such as right panel open/close, while leaving legacy state intact.
- Extract shell wrapper/ribbon orchestration out of the App return branch while leaving React Flow and legacy fallback behavior intact.
- Extract shell right-panel, review-tray, overlay, and workspace navigator hosts out of `App.jsx`.

Deliverables:

- `shellStore.js`
- documented shell state shape
- build passes
- shell adapter for feature-flagged wrapper/slot orchestration
- shell hosts for properties, review tray, overlay, and workspace navigation rendering

Completed deliverables:

- `frontend/src/stores/shellStore.js`
- `frontend/tests/shellStore.test.mjs`
- Safe `App.jsx` mirroring for right panel, bottom tray, left panel, ribbon tab, and active scope.
- `frontend/src/shell/WorkspaceShellAdapter.jsx`
- `frontend/src/shell/useWorkspaceShellRouter.js`
- `frontend/src/shell/ShellPropertiesPanelHost.jsx`
- `frontend/src/shell/ShellReviewTrayHost.jsx`
- `frontend/src/shell/useShellLayoutState.js`
- `frontend/src/shell/ShellOverlayHost.jsx`
- `frontend/src/shell/ShellWorkspaceNavigatorHost.jsx`
- Typed review tray actions in `shellStore`: `openDraftReviewTray`, `openSourceDraftReviewTray`, and `openValidationIssuesTray`.

Deferred deliverables:

- Removing `isSourcesOpen` / legacy-only `isAiHelpersOpen` from `App.jsx` after the default shell rollout.
- Making shell state the only renderer for inspector and review surfaces.
- Migrating AI preview/draft rendering out of `NodeInspector`.

Dependencies before more work:

- Right-panel authority work depends on Properties Panel source/branch routes.
- Bottom-tray authority work depends on Review Tray migrating the next real workflow.
- `isSourcesOpen` removal depends on Left Rail ownership; `isAiHelpersOpen` removal depends on retiring the default legacy layout.

### Work Package 3: Controlled WorkspaceDock

Agent: Left Rail Agent

Status: complete on 2026-05-19.

Scope:

- Add controlled props to `WorkspaceDock`.
- Keep fallback internal state.
- Keep event bridge.

Deliverables:

- controlled `WorkspaceDock`: complete.
- no behavior regression: compatibility path preserved; shell path uses the same component.
- build passes: complete from `frontend/`.
- targeted shell left-rail Playwright coverage: complete for placement, tab switching, collapse/expand, event-open, and resize handle visibility.

Files changed:

- `frontend/src/global-components/WorkspaceDock.jsx`
- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `frontend/tests/e2e/selection-shell-regression.spec.js`
- `frontend/src/shell/WorkspaceShell.jsx`

Notes for QA:

- Check both shell-flag-on and shell-flag-off behavior.
- The shell flag is `VITE_ENABLE_UI_SHELL_RIBBON` or localStorage `docmap.uiShellRibbon.enabled`.
- Do not check for left-nav redesign yet; this work package is about controlled behavior and placement.

### Work Package 4: First Visible Shell Migration

Agent: Shell/Foundation Agent + Left Rail Agent

Status: complete for the left navigator MVP on 2026-05-19; further shell visual polish remains owned by Shell/Foundation/CSS.

Scope:

- Render `WorkspaceDock` in shell left rail.
- Remove default floating workspace dock.

Deliverables:

- stable left rail: complete behind the shell flag for WorkspaceDock.
- shell foundation smoke: complete and passing through `frontend/tests/e2e/shell-foundation-smoke.spec.js`.
- build passes: complete from `frontend/`.
- manual product screenshots: still pending QA/manual verification.

Remaining dependent work:

- CSS/Layout Systems should turn the first-pass narrow viewport behavior into product-final responsive UX and verify z-index interactions with the ribbon/right panel/bottom tray.
- State/Panel Router has moved the controlled left-panel route into `shellStore`; remaining work is cleanup of shell-off compatibility callers after default rollout.
- QA should add or run the shell-flag smoke checklist before other agents assume the left rail is product-complete.

### Work Package 5: Ribbon Extraction

Agent: Ribbon Agent

Status: partially complete. Control extraction, shell Map tab placement, and first Home/Sources/AI/Review/Outputs command groups are done behind the shell flag. Outputs accepted/execution/preview/handoff grouping has a first implementation and needs expanded route QA.

Scope:

- Extract compact canvas controls from `LocalViewsPanel`: complete.
- Place them in top ribbon: complete behind the shell feature flag on the Map tab.

Deliverables:

- `CanvasRibbon`: complete as `frontend/src/ribbon/CanvasRibbon.jsx` export point.
- Map tab controls: extracted in `frontend/src/views/localViews/MapControls.jsx` and mounted in `ShellRibbon` when the Map tab is active.
- Build passes: complete from `frontend/`.

Blocking/dependent work:

- State/Panel Router must confirm richer tab/context ownership before non-Map tabs become product-final command surfaces.
- QA can verify shell Map tab rendering and first Home/Sources/Outputs command groups behind the shell flag, but should not treat missing final command density as a shell foundation failure yet.

### Work Package 6: Output Surface Migration

Agent: Ribbon Agent + Review Tray Agent

Status: partially complete behind the shell flag. Find connections has an AI ribbon command and a direct Connections tray surface. Task/checklist/source/issues previews are direct tray routes. Accepted output, execution projection, preview, and handoff shell command groups now exist for the first pass.

Scope:

- Move `Find connections` workflow from `LocalViewsPanel` to AI ribbon + review tray: complete for the shell-flag path.
- Current prep: non-canvas review surfaces have direct tray surfaces for Connections, Tasks Preview, Checklist Preview, Sources, and Issues. Accepted/output surfaces route through shell output view commands where implemented. `OutputPanel` remains for legacy/full-panel compatibility and any unrouted output cases.

Deliverables:

- AI ribbon command for Find connections: complete behind the shell flag.
- Connections review surface: complete through `ConnectionsReviewSurface` mounted by `ShellReviewTrayHost`.
- Accepted table/executive and handoff status/implementation shell routes: first pass complete.
- Accepted/execution/preview/handoff Outputs grouping for Flowchart, Tasks,
  Kanban, Checklist Preview, Implementation, and Status: first pass complete;
  expanded route QA remains.
- Build passes: complete from `frontend/`.

Dependencies:

- Ribbon/LocalViews should continue removing duplicate compatibility entry points only after direct routes are verified in QA.
- Review Tray should preserve candidate acceptance behavior while tab labels, empty states, and close behavior are polished.
- QA can check the shell-flag Connections tray route through `review-tray-regression.spec.js`; do not require default-shell behavior yet.

### Work Package 7: Properties Rail

Agent: Properties Panel Agent

Status: shell path complete for current metadata ownership on 2026-05-19. Node/edge properties rail is implemented behind the shell flag, and node metadata stays metadata-only there; broader default-rollout cleanup remains.

Scope:

- Move node/edge metadata from floating dock into right rail: complete behind `VITE_ENABLE_UI_SHELL_RIBBON` / `docmap.uiShellRibbon.enabled`.
- Keep default compatibility behavior unchanged when the shell flag is off: complete.
- Keep AI proposal/review workflows out of the right properties rail: complete for the shell path via `NodeInspector metadataOnly`.

Deliverables:

- persistent properties rail: complete behind shell flag.
- node/edge details: complete behind shell flag using existing `NodeInspector` and `EdgeInspector`.
- build passes: complete from `frontend/`.

Files changed:

- `frontend/src/App.jsx`
- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/index.css`

Blocking/dependent work:

- `shellStore.rightPanel` is authoritative for shell-path node, edge, source, branch, and guide routes; later cleanup can remove legacy inspector-id compatibility after the default/floating path is retired.
- Review Tray owns shell-path AI draft/session/proposal review. `NodeInspector` can only be simplified into pure metadata globally after the shell-off legacy path is retired.
- Source-library ownership and save semantics must be defined before source properties move beyond focused library metadata fields.
- Ribbon/LocalViews must settle branch lens/branch selection interactions before branch properties move beyond the explicit branch-root metadata action.
- CSS/Layout Systems and QA should verify right-rail scrolling, width, and narrow viewport behavior before the shell flag becomes default.

Notes for QA:

- Check both shell-flag-on and shell-flag-off behavior.
- With the shell flag on, verify node metadata local apply and edge relationship save/apply in the fixed right rail.
- With the shell flag off, verify the existing floating metadata inspector behavior still works.
- Do not check richer source governance metadata, richer branch governance fields, or AI draft review as complete under this work package.
- Latest command: `npx playwright test tests/e2e/selection-shell-regression.spec.js`.
- Current result is green for active coverage: node metadata, edge metadata, branch properties, source properties, AI draft tray separation, shell mount, left navigator, branch lens coverage, and shift additive selection/lasso pass; the legacy major-panel overlap `fixme` remains skipped.

### Work Package 8: Review Tray MVP

Agent: Review Tray Agent

Status: MVP plus Issues slice complete on 2026-05-19; follow-up workflow migrations remain.

Scope:

- Add bottom tray shell: complete as `frontend/src/review/ReviewTray.jsx`.
- Host AI draft session and source draft review there: complete behind the shell flag.
- Host validation issues there: complete behind the shell flag through the left-rail Health action.

Deliverables:

- review tray with Drafts tab: complete.
- review tray with Sources tab source draft review host: complete.
- review tray with Issues tab workspace health host: complete.
- build passes: complete from `frontend/`.

Files changed:

- `frontend/src/review/ReviewTray.jsx`
- `frontend/src/global-components/SourceDraftReviewPanel.jsx`
- `frontend/src/global-components/WorkspaceDock.jsx`
- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `frontend/tests/e2e/review-tray-regression.spec.js`

Ready for QA:

- Shell flag on: AI draft session appears in `Drafts`; source draft review appears in `Sources`; workspace health validation appears in `Issues`; canvas remains visible; accept/cancel/dismiss preserve existing behavior.
- Shell flag off: source draft review remains in the legacy floating panel.

Ready for QA:

- Connections tab behavior.
- Tasks and checklist behavior.
- Source repair / source coverage tray behavior.
- Gaps / SME Issues behavior.

Next Review Tray work:

1. Keep AI draft, source draft, validation issue, Connections, Tasks, Checklist, Issues, and Sources tray tests green.
2. Do not add a tray-only accepted-task route; keep accepted/canonical `tasks` in the structured canvas `Tasks` view.
3. Coordinate with Ribbon/LocalViews before removing legacy/full-panel output paths that still depend on `OutputPanel`.
4. Polish tab-change behavior and labels now that the direct tray routes are the only shell path.

## Risks And Mitigations

### Risk: Breaking Graph Selection

Cause:

- App shell focus targets may interfere with React Flow events and keyboard handling.

Mitigation:

- Keep React Flow event handlers in `App.jsx` until shell is stable.
- Add regression tests for click, shift-click, shift-drag, delete, and metadata open.

### Risk: Breaking AI Draft Acceptance

Cause:

- AI previews are still hosted through `NodeInspector` and `AiHelpersPanel` in legacy/compatibility paths; shell node properties suppress those controls.

Mitigation:

- Move display location before changing acceptance logic.
- Keep `AiDraftSessionPanel` API unchanged during first migration.

### Risk: Popover Click-Away Bugs

Cause:

- `LocalViewsPanel` uses multiple anchored popovers and click-away refs.

Mitigation:

- Split popovers only after controls are extracted.
- Use a shared overlay layer later.

### Risk: Too Much Refactor At Once

Cause:

- Layout, state, and component extraction are intertwined.

Mitigation:

- Migrate one slot at a time.
- Keep build green at every phase.
- Preserve old components behind compatibility wrappers.

## Acceptance Criteria

The refactor is successful when:

- There is one obvious place for commands: the ribbon.
- There is one obvious place for navigation: the left rail.
- There is one obvious place for selected item details: the right rail.
- There is one obvious place for pending generated work: the bottom tray.
- The canvas is no longer crowded by workflow panels.
- Opening one major surface does not require manually hiding several others.
- Floating docks are no longer used as primary navigation.
- The app still supports source upload, AI draft review, node/edge editing, relationship review, and structured outputs.

## Near-Term Recommendation

Start with Work Package 1 and Work Package 3:

1. Add the shell skeleton.
2. Make `WorkspaceDock` controlled.
3. Move workspace tools into a fixed left rail behind a small compatibility switch.

This gives the app a visible improvement and creates the architectural path for the rest without destabilizing graph logic.
