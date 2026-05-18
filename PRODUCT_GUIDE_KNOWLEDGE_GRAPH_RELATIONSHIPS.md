# Product Guide: Knowledge Graph Relationships

## Purpose

Knowledge graph relationships help users understand how accepted workspace
items depend on, support, conflict with, measure, approve, own, or create risk
for each other. The feature should make cross-branch meaning reviewable without
turning the main workspace hierarchy into a tangled source of truth.

## Target Users

- Operators and project leads who need to see dependencies, risks, blockers,
  metrics, ownership, and approvals across a plan.
- Analysts who need to explain why two accepted nodes are related.
- Reviewers who need confidence, rationale, source signal, and source refs
  before treating a relationship as reliable.

## Source And Data Expectations

- Hierarchy edges describe structure only.
- Semantic relationship edges describe meaning across or within branches.
- Relationship edges may be source-backed, AI-inferred, or manually reviewed.
- Prompt-only graphs may leave source refs empty, but must preserve assumptions,
  review state, and rationale.

## Review Language

Use relationship-family language in user-facing review surfaces:

- Risks
- Dependencies
- Conflicts
- Evidence
- Ownership
- Approvals
- Metrics
- Associations

Avoid implying that AI-inferred relationships are canonical facts. Prefer
"reviewable relationship", "source signal", "rationale", and "needs review"
until a user accepts or marks the edge reviewed.

## Valid Outputs

- Connections table grouped by relationship family.
- Knowledge graph canvas with semantic edge lenses and focus behavior.
- Edge inspector with relationship family, support status, rationale, and
  source/reference context.
- Markdown relationship review export grouped by family for stakeholder review.

## Safety Boundaries

- Do not use semantic edges to determine hierarchy, branch roots, or child
  traversal.
- Do not let cross-links create cycles in structural projections.
- Do not invent citations for prompt-only relationship graphs.
- Keep unsourced or AI-inferred relationships visibly reviewable.

## Validation Intent

Tests should prove that:

- Hierarchy edges are excluded from relationship-review exports.
- Semantic edges are grouped by family with stable labels.
- Markdown exports include scope, relationship counts, confidence, review state,
  source signal, rationale, edge id, and source refs when available.
- Source-repair and task projections do not walk semantic back-links as parents.
