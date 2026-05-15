# UX Nudges And AI Outputs Roadmap

This roadmap covers two product upgrades:

1. Make AI create first-class workspace outputs, not only mind maps.
2. Add helpful, user-controllable nudges that guide review and next action
   without making the workspace feel noisy.

Use this alongside:

- `NODE_AUTHORING_UX_ROADMAP.md`
- `NODE_AI_ACTIONS_ROADMAP.md`
- `WORKSPACE_CONTEXT_ROADMAP.md`

This roadmap does not replace those. It sits above them as a product/UX
coordination layer for agents working on output types, filters, nudges, and
settings overrides.

## Product Intent

TraceSpace should feel like a structured think space, not a "generate a mind map"
tool with extra tabs.

The canonical workspace remains the durable source of truth, but the user
should be able to ask for, visualize, and refine different thinking artifacts:

```text
sources + brief + manual edits
-> canonical typed workspace
-> map / flow chart / outline / table / rendered chart / checklist / SME questions
-> reviewable previews
-> accepted output state
-> exports and handoffs
```

The mind map is one visualization. It is not the whole product.

The product should support multiple visual reasoning modes:

- Mind maps for associative structure.
- Knowledge graph / connection graph views for linked ideas, clusters,
  backlinks, weak ties, and unexpected relationships.
- Flow charts for processes, decisions, handoffs, and dependencies.
- Tables for comparison, audit, tasks, and extracted data.
- Rendered charts for quantitative or categorical data users need to inspect.
- Checklists for execution and review.
- Source and SME review boards for evidence and uncertainty.

The goal is to make obscure or early-stage ideas usable and sendable to other
people for implementation without boxing the workspace into one diagram type.

## Current Product Shape

Already present:

- Core views: Map, Outline, Tasks, Table.
- Review/output views: Tasks preview, Checklist, Gaps, SME Qs, Source repair.
- AI helper roles: Source Librarian, Project Planner, Reviewer, Integration
  Operator.
- Workspace brief fields for desired outputs, output style, node types, review
  policy, and review rules.
- Preview-first helper generation and acceptance flows.
- Settings/local settings foundation in `frontend/src/config/localSettings.js`.
- Activity, sources, integrations, automations, and AI helper panels.

Gaps:

- The ingestion/generation copy and contracts still over-emphasize "mind map."
- Users cannot clearly tell whether a tab is just a view/filter or a generated
  output.
- Desired outputs from the brief do not yet feel like a primary generation
  contract.
- Nudges do not exist as a coherent system.
- There is no user-facing setting to disable nudges or tune nudge categories.
- Filters are not yet a strong, obvious part of the navigation model.

## Core UX Model

Separate four concepts in the UI and code:

### 1. Views

Views are different ways to see the same accepted graph.

- Map
- Knowledge Graph / Connections
- Outline
- Table
- Tasks

Changing a view should not imply AI generated anything new.

### 2. Filters

Filters narrow the current view.

Recommended initial filters:

- Source-backed
- Needs Review
- Manual
- AI-generated
- Tasks only
- Unassigned
- Missing due date
- Missing source
- Low confidence
- Hidden from export

Filters should be composable and visibly resettable.

### 3. AI Outputs

AI outputs are generated, previewable work products.

Recommended first-class output types:

- Mind map
- Knowledge graph
- Flow chart
- Outline
- Table
- Rendered chart
- Tasks
- Checklist
- SME questions
- Missing information report
- Source coverage report
- Source repair plan
- Handoff package
- Implementation handoff package

These should have explicit states:

```text
requested -> generated preview -> reviewed -> accepted -> applied/exported
```

### 4. Nudges

Nudges are lightweight recommendations based on the current graph and settings.

They should suggest next actions without forcing the user into them.

Examples:

- "5 claims need source support."
- "This branch can become a checklist."
- "3 task-like nodes are missing owners."
- "2 nodes are outside the current viewport."
- "This source is uploaded but not cited."
- "Your brief asks for SME questions, but none exist yet."

