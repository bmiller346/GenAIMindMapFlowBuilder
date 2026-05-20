# UI Shell And Ribbon Regression Checklist

Last updated: 2026-05-19

Use this checklist while migrating surfaces behind `VITE_ENABLE_UI_SHELL_RIBBON` or `docmap.uiShellRibbon.enabled`.

## Automated Coverage

- `frontend/tests/e2e/selection-shell-regression.spec.js`
  - quick Ask AI request scope and result display
  - branch scope highlighting
  - selected node highlighting from seeded selected-node state
  - mind map relationship lens visibility
  - shell-flag ribbon, left navigator, and canvas slot smoke coverage
  - shell left navigator tab switching, collapse, event-driven open-tab behavior, and resize handle visibility
  - shell AI Helpers opens in the right rail instead of a React Flow canvas overlay
  - shell review tray Drafts path from tracked AI draft session review
  - shell right rail node metadata edit/apply local behavior
  - shell right rail relationship metadata edit/apply/save
  - placeholders for shift-click additive selection, lasso additive selection, and major panel overlap
- `frontend/tests/e2e/review-tray-regression.spec.js`
  - shell review tray Sources path for generated source draft review before accept
  - shell review tray Issues path from the left-rail Health action
  - direct shell review tray routes for Connections, Tasks preview, Checklist, Sources/source repair, and Issues without the old local output bridge
  - source draft accept applies the generated graph and source library
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

Run once with the shell disabled, then once with the shell enabled.

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
- Left navigator replaces the WorkspaceDock floating placement only when the shell flag is enabled.
- Node and edge selection open one right properties surface, not both a right panel and floating metadata dock.
- AI Helpers / Next steps open in the shell right rail, not in a bottom-right canvas overlay.
- AI draft sessions and Find connections open in the bottom tray as they migrate, not over the canvas.
- Quick Ask AI remains separate from large review workflows.
- Disabling the shell flag restores the legacy layout without losing persisted workspace data.

## Current Gaps

- Bottom review tray has active Drafts, Sources, Issues, Connections, Tasks preview, Checklist Preview, and source repair Playwright coverage. Accepted/canonical tasks intentionally remain in the structured canvas `Tasks` view.
- Right properties panel has shell-enabled node apply and edge metadata persistence tests; node persisted-save proof, source properties, and branch properties still need coverage after those routes/fixtures exist.
- Relationship lens-in-ribbon behavior still needs screenshot QA after LocalViewsPanel controls are mounted in the ribbon.
- Shift-click/lasso and visual overlap assertions are tracked as `test.fixme` in `selection-shell-regression.spec.js`; keep them in the manual pass until the interaction selectors are stable enough to activate.
- Full visual overlap assertions are currently limited to placeholders; shell slot overlap should be added once all slots are populated.
