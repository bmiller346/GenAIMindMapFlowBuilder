# Structured Work Outputs Product Guide

This guide defines TraceSpace outputs that turn accepted structure into
roadmaps, SOPs, checklists, training guides, tasks, executive summaries,
news/article drafts, and implementation packages.

## Purpose

TraceSpace should help teams move from messy source material to work products
that people can use.

The goal is not only to make a graph. The graph should become reviewable,
source-backed work: plans, procedures, training, checklists, and handoff
packages.

## Target Users

- Teams converting source material into execution plans.
- SMEs producing SOPs or training from standards.
- Project leads creating team roadmaps.
- Operations teams preparing implementation packages.
- Reviewers who need source-backed tasks and decisions.

## Supported Work Products

TraceSpace should support:

- Team roadmap.
- SOP draft.
- Process flow.
- Checklist.
- Task list.
- Training outline.
- Knowledge graph.
- Table or matrix.
- Executive summary or leadership decision memo.
- Internal news/article draft.
- Implementation handoff package.
- SME question list.

## Product Rules

- Outputs are projections or accepted artifacts from the canonical graph.
- Source-backed facts should keep source references.
- Assumptions must be labeled.
- Review state should survive export.
- Roadmaps should separate facts, decisions, risks, dependencies, milestones,
  and next actions.
- SOPs should include scope, prerequisites, steps, controls, exceptions, and
  evidence.
- Checklists should include pass/fail intent, evidence expectations, owners,
  and exceptions when available.
- Training guides should include audience, goals, modules, practice activities,
  examples, and checks for understanding.
- Executive summaries should read like leadership decision memos: decision
  requested, why now, scope, expected value, governance/risk controls,
  planning-level assumptions, success metrics, and decision gate.
- Internal news/article drafts should separate source-backed facts from
  assumptions and keep publication/date/stakeholder claims marked for review
  unless supported by supplied evidence.
- Implementation packages should include ready items, blocked items, owners,
  dependencies, risks, assumptions, source refs, and handoff candidates.

## Expected Outputs By Scenario

Complex issue to roadmap:

- Plain-language context.
- Workstreams.
- Decisions needed.
- Dependencies.
- Risks.
- Milestones.
- 30/60/90 next actions.
- Source-backed appendix.

SOP to checklist:

- Ordered checks.
- Acceptance criteria.
- Evidence requirements.
- Exceptions.
- Owner placeholders.
- Review flags.

Training outline:

- Audience.
- Learning goals.
- Module sequence.
- Examples.
- Practice activities.
- Checks for understanding.
- SME questions.

Implementation handoff:

- Scope summary.
- Ready items.
- Blocked items.
- Task candidates.
- monday candidates.
- Miro candidates.
- Risks and assumptions.

Executive summary or news/article draft:

- Recommendation or publication angle.
- Source/evidence mode.
- Citation policy.
- Key points or sections.
- Source-backed appendix when available.
- Assumptions and review flags.
- Copy/export-ready Markdown.

## Validation Intent

Validate that structured outputs:

1. Can be generated from selected source, branch, or workspace context.
2. Stay draft-first until accepted.
3. Preserve source refs and review state.
4. Export cleanly to Markdown/CSV/JSON where applicable.
5. Can feed monday or Miro handoff when reviewed.
6. Do not invent owners, approvals, or dates without marking assumptions.
7. Preserve evidence mode, citation policy, cited refs, assumptions, and review
   state in preview, copied Markdown, accepted artifacts, and exported Markdown.

## Future Roadmap

- Add stronger artifact-specific UI for roadmap, SOP, and training outputs.
- Add presentation-section export for roadmap packages.
- Add checklist and SOP export snapshots.
- Add templates for enterprise handoff packets.
- Add browser tests for branch-to-output-to-handoff flows.
- Treat SharePoint as a future integration. Current internal-news workflow is
  copy/export-ready Markdown for manual SharePoint publishing; future work may
  add SharePoint retrieval, page creation, or source citation import if/when
  authentication, tenant policy, and review semantics are defined.