## Projection Vs Generation Rule

Some views can be projected directly from existing graph data. Others need AI
to enrich missing structure before the view is useful.

Use this decision model:

```text
Can the accepted graph already support this view?
-> yes: project it as a view/filter
-> partially: show the view with "missing fields" nudges and offer enrichment
-> no: offer an AI output action such as "Create knowledge graph" or
       "Create flow chart"
```

Examples:

- A table can often project from node metadata, but it may need AI enrichment
  for missing owners, due dates, categories, or confidence.
- A task view can project from task-like nodes, but it may need AI enrichment
  when nodes are concepts with no owner/status/due date.
- A flow chart needs explicit process, decision, sequence, and dependency
  relationships. If those relationships are missing, offer "Create flow chart"
  instead of pretending filters can infer it.
- A knowledge graph can project from links, shared sources, tags, semantic
  similarity, common entities, citations, or explicit edges. If those signals
  are weak, offer "Find connections" or "Create knowledge graph."
- Rendered charts need a chart spec and data rows. If nodes only contain prose,
  offer "Extract chart data" before rendering a chart.

Do not make filters feel seamless by hiding uncertainty. Make the uncertainty
visible and actionable.

## Additional Guardrails

These guardrails keep the think space flexible without turning it into a vague
anything-machine.

### Artifact Registry

Every AI output type should be registered before agents wire UI or backend
generation around it. This prevents each lane from inventing slightly different
names or schemas for the same idea.

Each registered artifact type must define:

- `artifact_type`
- required input data
- optional input data
- generated schema
- projection requirements
- supported views
- preview component
- accept behavior
- export behavior
- validation rules

Example:

```json
{
  "artifact_type": "knowledge_graph",
  "requires": ["nodes"],
  "optional": [
    "source_refs",
    "entities",
    "tags",
    "explicit_edges",
    "semantic_similarity"
  ],
  "outputs": ["relationship_edges", "clusters", "rationales"],
  "preview_component": "KnowledgeGraphPreview",
  "accept_behavior": "append_edges_and_metadata",
  "validation": ["edge_has_source_signal_or_needs_review"]
}
```

### Relationship Contract

Knowledge Graph / Connections edges must be typed. Untyped relationship edges
will quickly become a visually interesting but unauditable hairball.

Each relationship edge should include:

```json
{
  "source_node_id": "node-1",
  "target_node_id": "node-2",
  "relationship_type": "depends_on",
  "source_signal": "explicit_text",
  "confidence": 0.78,
  "rationale": "Both nodes reference the same approval workflow.",
  "source_refs": [],
  "assumptions": [],
  "review_state": "needs_review"
}
```

Allowed starter relationship types:

- `contains`
- `references`
- `depends_on`
- `duplicates`
- `conflicts_with`
- `similar_to`
- `derived_from`
- `supports`
- `contradicts`
- `implements`
- `owned_by`
- `requires_review_by`
- `related_to`

Allowed starter source signals:

- `explicit_text`
- `shared_source`
- `semantic_similarity`
- `user_created`
- `ai_inferred`
- `external_ref`

### Visual Artifact Provenance

Visual artifacts may be projections or render blocks, but they must reference
canonical nodes, edges, source chunks, or accepted artifact data.

They should not become isolated visual-only state unless explicitly marked as
`draft` or `export_only`.

Every generated artifact should record:

- `generated_by`
- prompt profile / AI role
- input scope
- input source refs
- generated timestamp
- model/provider
- confidence summary
- assumptions
- validation status

This matters most for charts and knowledge graphs because they can imply more
precision than the source supports.

### Scope Selector

Every AI output generation action must declare a scope.

Supported initial scopes:

- whole workspace
- selected branch
- selected nodes
- selected source document
- current filtered view

The scope should be visible before generation and preserved in Activity,
artifact metadata, and preview/accept history.

### Preview Diff

Any AI output that mutates the canonical workspace must show a preview diff
before acceptance.

The diff should summarize:

