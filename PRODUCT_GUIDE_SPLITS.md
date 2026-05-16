# Product Guide Splits

This note identifies where TraceSpace needs a product guide versus where the
engineering roadmap is enough.

Use a product guide when a capability defines repeatable product behavior:
target users, source/data expectations, review language, safety rules, output
contracts, and validation intent.

Use the roadmap when the work is mainly delivery tracking: tests, endpoints,
UI polish, live verification, cleanup, or implementation sequencing.

## Already Split Out

### Product Guide Index

Guide:

- `PRODUCT_GUIDES.md`

Why it exists:

- TraceSpace has several product lanes, not one dominant use case.
- The guide index keeps software inventory from looking like the main product.
- It makes source-set review, Ask AI drafting, structured outputs, enterprise
  readiness, code intelligence, and external handoffs visible as first-class
  capabilities.

Roadmap should track:

- Delivery status and verification for each guide.

### Software Inventory And Overlap

Guide:

- `PRODUCT_GUIDE_SOFTWARE_INVENTORY.md`

Why it needs a guide:

- It has its own user group, source types, graph model, scoring language, and
  review safety rules.
- It must stay framed as potential overlap, not automatic duplicate detection.
- Future implementation should preserve the intent around evidence, scoring,
  assumptions, and owner review.

Roadmap should track:

- Realistic CSV/XLSX fixtures.
- End-to-end Software Inventory -> Software Overlap -> review -> accept tests.
- Export and monday handoff hardening.

### Source-Set And Folder Completeness Review

Guide:

- `PRODUCT_GUIDE_SOURCE_SET_REVIEW.md`

Why it needs a guide:

- It is a repeatable source-library capability, not just an ingestion feature.
- It has domain-sensitive review language: missing, partial, stale,
  contradictory, duplicate, and source-only material.
- It needs clear expectations for folder-relative paths, document
  classification, expected artifacts, coverage scoring, and SME questions.

Roadmap should track:

- Folder/file-set fixture coverage.
- Completeness scoring.
- Browser validation of folder-style workflows.
- Export/report polish.

### Ask AI Draft Sessions

Guide:

- `PRODUCT_GUIDE_ASK_AI_DRAFT_SESSIONS.md`

Why it needs a guide:

- Ask AI is becoming a core product interaction model, not a single feature.
- It defines how users create, revise, compare, accept, merge, reject, and
  preserve AI-generated work.
- It needs durable language around preview-first mutation, source scope,
  accept modes, draft history, model policy, and review states.

Roadmap should track:

- Retrieval/ranking and token budget policy.
- Browser save/reload verification.
- Follow-up UX polish.
- Remaining migration from legacy/source-specific preview panels.

### External Handoffs: Miro And monday.com

Guide:

- `PRODUCT_GUIDE_EXTERNAL_HANDOFFS.md`

Why it needs a guide:

- These integrations must remain projections, not canonical graph stores.
- The product rules are subtle: dry-run first, confirmation before writes,
  preserve internal IDs, persist external refs, and do not allow pullbacks to
  overwrite canonical graph fields without review.
- Miro and monday are enterprise adoption infrastructure, not cosmetic export
  buttons.
- Miro and monday have different product meanings: Miro is collaboration and
  review visualization; monday is execution and task tracking.

Roadmap should track:

- Live credential smoke tests.
- Endpoint coverage.
- Payload mapping details.
- Import/pullback backlog.
- Conflict-handling work.

### Enterprise Readiness And Operating Graphs

Guide:

- `PRODUCT_GUIDE_ENTERPRISE_READINESS.md`

Why it needs a guide:

- This is an intent pack family: process bottlenecks, ownership gaps,
  unsupported critical systems, operating model visibility, stakeholder review
  packages, and phased improvement plans.
- It needs clear product boundaries so TraceSpace does not become a generic
  consulting-deck generator.
- It depends on ontology, confidence, source-backed findings, review burden,
  owner decisions, and handoff packages.

Roadmap should track:

- Additional artifact types.
- Enterprise scoring dimensions.
- Guided prompts.
- Executive package exports.
- Review-ready appendices.

### Code Intelligence

Guide:

- `PRODUCT_GUIDE_CODE_INTELLIGENCE.md`

Why it needs a guide:

- It is a developer-only capability with different safety and visibility rules.
- It needs clear boundaries around local repository scanning, allowlists,
  read-only defaults, code evidence, generated roadmaps, and GitHub issue
  candidates.
- It should not bleed into standard user workflows, Workspace Brief presets, or
  non-developer copy.

Roadmap should track:

- Capability gating.
- Repo scan tests.
- Refactor roadmap artifacts.
- GitHub issue candidate preview.
- Security and allowlist hardening.

### Structured Work Outputs

Guide:

- `PRODUCT_GUIDE_STRUCTURED_WORK_OUTPUTS.md`

Why it needs a guide:

- Roadmaps, SOPs, checklists, training outlines, task plans, and implementation
  packages are the practical work products users get from the graph.
- These outputs need clear source, assumption, owner, evidence, and review
  rules.
- The app should not stop at making visual structure; it should help teams
  produce usable work.

Roadmap should track:

- Output-specific UI polish.
- Export snapshots.
- Presentation sections.
- Branch-to-output-to-handoff browser flows.

## Probably Roadmap-Only For Now

### Neutral Exports

Why roadmap is enough:

- The product rule is simple: neutral exports project accepted graph state.
- The remaining work is mostly format coverage, snapshot tests, and UI polish.

Create a guide only if exports become user-configurable reporting products with
their own templates and review semantics.

### Local Views: Map, Outline, Table, Tasks, Connections

Why roadmap is enough:

- These are projections of the canonical graph.
- The product intent is already covered by the canonical graph rule.

Create a guide only if one view becomes a standalone workflow with unique review
language or acceptance rules.

### Model Provider Refactor

Why roadmap is enough:

- This is primarily architecture and deprecation work.
- The product behavior is already governed by source citation, schema validity,
  and preview-first mutation rules.

### Live Smoke Tests And Release Verification

Why roadmap is enough:

- These are acceptance gates, not product capabilities.
- Keep them in `ROADMAP.md` and release notes.

## Possible Future Guides

### Team Roadmap

Create a guide if roadmap generation becomes a repeated product lane with
specific outputs, decision language, stakeholder review packages, and source
appendix expectations.

For now, keep it in the roadmap unless users begin treating it as its own
workflow.

### SOP, Checklist, And Training Guide

Create a guide if training/onboarding becomes a first-class TraceSpace pack.
Until then, roadmap tracking is enough because these are projections over
accepted structure.

### Revit/BIM Standards

Create a guide only if this becomes a named vertical solution. The reusable
product lane is currently better captured by Source-Set And Folder Completeness
Review.

## Maintenance Rule

When adding a new product guide:

1. Link it from `README.md`.
2. Add a short status pointer in `ROADMAP.md`.
3. Keep implementation tasks in the roadmap, not the guide.
4. Keep product rules, review language, data expectations, and validation
   intent in the guide.
