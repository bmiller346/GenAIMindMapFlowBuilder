# UI Shell And Ribbon Regression Checklist

Last updated: 2026-05-20

Use this checklist while validating the default shell path and the explicit
legacy rollback path controlled by `VITE_ENABLE_UI_SHELL_RIBBON=false` or
`docmap.uiShellRibbon.enabled=false` / `legacy`.

## Automated Coverage

- `frontend/tests/e2e/selection-shell-regression.spec.js`
  - shift-click additive selection and shift-drag/lasso additive selection
  - quick Ask AI request scope and result display
  - branch scope highlighting
  - selected node highlighting from seeded selected-node state
  - mind map relationship lens visibility
  - shell-flag ribbon, left navigator, and canvas slot smoke coverage
  - shell left navigator tab switching, collapse, event-driven open-tab behavior, and resize handle visibility
  - shell AI Helpers opens in the right rail instead of a React Flow canvas overlay
  - shell review tray Drafts path from tracked AI draft session review
  - shell right rail node metadata edit/apply local behavior
  - shell right rail node metadata omits AI proposal/draft accept/reject and action-creation controls
  - shell right rail relationship metadata edit/apply/save
  - shell right rail branch and source properties editing routes
  - placeholder for legacy major floating panel overlap
- `frontend/tests/e2e/review-tray-regression.spec.js`
  - shell review tray Sources path for generated source draft review before accept
  - shell review tray Issues path from the left-rail Health action
  - direct shell review tray routes for Connections, Tasks preview, Checklist, Sources/source repair, and Issues without the old local output bridge
  - source draft accept applies the generated graph and source library
  - shell slot bounding-box coverage for ribbon, left rail, right rail, review tray, and status bar at desktop and narrow widths
- `frontend/tests/shellStore.test.mjs`
  - right panel and bottom tray exclusivity
  - workspace navigator state
  - active ribbon tab state
  - overlay close/clear behavior
  - shell scope normalization
- Existing AI workflow Playwright specs in `frontend/tests/e2e/node-ai-actions-regression.spec.js`
  - preview-first Ask AI flows
  - draft accept/discard behavior
  - selected source and selected node scopes

## Manual Screenshot Pass

Run once with the default shell enabled, then once with the shell disabled via
the explicit rollback flag.

1. Open a saved workspace with at least three nodes, two relationship types, and one source.
2. Verify shift-click adds selected nodes without clearing the previous selection.
3. Verify shift-drag lasso adds to the selection when Shift is held.
4. Verify selected nodes remain visibly highlighted after panning, zooming, and opening panels.
5. Focus a branch and confirm in-scope, branch-root, and out-of-scope highlighting remain distinct.
6. Toggle relationship lenses and labels, then confirm semantic relationships do not collide with the ribbon or branch scope banner.
7. Edit node metadata, apply/save, close the surface, reopen it, and confirm the edits persist.
8. Edit edge relationship type, confidence, and rationale, then confirm the saved graph snapshot changes only that edge.
9. Use quick Ask AI on multiple selected nodes and confirm it stays lightweight, scoped to selected nodes, and does not open the review tray.
10. Start Find connections and confirm candidates are previewed for review before any accepted graph change.
11. Start a workspace Ask AI draft and confirm the preview/draft surface appears before accepted workspace mutation.
12. Confirm no two major surfaces overlap: left navigator, right properties, bottom review tray, AI helper, relationship lens, source review, and output workflow panel.

## Shell-Specific Checks

- Top ribbon remains visible and does not hide canvas controls.
- Left navigator replaces the WorkspaceDock floating placement in the default shell path.
- Node and edge selection open one right properties surface, not both a right panel and floating metadata dock.
- Shell node metadata is metadata-only: no AI proposal preview, draft accept/reject, or action-creation controls appear in the right rail.
- AI Helpers / Next steps open in the shell right rail, not in a bottom-right canvas overlay.
- AI draft sessions and Find connections open in the bottom tray as they migrate, not over the canvas.
- Quick Ask AI remains separate from large review workflows.
- Disabling the shell flag restores the legacy layout without losing persisted workspace data.

## Final Blockers Before Rollback Retirement

The shell is now default-on so the refactor is visible in normal use.
FloatingDock retirement is explicitly deferred; this gate blocks duplicate
primary surfaces, broken routing, persistence regressions, and shell layout
failures while the rollback path is still available.

### Default Shell Follow-Up Gate

Current recommendation: **default shell on, rollback retained**. Open rows must
be resolved before retiring the shell-off compatibility path.