- new nodes
- updated nodes
- new edges
- new relationship edges
- new artifact records
- review-state changes
- assumptions and unsourced items

Example:

```text
+ 8 new nodes
+ 12 relationship edges
+ 1 checklist artifact
~ 4 nodes updated with owner/status fields
! 5 unsourced items marked needs_review
```

### Chart Safety

Rendered charts require structured or extractable data. If only prose is
available, the app must generate an extracted-data preview first.

Charts must expose the source data table or source refs used to render them.

Starter chart types:

- bar
- line
- pie/donut
- timeline
- matrix
- scatter
- stacked bar

Likely high-value chart artifacts:

- timeline
- status matrix
- category counts
- source coverage chart
- task readiness chart

### Implementation Handoff Package

Add `implementation_handoff_package` as a first-class artifact type. This is the
"send this to people so they can implement it" output.

Recommended contents:

- summary
- scope
- accepted nodes
- tasks/checklist
- source refs
- assumptions
- open SME questions
- risks
- recommended next actions
- monday export candidates
- Miro export candidates

### Automation Rule

Automation is downstream of accepted structure.

Do not add background automation until previews, validation, and handoff
packages are reliable. Prefer explicit user-invoked actions such as "Find
connections," "Create flow chart," "Extract chart data," or "Create
implementation handoff package" before adding automation layers.

## Settings Principle

Users must be able to turn nudges off.

Minimum setting:

```json
{
  "nudges": {
    "enabled": true
  }
}
```

Recommended setting model:

```json
{
  "nudges": {
    "enabled": true,
    "canvas": true,
    "review": true,
    "sources": true,
    "tasks": true,
    "ai_outputs": true,
    "integrations": true,
    "density": "normal"
  }
}
```

Do not make settings modal feel like a cockpit. Start with a simple master
toggle and an "Advanced nudge categories" disclosure.

## Agent Lanes

Use five agents if available. If staffing is limited, combine Agent D and E, or
combine Agent B and C after Agent A lands the output contract.

## Agent A: Output Contract And Backend Generation

Owns making AI generation target artifact/output types instead of defaulting to
mind map language everywhere.

Primary files:

- `backend/ai_helpers.py`
- `backend/app.py`
- `backend/ai/schemas.py`
- `backend/graph/ai_contract.py`
- backend tests under `backend/tests/`

Allowed supporting files:

- `frontend/src/modals/WorkspaceBriefModal.jsx` for contract labels only.
- `frontend/src/utils/flowSnapshots.js` if output metadata must persist.

Do not own:

- Frontend nudge UI.
- Settings modal UI.
- Table/checklist preview component polish.

Deliverables:

- Define an `output_type` contract for generated artifacts.
- Define an `artifact_type` or compatible render-block extension when the
  output is a visual block rather than only graph nodes.
- Define the Artifact Registry location and seed it with starter artifact
  definitions.
- Define relationship metadata for knowledge graph projections:
  - relationship type
  - source signal
  - confidence
  - rationale
  - source refs or assumptions
- Update prompts/contracts so "mind map" is one possible output, not the only
  mental model.
- Ensure requested `desired_outputs` influences generation.
- Return typed output metadata in helper previews and source-ingestion
  generation paths.
- Add backend tests proving flow-chart/checklist/table/tasks/chart/SME/source
  coverage/knowledge-graph outputs are structurally possible.

Back-check questions:

- Can a brief request `tasks` without requiring a map-first explanation?
- Can a brief request `checklist` and receive checklist-ready metadata?
- Can a brief request `flow_chart` and receive process, decision, dependency,
  or handoff structure?
- Can a brief request `knowledge_graph` and receive meaningful relationship
  edges instead of only hierarchy?
- Can a brief request `chart` and receive a renderable chart spec plus source
  data or table rows?
- Does every generated artifact record scope, provenance, validation status,
  and preview diff metadata?
- Can generated outputs still be represented in the canonical graph?
- Are unsupported or inferred outputs marked `needs_review`?
- Does the model still produce valid React Flow graph data where needed?

## Agent B: Frontend Output UX And View Taxonomy

