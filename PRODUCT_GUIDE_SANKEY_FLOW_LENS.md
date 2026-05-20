# Product Guide: Sankey Flow Lens

## Purpose

The Sankey flow lens helps users understand directional movement through a
workspace: evidence moving into claims, claims moving into outputs, tasks
moving across owners or states, process handoffs, dependencies, budget/time
allocation, and structured query results with weighted source-to-target rows.

This is a lens over accepted graph and structured data, not a separate diagram
state. It should answer questions such as:

- Where did this conclusion come from?
- Which sources support the most downstream work?
- Where is effort, ownership, risk, or cost concentrated?
- Which handoff paths are thin, overloaded, unsupported, or blocked?
- What flows changed after adding a new source or accepting a draft?

For user-facing testing steps and prompt examples, see
`HELP_SANKEY_FLOW_LENS.md`.

## Target Users

- Analysts tracing evidence from source material into findings and outputs.
- Operators reviewing handoffs, dependencies, owners, and blocked work.
- Project leads comparing effort, risk, status, or ownership flow across
  workstreams.
- Reviewers who need to spot unsupported or low-confidence flow paths before
  accepting an output.
- Data users querying CSV/SQL results that naturally form source, target, and
  value relationships.

## Source And Data Expectations

A Sankey projection requires directional rows or graph edges with:

- Source entity or node.
- Target entity or node.
- Weight, count, score, effort, cost, confidence, or another numeric value.
- Optional group/category, status, owner, risk, source refs, and review state.

Valid inputs include:

- Accepted graph edges with relationship metadata and optional weight.
- Source refs connecting documents/chunks to accepted nodes or artifacts.
- Structured data artifacts with source/target/value columns.
- SQL query results that return directional weighted rows.
- AI draft artifacts only after review, or as clearly labeled preview state.

Prompt-only or inferred flow rows may exist, but they must be marked as
assumptions or `needs_review` until accepted.

## Review Language

Use flow-review language, not generic chart language:

- Flow path
- Source path
- Evidence flow
- Handoff path
- Dependency flow
- Ownership flow
- Effort flow
- Value flow
- Unsupported path
- Low-confidence path

Avoid implying that width means truth. Width should mean the selected metric:
count, weight, cost, effort, confidence, or another explicitly named value.

## Valid Outputs

- Sankey canvas lens for eligible workspace graph paths.
- Structured-data Sankey chart for query results with source/target/value
  columns.
- Flow path detail panel showing source, target, value, review state, source
  refs, and rationale.
- Table filter driven by clicked Sankey node or band.
- Graph highlight driven by clicked Sankey node or band.
- Markdown/JSON export of Sankey flow rows and review notes.

## UI Rules

- Do not make Sankey a default canvas tab until the workspace has eligible
  directional weighted data.
- Surface it as a lens or output when TraceSpace can explain why it is
  available.
- Empty states must name the missing shape: source, target, and value.
- The selected value metric must be visible near the diagram.
- Band click should filter or inspect; it should not mutate graph state.
- Full source/rationale details belong in the existing inspection/review
  surfaces, not in floating popups.
- For dense diagrams, provide metric, family, status, and review filters before
  trying to show every path.

## Safety Boundaries

- Sankey paths do not define hierarchy.
- Sankey paths do not replace semantic relationship edges.
- Sankey weights must not be inferred from visual width after rendering; the
  underlying metric must stay inspectable.
- Unsupported, AI-inferred, or prompt-only paths must remain visibly reviewable.
- Do not fabricate numeric weights. If no value exists, use count-based flow and
  label it as count.
- Do not combine unrelated metrics in one diagram without an explicit metric
  selector.

## Query Experience

The Sankey lens should support query-style questions:

- Show source-to-output evidence flow.
- Show owner-to-status task flow.
- Show risk-to-control coverage flow.
- Show system-to-process dependencies.
- Show source document to accepted node coverage.
- Show SQL result flow by selected source/target/value columns.

Ask AI can help propose Sankey mappings, but the user should see the proposed
columns, metric, assumptions, and unsupported paths before accepting any graph
change.

## Implementation Roadmap

### 1. Product Contract And Detection

- Register Sankey as a flow lens/output contract.
- Detect eligible structured data columns: source, target, value, plus optional
  group, status, owner, risk, confidence, and source refs.
- Detect eligible graph projections: source refs to nodes, semantic edges with
  weights, task owner/status transitions, and dependency/handoff paths.
- Add empty-state copy for missing source, target, or value.

### 2. Structured Data Sankey Preview

- Extend chart artifact handling to allow `chart_spec.chart_type = "sankey"`.
- Render with existing Plotly dependencies.
- Keep source table rows, query id, result hash, source refs, and review state
  attached to the chart artifact.
- Add click-to-filter behavior for rows represented by selected Sankey nodes or
  bands.

### 3. Workspace Flow Lens

- Add a Sankey projection helper that reads from canonical nodes, edges,
  source refs, and accepted artifacts.
- Provide metric modes: count, confidence, effort, cost, risk score, or explicit
  structured-data value when present.
- Keep the lens optional and available only when eligible flow paths exist.
- Add detail inspection for selected flow paths.

### 4. Review And Export

- Add Markdown/JSON export for Sankey flow rows, selected metric, source refs,
  unsupported paths, and review notes.
- Add review filters for unsupported, low-confidence, missing owner, blocked,
  high-risk, and selected source.
- Preserve accepted Sankey artifact metadata through save/reopen.

### 5. AI-Assisted Mapping

- Teach Ask AI/Data Interpreter to propose Sankey mappings when source/target
  relationships are likely.
- Require preview-first acceptance for inferred paths or generated weights.
- Add source-scoped prompts for evidence-flow, owner-flow, dependency-flow, and
  structured-query Sankey outputs.

## Validation Intent

Tests should prove that:

- Sankey eligibility requires source and target plus a countable or numeric
  metric.
- Sankey projection does not alter hierarchy or canonical graph state.
- Unsupported inferred paths stay marked `needs_review`.
- Chart artifacts preserve query id, result hash, source refs, and selected
  metric.
- Clicked Sankey nodes/bands can filter represented rows without losing source
  context.
- Markdown/JSON exports include flow rows, value metric, review state, and
  source refs.