| Blocker | Surface | Risk | Required verification | Status | Pre-default required? |
| --- | --- | --- | --- | --- | --- |
| Visual density QA for ribbon, right rail, review tray, and status bar | Shell geometry | Crowded default UI or hidden controls | Shell geometry e2e plus screenshots at 1600x1000, 1440x900, and 390x844 with shell on/off | Automated narrow/header/ribbon/tray coverage passing; manual screenshot signoff still open | Yes |
| Accepted output surfaces need verification | Outputs ribbon and accepted workspace views | Accepted outputs open the wrong surface or no visible surface | Verify accepted Table/Executive/Flowchart/Tasks/Kanban routes do not open the tray; verify Checklist Preview does open the tray | E2E route coverage passing for Table, Executive, Flowchart, Tasks, Kanban, Implementation, Status, and Checklist Preview | Yes |
| Preview vs accepted artifact split stays intact | Review Tray, structured canvas, checklist artifacts | Candidate previews become canonical before acceptance | Coverage for accepted tasks in structured canvas, Checklist Preview in tray, and accepted checklist artifact persistence | Route split covered; accepted checklist artifact persistence still open | Yes |
| Automated shell verification is green | Build, unit, and e2e suite | Default-on ships with stale fixtures or untested routes | Run `npm run build`, shell unit tests, shell foundation smoke, selection shell regression, and review tray regression after all active shell edits land | Current bundle passing: build, 41 shell/unit projection tests, 21 serialized shell e2e passed, 1 intentional skip | Yes |
| Map readability and relationship lenses are verified | Map ribbon, branch scope, relationship labels | Branch focus, selected nodes, and relationship labels compete visually | Visual QA plus coverage that mind map relationship labels default off and can be toggled on intentionally | Default-off / toggle-on e2e and projection unit coverage passing; manual visual QA still open | Yes |
| Preview-first graph mutation remains safe | Connections review and generated previews | Candidate acceptance mutates canonical graph without review | Verify generated connection candidates enter Review Tray first and accept/reject preserves existing mutation behavior | Open | Yes |
| Legacy overlap `fixme` has disposition | Shell-off FloatingDock compatibility layout | Known overlap remains unexplained for rollback | Keep skipped with waiver/manual screenshot gate, narrow to shell-only geometry, or replace with stable bounding-box coverage | Disposition documented: skipped as shell-off compatibility territory while shell slot geometry guards default readiness | Yes |
| Shell-off compatibility remains covered | Feature flag rollback path | Default rollout cannot safely be disabled | Shell-off smoke/manual pass covering legacy FloatingDock edit/save/reopen behavior | Open | Yes |
| Right rail properties persist and stay metadata-only | Node, edge, branch, source properties | Data loss or AI review controls leak into metadata rail | Selection shell regression for node/edge/branch/source edits and metadata-only NodeInspector assertions | Mostly covered; rerun after active edits land | Yes |
| Review Tray remains authoritative for generated review workflows | Bottom tray | Drafts/issues/connections/previews fall back to legacy panels | Review tray regression for direct routes and close behavior | Mostly covered; rerun after active edits land | Yes |
| FloatingDock removal | Legacy floating layout | Removal breaks shell-off compatibility | Separate retirement audit after default-shell rollout | Deferred | No |
| Richer source/branch metadata | Right rail properties | Product polish remains shallow | Field expansion and persistence follow-up | Deferred | No |
| Full map projection helper extraction | Mind map projection/lens internals | Lens internals remain harder to evolve | Refactor follow-up after branch/lens styling stabilizes | First extraction landed in `frontend/src/utils/canvasProjection.js` with focused unit coverage; broader density/lens rules deferred | No |

- `selection-shell-regression.spec.js`, `review-tray-regression.spec.js`, `shell-foundation-smoke.spec.js`, `shellStore.test.mjs`, `shellLayoutState.test.mjs`, and `shellComponents.test.mjs` pass.
- Shell-critical `test.fixme` coverage is either fixed or explicitly waived with a manual screenshot gate.
- Manual screenshot pass is complete at 1600x1000, 1440x900, and 390x844 with shell disabled and enabled.
- With shell enabled, WorkspaceDock, source library, Activity, AI Helpers, metadata properties, and review workflows route to shell slots without duplicate primary floating chrome.
- Right rail node, edge, branch, and source property edits apply and persist where expected; metadata-only right rail does not expose AI draft accept/reject or action-creation controls.
- Bottom review tray hosts Drafts, Sources/source repair, Issues, Connections, Tasks preview, and Checklist Preview without opening legacy local-output bridge surfaces.
- Quick Ask AI remains lightweight and separate from review workflows.
- Disabling the shell flag restores the legacy layout and existing workspace data remains intact.
- FloatingDock retirement remains a post-default cleanup item. Legacy FloatingDock code may remain if it is not mounted as duplicate primary chrome under the shell default.

## Current Gaps

- Bottom review tray has active Drafts, Sources, Issues, Connections, Tasks preview, Checklist Preview, and source repair Playwright coverage. Accepted/canonical tasks intentionally remain in the structured canvas `Tasks` view.
- Right properties panel has shell-enabled node apply, edge metadata persistence, source properties, and branch properties coverage.
- Relationship lens-in-ribbon behavior still needs screenshot QA after LocalViewsPanel controls are mounted in the ribbon.
- Legacy visual overlap remains tracked as `test.fixme` in `selection-shell-regression.spec.js`; keep it in the manual pass until the compatibility layout is intentionally fixed or waived.
- Full visual overlap assertions are currently bounding-box only; no screenshot diff baseline exists yet.