Owns making users understand what is a view, a filter, and an AI-created
output.

Primary files:

- `frontend/src/views/LocalViewsPanel.jsx`
- `frontend/src/views/*Preview.jsx`
- `frontend/src/views/graphProjection.js`
- `frontend/src/global-components/AiHelpersPanel.jsx`
- `frontend/src/modals/WorkspaceBriefModal.jsx`
- `frontend/src/global-components/WorkspaceBriefPanel.jsx`
- `frontend/src/index.css`

Allowed supporting files:

- `frontend/src/stores/store.js`
- `frontend/src/config/localSettings.js` only for reading filter/view state if
  Agent D has defined it.

Do not own:

- Backend generation contracts.
- Settings modal implementation.
- Nudge engine scoring.

Deliverables:

- Rename/group the Local Views panel into clear sections:
  - Views
  - AI Outputs
  - Review
  - Handoff
- Add a Knowledge Graph / Connections view that shows non-hierarchical
  relationships, clusters, weak ties, and source/semantic links when available.
- Make AI-generated outputs visibly preview-first.
- Add preview diff summaries before accepting generated output mutations.
- Make empty states action-aware:
  - "Create knowledge graph"
  - "Find connections"
  - "Create flow chart"
  - "Extract chart data"
  - "Generate task preview"
  - "Create checklist from this branch"
  - "Draft SME questions"
  - "Repair source refs"
- Show whether an output came from local projection or backend AI generation.
- Add clear accepted/applied state in output views.

Back-check questions:

- Can a new user tell Map and Checklist are not the same kind of thing?
- Can a new user tell Mind Map and Knowledge Graph are different lenses?
- Does "Generate checklist" create or preview a work product, rather than just
  switch tabs?
- Does "Create knowledge graph" clarify whether the app is projecting existing
  links or asking AI to infer/enrich relationships?
- Can the user see what has already been accepted?
- Can the user see exactly what will change before accepting generated output?
- Are generated outputs scoped to whole graph vs selected branch?
- Are labels consistent with Activity and AI Helpers?

## Agent C: Nudge Engine And Projection Rules

Owns computing nudges from graph state, source coverage, tasks, brief, viewport,
and integrations.

Primary files:

- `frontend/src/views/graphProjection.js`
- `frontend/src/utils/*`
- `frontend/src/stores/store.js`
- `frontend/src/stores/workspacePanelStore.js`
- focused frontend tests under `frontend/tests/`

Allowed supporting files:

- `frontend/src/global-components/GraphValidationPanel.jsx`
- `frontend/src/global-components/SourcesPanel.jsx`
- `frontend/src/global-components/IntegrationsPanel.jsx`
- `frontend/src/global-components/AiHelpersPanel.jsx`

Do not own:

- Final visual presentation of nudges.
- Settings modal UI.
- Backend AI generation.

Deliverables:

- Add a pure nudge projection utility, for example:
  `frontend/src/utils/workspaceNudges.js`.
- Compute nudge categories:
  - canvas/navigation
  - knowledge graph connection opportunities
  - source coverage
  - review quality
  - task readiness
  - AI output opportunities
  - integration readiness
- Include severity, action label, target node/source/branch IDs, and dismiss
  key.
- Add focused unit tests for nudge projection.
- Keep all nudge computation deterministic and independent of rendering.

Suggested nudge shape:

```json
{
  "id": "missing-source-node-123",
  "category": "sources",
  "severity": "medium",
  "title": "Node needs a source",
  "detail": "This claim has no source reference.",
  "action_label": "Open source repair",
  "action": {
    "type": "open_view",
    "view": "sources",
    "node_id": "node-123"
  },
  "dismiss_key": "missing-source-node-123"
}
```

Back-check questions:

- Is each nudge actionable?
- Can each nudge be dismissed or suppressed by category?
- Are nudges stable, or do IDs flicker between renders?
- Are nudges derived from graph data rather than component-local guesswork?
- Do nudges distinguish "we can project this now" from "AI should enrich this
  first"?
