# Connected Picture Packages Release Checklist

Owner lane: E5 release coordination and documentation.

Scope: release readiness for Connected Picture Packages only. This checklist
tracks dependencies, verification, screenshots, risks, and merge gates. It does
not authorize implementation changes outside the feature lanes.

Last updated: 2026-05-21.

## Release Goal

Ship Connected Picture Packages as a preview-first package surface that keeps a
coordinated bundle of graph nodes, relationship edges, view lenses, structured
evidence, evidence links, tasks, risks, decisions, repair targets, source refs,
assumptions, and acceptance groups together through AI draft review.

The package must remain draft-first until accepted. Source-backed items should
carry source refs. Unsupported or uncited items must remain visibly reviewable
and block bulk readiness when required.

## Lane Dependencies

| Lane | Dependency | Release expectation | Current coordination status |
| --- | --- | --- | --- |
| Backend artifact schema | `backend/ai/schemas.py`, `backend/tests/test_ai_artifact_outputs.py` | `connected_picture_package` is a registered artifact type with strict fields, source refs, assumptions, review state, and no extra shape drift. | Implemented in active worktree; targeted backend schema tests passed in handoff. |
| AI draft session normalization | `frontend/src/utils/aiDraftSessions.js`, `frontend/src/utils/aiDraftArtifacts.js`, `frontend/tests/aiDraftSessions.test.mjs` | Package artifacts become selectable draft items and selected package item acceptance stays review-first. | Implemented in active worktree; frontend draft-session package tests passed in handoff. |
| Review UI surface | `frontend/src/global-components/AiDraftSessionPanel.jsx`, `frontend/src/connected-package/ConnectedPackagePreview.jsx` | Draft revisions can show the connected package preview with overview, graph, connections, flow, table, chart, evidence, tasks, and review tabs. | Implemented. It supports backend/session package payloads and clearly needs visual signoff where mock fallback is used. |
| First-class package projection input | `frontend/src/connected-package/`, `frontend/src/views/projections/`, `frontend/src/views/CanvasStructuredView.jsx`, `frontend/src/views/LocalViewsPanel.jsx` | After accept, package-capable views prefer strict connected package metadata over reconstructing meaning from accepted nodes/edges/artifacts. | Implemented in frontend bridge. Canonical model, accepted selectors, projection helpers, and LocalViewsPanel/CanvasStructuredView wiring are covered by unit and connected Playwright gates. |
| Source and repair review | Source draft review, source reconciliation, review tray routes | Missing refs, inferred relationships, owner gaps, and repair targets remain explicit before acceptance. | Implemented for targeted item repair and trust badges; Playwright visual pass still open. |
| Map and lens readability | Map readability, relationship lenses, Sankey/chart lens lanes | Package graph, relationship labels, table, chart, and Sankey-style flow lenses do not compete with the canonical mind map. | Package-first UI consumption is implemented for the main post-accept views; screenshot signoff remains open. |
| Export and handoff readiness | Structured outputs, Miro/monday handoff lanes | Accepted package artifacts can feed implementation handoff candidates without bypassing review state. | Backend package projection helpers exist; export/handoff release verification remains open. |
| Release documentation | This checklist | Open risks, tests, manual QA, screenshots, and merge readiness are explicit. | Updated after A-E handoffs. |

## Open Risks

