# Product Guide: Map Readability And Lenses

## Purpose

The map should read as a mind map first. Branch structure, selected scope, and
node meaning must stay legible before knowledge graph relationship labels,
source signals, or review metadata appear.

Relationship labels are useful, but they are a lens. They should be controlled
by map view, focus mode, and filters instead of being permanently overlaid on
the core hierarchy.

## Current Implementation Map

- `frontend/src/App.jsx`
  - Builds canvas projections in `projectCanvasGraph`.
  - Computes branch scope with `collectVisibleBranchIds`.
  - Assigns branch colors with `buildBranchColorAssignments`.
  - Chooses relationship label text in `edgeSemanticInfo`.
  - Renders semantic edge labels through `SemanticEdge`.
  - Applies node, edge, branch, focus, and relationship class names.
- `frontend/src/ribbon/MapRibbonHost.jsx`
  - Hosts compact map controls in shell mode.
  - Applies selected branch scope from the selected response node.
  - Reads `selectedBranchId`, `activeCanvasView`, graph filters, and density
    from the store.
- `frontend/src/views/localViews/MapControls.jsx`
  - Renders compact and expanded view, scope, node density, output, and filter
    controls.
  - Exposes Whole/Branch scope controls but does not yet expose relationship
    label visibility as a first-class compact control.
- `frontend/src/ribbon/RelationshipRibbonGroups.jsx`
  - Renders knowledge graph relationship focus controls.
  - Renders mind map relationship lens controls and branch legend chips.
- `frontend/src/utils/kgRelationshipFilters.js`
  - Defines relationship families, lens modes, family aliases, and semantic
    edge filtering.
- `frontend/src/utils/mapStyles.js`
  - Defines map themes, hierarchy modes, node emphasis, and canvas style
    helper functions.
- `frontend/src/index.css`
  - Styles selected nodes, branch colors, branch scope, semantic edge labels,
    mind map relationship edges, and branch legend chips.
- `frontend/tests/kgRelationshipFilters.test.mjs`
  - Covers family normalization, mode filtering, labels, and summary output.
- `frontend/tests/mapStyles.test.mjs`
  - Covers map style canvas colors.

## Agent C Discovery Addendum

- Branch highlighting currently depends on React Flow node classes assembled in
  `projectCanvasGraph`: `canvas-node-in-branch-scope`,
  `canvas-node-branch-root`, `canvas-edge-in-branch-scope`,
  `canvas-node-out-of-scope`, and `canvas-edge-out-of-scope`.
- Current implementation risk: `canvas-edge-in-branch-scope` can apply to any
  visible edge whose endpoints are in the selected branch. When mind map
  relationship labels are enabled, semantic relationship edges inside the branch
  may inherit structural branch emphasis. The next implementation pass should
  limit strong branch edge emphasis to structural mind map edges and keep
  relationship edges visually secondary.
- Relationship-label visibility currently depends on edge type selection in
  `projectCanvasGraph`: mind map hierarchy edges stay `smoothstep`, while KG
  and enabled mind map relationship edges become `semantic` and render labels
  through `SemanticEdge`.
- Graph filters are node-first filters. They are stored as
  `activeGraphFilters`, persisted through the store, and applied before the
  canvas marks nodes or edges hidden.
- Selected branch state is `selectedBranchId`; selected canvas nodes are React
  Flow selection state. Readability work should keep those visual languages
  separate so branch scope does not look like direct node selection.
- Shell mode already has a relationship lens home in
  `RelationshipRibbonGroups.jsx`; legacy mode still renders equivalent floating
  controls in `App.jsx`.

## UI Rules

- Mind map hierarchy is the default reading surface.
- Branch colors should identify first-level branch families, not compete with
  selection.
- Selection should use an obvious active highlight: solid outline, subtle glow,
  and clear side accent. Avoid hatch or marquee-like rectangles for persistent
  selected objects.
- Selected branch scope should make in-scope nodes and structural edges stronger
  while dimming out-of-scope content. It should not hide neighboring context
  unless the user explicitly chooses an isolate mode later.
- Relationship labels should be off in the default mind map lens.
- When relationship labels are enabled in mind map view, show fewer, lighter
  labels than knowledge graph view. Labels should remain secondary to branch
  structure.
- Knowledge graph view may show semantic labels by default, but labels should
  still obey relationship family modes and selected-node focus.
- Relationship label controls should be lens/filter controls, not popups.
- Do not add new persistent overlays or modals for readability controls.
- Branch legend chips should act as focus controls and use the same branch color
  language as the canvas.

## Current Landed Styling

- Direct node selection uses the dedicated yellow selection language: solid
  node outline, soft glow, and side accent. It intentionally overrides branch
  color when a selected node is also inside branch scope.