- Do we avoid duplicate warnings already covered by validation?

## Agent D: Settings Overrides And User Preferences

Owns user control over nudges, filters, and AI-output behavior defaults.

Primary files:

- `frontend/src/modals/SettingsModal.jsx`
- `frontend/src/config/localSettings.js`
- `frontend/src/stores/store.js`
- `frontend/src/global-components/Header.jsx`
- focused frontend tests under `frontend/tests/`

Allowed supporting files:

- Nudge UI files from Agent E only through coordination.
- `frontend/src/views/LocalViewsPanel.jsx` for filter/default view integration.

Do not own:

- Nudge engine logic.
- Backend generation prompts.
- AI output preview UI.

Deliverables:

- Add a master "Show nudges" setting.
- Add optional category toggles under an advanced disclosure.
- Add nudge density preference:
  - quiet
  - normal
  - assertive
- Persist settings via local settings.
- Add filter persistence if product wants last-used filters to survive reload.
- Ensure turning off nudges removes them from canvas/panels without changing
  graph data.

Back-check questions:

- Can users turn off all nudges from Settings?
- Can users keep source/review nudges but disable canvas nudges?
- Are settings local-only and non-destructive?
- Does disabling nudges also suppress empty-state nags that are nudge-like?
- Does the app still expose validation errors even when nudges are off?

## Agent E: Nudge UI, Interaction, And QA

Owns how nudges appear and how users act on them.

Primary files:

- `frontend/src/App.jsx`
- `frontend/src/global-components/*Nudge*.jsx` new files as needed
- `frontend/src/global-components/NodeMetadataBadges.jsx`
- `frontend/src/global-components/NodeInspector.jsx`
- `frontend/src/index.css`
- `frontend/tests/e2e/*`

Allowed supporting files:

- `frontend/src/views/LocalViewsPanel.jsx`
- `frontend/src/global-components/SourcesPanel.jsx`
- `frontend/src/global-components/AiHelpersPanel.jsx`

Do not own:

- Nudge projection logic.
- Settings persistence.
- Backend AI generation.

Deliverables:

- Add a compact nudge surface, probably in the workspace shell rather than as
  large floating cards.
- Add node-level nudge badges where useful, but keep them subtle.
- Add action routing for common nudge actions:
  - focus node
  - open source repair
  - open task preview
  - open checklist output
  - open settings
  - dismiss
- Add browser tests for:
  - nudges visible by default
  - settings disables nudges
  - category disable suppresses only that category
  - action opens the right view/panel
  - dismissed nudge stays dismissed for the session/local preference

Back-check questions:

- Do nudges help without covering the canvas?
- Is there a clear "why am I seeing this?" explanation?
- Can users dismiss a nudge without solving it immediately?
- Are node badges readable but not visually dominant?
- Does the UI stay clean on a dense graph?

## Recommended Sequencing

1. Agent A defines and tests output contracts.
2. Agent C defines nudge projection data shape in parallel.
3. Agent D adds settings toggles and local persistence.
4. Agent B updates output/view taxonomy once Agent A's terms are stable.
5. Agent E builds nudge UI using Agent C projection and Agent D settings.
6. Agent E owns final browser regression across all lanes.

Agents A and C can start immediately in parallel.
Agents B and E should wait for enough contract/projection shape to avoid churn.
Agent D can start immediately with settings defaults and merge category keys
from Agent C later.

## Suggested Agent Jobs

### Agent A Job

```text
You are Agent A for UX_NUDGES_AND_OUTPUTS_ROADMAP.md. Own backend output
contracts and generation semantics. Make AI generation treat mind_map, outline,
knowledge_graph, flow_chart, table, chart, tasks, checklist, sme_questions,
missing_info_report, source_coverage, source_repair, and handoff_package as
first-class output or artifact types. Add an Artifact Registry with required
inputs, generated schema, validation rules, accept behavior, and export behavior
per artifact type. Preserve the canonical think space and preview-first
mutation rules. Add backend tests proving non-mind-map outputs and visual
artifacts are structurally generated and marked needs_review when unsupported.
Do not build nudge UI or settings UI. Update the roadmap with checkboxes/status
notes when complete.
```