| Risk | Impact | Required closeout |
| --- | --- | --- |
| Preview can fall back to mock package artifacts. | Reviewers may mistake a layout demo for backend-backed package content. | Confirm the UI labels mock fallback clearly, and require a backend/session payload screenshot before release readiness. |
| Backend package schema and frontend preview model may drift. | Valid backend packages may render incompletely, or preview-only fields may become accidental contract. | Compare `connected_picture_package` schema fields against `ConnectedPackagePreview` normalization before merge. |
| Selected package item acceptance reports `canonical_graph_mutated` even when no graph nodes are added. | Release notes and QA may misread review-only acceptance as graph mutation. | Confirm intended semantics with acceptance/session lane before signoff; document whether artifact acceptance counts as canonical mutation. |
| Bulk readiness rules are not yet proven end to end. | Repair targets or uncited items could be accepted without visible gating. | Add or identify browser coverage for repair-target blocking, or keep bulk accept gated/manual. |
| Screenshot coverage for the new package tabs is not yet committed. | Layout regressions could ship in the review tray, narrow shell, or desktop viewport. | Capture package preview screenshots at desktop and narrow widths before merge. |
| Export/handoff path is not verified for accepted packages. | Users could accept a package but fail to export or hand it off consistently. | Run accepted-artifact persistence/export checks or mark export/handoff as deferred. |
| Backend direct `connected_packages: []` persistence is not yet decided. | The frontend bridge discovers accepted packages from artifacts and metadata; a later backend schema migration may still be useful for simpler persistence and export APIs. | Defer until export/handoff requirements are settled. Do not block the current frontend package-first release gate on this migration. |

## Automated Verification

Run these commands from `C:\Users\brmiller\source\repos\bmiller346\MindMapWizard\GenAIMindMapFlowBuilder` unless noted.

### P6 Regression Evidence - 2026-05-21

- `cd frontend; node --test tests/aiDraftSessions.test.mjs tests/graphProjection.test.mjs tests/acceptedConnectedPackages.test.mjs tests/connectedPackageModel.test.mjs tests/connectedPackageProjections.test.mjs` - Passed, 93 tests. Covers canonical package draft item normalization, accepted package discovery from node-attached and accept/activity artifacts, package projection bundle helpers, package-first table/flowchart/Sankey/relationship/evidence/task rows, and legacy non-package fallback.
- `cd frontend; npm run build` - Passed. Vite reported the existing large chunk warning for `plotly-DSp4kEVb.js`.
- `cd frontend; CI=1 PLAYWRIGHT_DEV_PORT=5191 npx playwright test tests/e2e/connected-picture-package-integration.spec.js --workers=1` - Passed. The fixture now persists a strict accepted connected package artifact through activity metadata and node-attached artifacts, then verifies Map, Flowchart, Table/Sankey lens, Evidence, and Tasks after acceptance.

### Required Before Merge

- `python -m pytest backend/tests/test_ai_artifact_outputs.py -k connected_picture_package`
- `cd frontend; node --test tests/aiDraftSessions.test.mjs`
- `cd frontend; npm run build`

### Recommended Release Bundle

- `python -m pytest backend/tests/test_ai_artifact_outputs.py backend/tests/test_ai_draft_sessions.py backend/tests/test_ai_draft_responses.py`
- `cd frontend; node --test tests/aiDraftSessions.test.mjs tests/graphProjection.test.mjs tests/sourceReconciliationPreview.test.mjs`
- `cd frontend; npx playwright test tests/e2e/review-tray-regression.spec.js tests/e2e/selection-shell-regression.spec.js --workers=1`
- `npm run desktop:check`

### Live/Provider Gate

- If the release claims live AI package generation, run the live provider smoke
  with OpenAI configuration present and record the exact command, model policy,
  and result here.
- If OpenAI credentials are not available, release notes must say the live
  provider path was not verified in this environment.

## Manual QA

Use a workspace with at least one source-backed branch, several relationship
edges, and at least one item with missing source support.

- Ask AI: request a connected picture or implementation handoff package from
  workspace scope.
- Confirm the draft opens in the review surface before any graph mutation.
- Confirm the Connected Package preview shows Overview, Graph, Connections,
  Flow, Table, Chart, Evidence, Tasks, and Review tabs.
- Confirm the header says whether content is session/backend-backed or mock
  preview artifacts.
- Confirm source coverage, repair targets, assumptions, and review notes are
  visible without opening another surface.
- Confirm uncited items, inferred dependency edges, missing owners, or chart
  placeholder weights appear as warning or blocked states.
- Select a package artifact item and accept only that item.
- Confirm selected artifact acceptance does not create unexpected graph nodes or
  edges.
- Accept a package item that should create graph content and confirm accepted
  nodes/edges appear only after acceptance.