- React Flow's persistent node-selection rectangle is suppressed so selected
  nodes do not look like lingering lasso or hatch regions.
- Branch families use per-branch color variables on nodes, edges, and legend
  chips. Branch color communicates structure; it is not the selected-node
  state.
- The focused branch root uses branch-color emphasis with a smaller outer ring
  than selected nodes. In-branch nodes and structural edges use softer branch
  tinting to read as related context.
- Out-of-scope nodes and edges are dimmed, not hidden, preserving mind map
  context until a future explicit isolate mode exists.

## Implementation Plan

### 1. Clarify Selection And Branch Scope Styling

Files:

- `frontend/src/index.css`
- `frontend/src/App.jsx` only if class hooks are missing.

Tasks:

- Replace any persistent selected-node styling that can be mistaken for a drag
  rectangle with a direct node highlight.
- Keep selected node highlight visually separate from branch color by reserving
  yellow or another single selection color for selection only.
- Make `.canvas-node-branch-root` read as focused branch root, not selected
  node. Recommended treatment: branch-color outline plus a small root accent,
  while actual React Flow `.selected` remains the strongest highlight.
- Make `.canvas-edge-in-branch-scope` stronger only for structural edges inside
  the selected branch. Relationship edges inside a branch should stay secondary.

Validation:

- Add or update an e2e screenshot assertion around branch scope if a visual
  regression test already covers map selection.
- Run `npm run build`.

### 2. Promote Relationship Labels To A Mind Map Lens Toggle

Files:

- `frontend/src/ribbon/RelationshipRibbonGroups.jsx`
- `frontend/src/views/localViews/MapControls.jsx`
- `frontend/src/ribbon/MapRibbonHost.jsx`
- `frontend/src/App.jsx`
- `frontend/src/utils/kgRelationshipFilters.js`
- `frontend/tests/kgRelationshipFilters.test.mjs`

Tasks:

- Keep `MINDMAP_RELATIONSHIP_MODES.OFF` as the default mind map mode.
- Treat relationship labels as a map lens control, defaulted off in mind map
  view and available from ribbon/status/lens controls without a new modal or
  popup.
- Expose a compact "Labels" or "Relationships" segmented control near existing
  map controls, reusing the current mode options instead of adding a popup.
- Use the existing mode counts so users see why a lens appears empty.
- In mind map view, render labels only for enabled semantic families and keep
  hierarchy edges unlabeled.
- Consider a middle option such as "Key labels" backed by the existing
  `INSIGHTS` mode, while "All" remains an explicit choice.

Validation:

- Extend `kgRelationshipFilters.test.mjs` for any new lens mode.
- Add e2e coverage that mind map labels are absent by default and appear after
  the lens is toggled.
- Run `npm run build`.

### 3. Extract Canvas Projection Helpers Before Larger Lens Work

Files:

- New `frontend/src/utils/canvasProjection.js` or
  `frontend/src/utils/mapProjection.js`.
- `frontend/src/App.jsx`
- New or updated projection tests under `frontend/tests`.

Tasks:

- Move pure helpers out of `App.jsx`: relationship type parsing wrappers,
  `collectVisibleBranchIds`, `buildMindmapStructureEdgeIds`,
  `buildBranchColorAssignments`, and `projectCanvasGraph`.
- Keep React-specific `SemanticEdge` rendering in a component file.
- Add unit tests for branch scope, branch color assignment, mind map edge
  selection, and relationship lens filtering.

Validation:

- Unit tests should prove semantic edges do not drive branch traversal.
- Unit tests should prove mind map view defaults to hierarchy-only edges.
- Run affected tests and `npm run build`.

### 4. Tighten Relationship Label Visibility

Files:

- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `frontend/src/utils/kgRelationshipFilters.js`

Tasks:

- Give relationship labels a density rule: truncate long relationship text,
  hide low-confidence labels in mind map insight mode, or collapse labels until
  hover when the canvas is dense.
- Keep full rationale and source signal in the existing edge inspector, not a
  new popup.
- Use family tone colors sparingly. Label tone should identify family, not paint
  the whole map.

Validation:

- Add focused tests for any confidence threshold or density rule.
- Run e2e screenshot checks for dense maps if available.
- Run `npm run build`.

## Recommended Next Agent

Agent C should continue with Step 1 if a low-risk visual change is desired.
Agent A or the shell owner should coordinate Step 2 if the control needs to move
into the top ribbon layout. A later cleanup agent should do Step 3 before broad
lens behavior expands further.

Current validation gaps:

- Add coverage that mind map relationship labels are absent by default and
  appear only after the relationship-label lens is enabled.
- Add projection-level coverage before broad lens expansion: branch scope,
  branch color assignment, structural-only branch traversal, and semantic edge
  exclusion from strong branch emphasis.