### Agent B Job

```text
You are Agent B for UX_NUDGES_AND_OUTPUTS_ROADMAP.md. Own frontend output UX and
view taxonomy. Rework LocalViewsPanel and related preview views so users can
clearly tell Views, Filters, AI Outputs, Review, and Handoff apart. Empty states
should offer concrete generation actions such as Create knowledge graph, Find
connections, Create flow chart, Extract chart data, Generate task preview, or
Draft SME questions. Show whether an output is locally projected, AI-generated,
accepted, or applied. Add preview diff summaries before accepting generated
output mutations. Do not change backend generation or settings persistence.
Update the roadmap with checkboxes/status notes when complete.
```

### Agent C Job

```text
You are Agent C for UX_NUDGES_AND_OUTPUTS_ROADMAP.md. Own the nudge engine and
projection rules. Add a pure utility that derives stable, actionable nudges from
the current graph, sources, tasks, brief, integrations, and viewport-relevant
state. Include categories, severity, action metadata, and dismiss keys. Add
focused unit tests. Distinguish projection-ready views from cases that need AI
enrichment or reprompting. Do not build final visual UI or settings UI. Update
the roadmap with checkboxes/status notes when complete.
```

### Agent D Job

```text
You are Agent D for UX_NUDGES_AND_OUTPUTS_ROADMAP.md. Own settings overrides and
user preferences. Add Settings controls for Show nudges, advanced nudge
categories, and nudge density. Persist preferences through localSettings. Ensure
turning off nudges is non-destructive and does not hide true validation errors.
Coordinate category keys with Agent C. Do not implement nudge scoring or backend
output generation. Update the roadmap with checkboxes/status notes when
complete.
```

### Agent E Job

```text
You are Agent E for UX_NUDGES_AND_OUTPUTS_ROADMAP.md. Own nudge UI, actions, and
QA. Render the nudges produced by Agent C while respecting settings from Agent
D. Add subtle node-level badges only where useful. Wire nudge actions to focus
nodes, open views, open source repair, open task/checklist previews, dismiss,
and open settings. Add browser tests for default visibility, settings disable,
category disable, nudge actions, dismiss behavior, and dense graph cleanliness.
Update the roadmap with pass/fail notes.
```

## Phase Checklist

### Phase 1: Output Contract

- [x] Agent A: Define output type enum/contract.
- [x] Agent A: Add Artifact Registry with required inputs, optional inputs,
  schema, projection requirements, preview component, accept behavior, export
  behavior, and validation rules.
- [x] Agent A: Define artifact/render-block contract for flow charts and
  rendered charts.
- [x] Agent A: Define knowledge graph relationship contract for non-hierarchical
  links, clusters, source signals, confidence, and rationale.
- [x] Agent A: Update generation prompts so "mind map" is not the default
  language for every artifact.
- [x] Agent A: Make workspace brief `desired_outputs` drive generation.
- [x] Agent A: Add typed output metadata to generated previews.
- [x] Agent A: Add backend tests for knowledge graph/flow chart/chart/tasks/checklist/table/SME/source coverage.

### Phase 2: Output UX Taxonomy

- [x] Agent B: Group current Local Views into clear product sections.
- [x] Agent B: Add Knowledge Graph / Connections as a distinct view or output
  surface from hierarchical Map.
- [x] Agent B: Add scope selector affordance for workspace, branch, selected
  nodes, selected source document, and current filtered view.
- [x] Agent B: Add preview diff summaries before generated output acceptance.
- [x] Agent B: Rename action labels to distinguish "view" from "generate."
- [x] Agent B: Add accepted/applied state to output views.
- [x] Agent B: Add output empty states with concrete AI actions.
- [x] Agent B: Show selected scope: whole graph vs branch.