- Save and reopen the workspace; confirm accepted package artifacts, accepted
  graph nodes/edges, activity history, and review state persist.
- After accept, open Map, Connections, Flowchart, Table, Chart/Sankey,
  Evidence/Review, and Tasks. Confirm package-backed views use strict package
  metadata where available rather than only node-derived projections.
- Reject or close a package draft; confirm canonical nodes, edges, and accepted
  artifacts do not change.
- Verify the shell bottom review tray/right rail behavior remains consistent:
  draft review stays in the review tray, metadata stays in the right rail.

## Screenshot And Visual QA Notes

Capture screenshots after the package preview is reachable from the normal Ask
AI review flow.

| Viewport | State | Required evidence | Status |
| --- | --- | --- | --- |
| 1600x1000 | Overview tab with backend/session package payload | Screenshot attachment or file path | Open |
| 1600x1000 | Evidence and Review tabs showing repair targets | Screenshot attachment or file path | Open |
| 1440x900 | Graph, Connections, Flow, and Chart tabs | Screenshot attachment or file path | Open |
| 390x844 | Tab strip scroll, Overview, Evidence, and Review tabs | Screenshot attachment or file path | Open |
| Shell review tray | Package preview with right rail closed | Screenshot attachment or file path | Open |
| Shell review tray plus right rail | Package preview with metadata rail open elsewhere | Screenshot attachment or file path | Open |

Visual checks:

- Tabs remain reachable and do not wrap into unusable controls.
- Long package titles truncate or wrap without covering status chips.
- Table preview scrolls horizontally on narrow screens.
- Warning and blocked states are visually distinct from ready states.
- Package content does not hide Accept, Reject, selected-item, or close controls
  in the draft review surface.
- The Sankey/chart lens is presented as a lens, not as the canonical package
  model.

## Merge Readiness

| Gate | Ready when | Status |
| --- | --- | --- |
| Schema contract | Backend strict schema tests pass and package field list is stable. | Ready from targeted handoff tests; rerun before merge. |
| Draft-session contract | Frontend draft-session tests pass for package draft item normalization and selected package acceptance. | Ready from targeted handoff tests; rerun before merge. |
| UI routing | Package preview is reachable from the normal AI draft review route without duplicate floating surfaces. | Ready from e2e handoff; visual review still recommended. |
| Mock fallback policy | Mock preview state is clearly labeled and not used as release proof for backend/session payloads. | Needs visual confirmation. |
| Source/review safety | Missing citations, assumptions, repair targets, and review states are visible before acceptance. | Ready from targeted trust/source tests; Playwright visual pass still open. |
| Persistence | Accepted package artifacts and any accepted graph changes survive save/reopen. | Ready from E handoff; rerun connected e2e before merge. |
| Package-first post-accept views | `LocalViewsPanel` and `CanvasStructuredView` prefer accepted connected package projections and keep legacy node/artifact projections as fallback. | Ready. Unit projection gates and connected Playwright pass after the structured-view dock fix. |
| Screenshots | Required desktop, narrow, and shell review screenshots are captured and reviewed. | Open |
| Build and smoke | Required commands pass on the release branch after active feature lanes land. | Unit, build, and connected package Playwright passed on 2026-05-21. |
| Release notes | Notes distinguish preview-only behavior, deferred export/handoff work, and unverified live provider paths. | Open |

## Release Notes Draft Points

- Connected Picture Packages coordinate graph, relationship, evidence, task,
  repair, and review information as one draft-first package.
- Packages preserve source refs where available and keep assumptions or missing
  citations visible for reviewer action.
- The initial release should be described as a review and acceptance workflow
  unless export/handoff persistence is verified in the same merge.
- Sankey/chart/table/package tabs are lenses over accepted or reviewable package
  data; the canonical workspace graph remains the source of truth.
- After acceptance, package-capable views should use connected package metadata
  first. Node, edge, and generated-artifact projections remain compatibility
  fallbacks for older drafts and non-package Ask AI flows.