Agent B status: Local Views now separates Views, Filters, AI Outputs, Review,
and Handoff. Mind Map is labeled as the hierarchical lens; Knowledge Graph and
Connections are separate relationship lenses and Connections uses typed
`relationship_type` labels when present. AI Helpers exposes the full initial
scope set: whole workspace, selected branch, selected nodes, selected source
document, and current filtered view. Draft-session generation preserves rich
`nodes` and `source` scopes; legacy helper-preview endpoints continue using
their existing backend-supported scope payloads. Preview diff summaries are
shared across local helper previews and AI draft acceptance.

### Phase 3: Filters

- [ ] Agent B + C: Define filter state shape.
- [x] Agent C: Implement filter projection over canonical graph data.
- [x] Agent C: Add a projection-readiness check that reports missing fields
  before filters or views pretend to work.
- [x] Agent B: Add UX copy/actions for "project now", "enrich missing fields",
  and "generate target artifact."
- [x] Agent B: Add compact filter controls.
- [x] Agent D: Decide whether filter state persists locally.
- [ ] Agent E: Verify filters do not conflict with selected branch scoping.

### Phase 4: Nudge Engine

- [x] Agent C: Add nudge projection utility.
- [x] Agent C: Add source/review/task/output/integration nudge categories.
- [x] Agent C: Add stable dismiss keys.
- [x] Agent C: Add focused unit tests.
- [x] Agent C: Document which nudges are informational vs action-required.
  Categories use severity as the action level: `high`/`medium` require review
  before handoff, while `low` is informational guidance or optional enrichment.

### Phase 5: Settings Overrides

- [x] Agent D: Add master "Show nudges" setting.
- [x] Agent D: Add advanced category toggles.
- [x] Agent D: Add nudge density.
- [x] Agent D: Persist settings in local settings.
- [x] Agent D: Ensure validation remains visible when nudges are off.

Agent D status: Settings now persist local-only nudge preferences with category
keys `canvas`, `review`, `sources`, `tasks`, `ai_outputs`, `integrations`, and
`knowledge_graph`, plus density `quiet`, `normal`, or `assertive`. Last-used
graph filters persist locally and are not included in workspace snapshots.
Validation remains on its own rendering path and is not gated by nudge
preferences.

### Phase 6: Nudge UI

- [x] Agent E: Add compact global nudge surface.
- [x] Agent E: Add subtle node-level indicators.
- [x] Agent E: Wire nudge actions.
- [x] Agent E: Add dismiss behavior.
- [x] Agent E: Add browser regression coverage.

### Phase 7: Integration And QA

- [x] Agent E: Verify dense graph does not become noisy.
- [x] Agent E: Verify no nudges appear when disabled.
- [x] Agent E: Verify output generation labels match backend behavior.
- [x] Agent E: Verify source/SME/task/checklist flows from empty states.
- [x] Agent E: Record pass/fail notes in this roadmap.

Agent E QA notes:

- PASS: Compact global guidance renders at the canvas edge with density limits
  (`quiet`, `normal`, `assertive`) and does not cover the main canvas or local
  views.
- PASS: Master nudge setting suppresses nudge UI only; graph validation remains
  visible and expandable for true validation issues.
- PASS: Category toggles suppress only matching nudge categories through the
  Agent C -> Agent D category adapter.
- PASS: Nudge actions route to node focus/inspector, source repair, task
  preview, checklist/AI output targets, knowledge graph connections,
  integrations, and settings.
- PASS: Dismiss stores stable `dismiss_key` values in local preference storage
  so dismissed nudges stay hidden across reloads.
- PASS: Node-level indicators stay as compact dots by default, with expanded
  labels available only on hover/focus.
- PASS: Output generation labels now distinguish project-now local projections
  from AI enrichment/generation actions, and CTA presets open valid Ask AI
  role/action combinations for chart data, source coverage, tasks, checklist,
  flow chart, knowledge graph, gaps, and SME questions.
- PASS: Empty-state source/SME/task/checklist paths now include direct next
  actions to ask AI for the matching preview or route to adjacent gap/source
  review, without requiring backend artifact contract changes.

## Evaluation Fixtures

AI creating more than mind maps must be testable with representative inputs,
not judged by whether a demo "looks good."

Use or create fixtures for:

- Autodesk standards-style DOCX.
- Procedure/SOP PDF.
- Meeting notes TXT/MD.
- Software inventory CSV or table-style source.
- Mixed ambiguous source with weak or implicit connections.

Expected artifact checks:

### Autodesk Standards-Style DOCX

- mind map
- knowledge graph
- checklist
- SME questions
- source coverage report

### Procedure/SOP PDF

- flow chart
- checklist
- tasks
- implementation handoff package

### Meeting Notes TXT/MD

- knowledge graph
- open questions
- task candidates
- implementation handoff package

### Software Inventory CSV/Table

- table
- rendered charts:
  - category counts
  - status matrix
  - task readiness chart
- source coverage or data provenance summary

### Mixed Ambiguous Source

- weak-connection knowledge graph
- missing information report
- SME questions
- assumptions clearly marked `needs_review`

Agents should add fixture-specific assertions where practical. At minimum, each
fixture should define expected artifact types, required metadata, and known
review/uncertainty behavior.

## Acceptance Criteria

This roadmap is complete when:

- Users can request outputs other than mind maps and understand what AI is
  generating.
- Users can represent a workspace as a think space with visual artifacts such
  as flow charts, tables, and rendered charts where useful.
- Users can inspect non-hierarchical connections in a Knowledge Graph /
  Connections view.
- The app clearly distinguishes projected views from AI-enriched or newly
  generated artifacts.
- When filters or views lack required fields, the app offers enrichment or
  reprompting instead of silently showing misleading empty states.
- Artifact types are registered with required inputs, schemas, preview
  components, accept behavior, export behavior, and validation rules.
- Knowledge graph relationships are typed, confidence-scored, and source- or
  assumption-backed.
- Visual artifacts reference canonical nodes, edges, source chunks, or accepted
  artifact data.
- Charts require structured or extracted data and expose the data/provenance
  used to render them.
- AI output acceptance shows a preview diff before mutating the canonical
  workspace.
- Generation scope is explicit and persisted for every generated artifact.
- Implementation handoff packages can be generated from accepted structure.
- AI outputs have preview/review/accept/applied states.
- Map, Outline, Table, and Tasks are clearly views over the graph.
- Filters are visible, composable, and resettable.
- Nudges appear by default but are subtle and actionable.
- Users can turn all nudges off in Settings.
- Users can disable nudge categories without hiding validation errors.
- Nudge actions take users to the correct node, view, panel, or output preview.
- Tests cover output contracts, nudge projection, settings persistence, and
  browser-level nudge behavior.

## Non-Goals

- Autonomous background AI mutation.
- Replacing the graph with separate output silos.
- Full project management suite behavior.
- Multiplayer or notification delivery.
- Hiding validation errors under the nudge preference.

## Release Risk Notes

- Do not let "filters" mutate graph data.
- Do not let "view" labels imply generation.
- Do not let unregistered artifact types appear in backend prompts or frontend
  preview code.
- Do not accept untyped knowledge graph edges.
- Do not let visual artifacts become detached from canonical workspace data
  unless marked `draft` or `export_only`.
- Do not render charts from prose without an extracted-data preview.
- Do not accept generated output without a preview diff.
- Do not pretend every filter works on every artifact. If required metadata is
  missing, show the gap and offer enrichment.
- Do not make automation the primary answer to unclear structure. Prefer
  explicit user-invoked actions such as "Find connections" or "Create flow
  chart" before any automation layer.
- Do not introduce background automation until previews, validation, and
  implementation handoff packages are reliable.
- Do not collapse knowledge graph, mind map, and flow chart into one generic
  graph view. They answer different user questions.
- Do not let generated checklist/tasks drift outside canonical node metadata.
- Do not hide important validation failures when nudges are disabled.
- Do not overwhelm the canvas with floating UI. Prefer compact summaries,
  badges, and panel affordances.
