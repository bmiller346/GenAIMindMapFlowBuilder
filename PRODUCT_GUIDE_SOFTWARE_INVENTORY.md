# Software Inventory And Overlap Product Guide

This guide captures the product intent for TraceSpace software inventory,
overlap, and rationalization work. The roadmap tracks delivery. This document
defines what the capability is supposed to mean so future changes do not drift
into a generic duplicate-finder.

## Purpose

TraceSpace should help reviewers turn messy software lists, standards folders,
ServiceDesk notes, license exports, security reviews, and team knowledge into a
source-cited software inventory graph.

The goal is not to automatically declare that two applications are duplicates.
The goal is to surface potential overlap with evidence, confidence, transparent
score factors, assumptions, and owner-review questions.

## Target Users

- IT reviewers who need software visibility across teams.
- BIM, design technology, or practice leaders who need to understand tool use.
- Application owners who need reviewable rationalization candidates.
- Finance or license reviewers who need cost and utilization signals.
- Security or governance reviewers who need approved-tool guidance.

## Supported Sources

Useful source material includes:

- Application inventory spreadsheets.
- License, seat, usage, or cost exports.
- ServiceDesk request catalogs and ticket summaries.
- Approved software lists and security review records.
- Department or practice tool standards.
- Workflow documentation that references applications.
- Notes from SMEs or application owners.

TraceSpace should preserve source references when the source path supports them.
Unsourced or inferred findings must remain `needs_review`.

## Inventory Fields

The capability becomes more useful when software records include:

- Application name.
- Vendor.
- Category.
- Business function.
- Standard use case.
- Supported workflows.
- Used-by team, department, practice, or role.
- Owner or owning group.
- Approved status.
- Security status.
- License type.
- Cost, seat count, or usage count.
- Integrations.
- Replacement, retired, rejected, or exception status.
- ServiceDesk request path or ticket volume.

The system should tolerate partial records, but weak records should produce
lower-confidence overlap findings and review questions.

## Graph Model

Software inventory should be represented as a knowledge graph, not only a mind
map.

Common node/entity types:

- `application`
- `system`
- `software_vendor`
- `software_license`
- `software_use_case`
- `integration`
- `capability`
- `team`
- `business_unit`
- `owner`
- `cost`

Common relationship types:

- `supports`
- `used_by`
- `owns`
- `depends_on`
- `approved_for`
- `has_license_type`
- `requested_through`
- `integrates_with`
- `overlaps_on`
- `duplicates`
- `replaces`
- `replaced_by`

Use `overlaps_on` for reviewable overlap signals. Reserve `duplicates` for
stronger evidence, and still require owner review before treating the finding as
a decision.

## Overlap Scoring

AI may propose overlap candidates, but TraceSpace should compute or normalize a
deterministic score from inventory fields.

Positive score factors:

- Shared category.
- Shared business function.
- Shared workflow.
- Shared user group or department.
- Shared integration.
- Shared vendor.
- Shared license type.
- Both tools are paid, licensed, or seat-based.
- Usage, seat, or ServiceDesk signals exist.

Negative score factors:

- One tool is marked standard and another is marked exception.
- One tool is retired, rejected, deprecated, decommissioned, or replaced.
- Replacement status indicates planned lifecycle sequencing rather than active
  duplication.

Score output should include:

- Normalized `score` from `0..1`.
- `confidence_band`: high, medium, or possible.
- `scoring_factors` with weights and evidence.
- Conservative duplicate assessment.
- `review_state`, normally `needs_review`.

The system must not make irreversible rationalization decisions from the score.

## Review Language

Preferred language:

```text
Potential overlap detected
```

Avoid unsupported language:

```text
These tools are duplicates.
This application should be retired.
```

Recommended finding structure:

- Candidate applications.
- Shared capabilities or workflows.
- Evidence and source references.
- Score and confidence band.
- Assumptions.
- Recommended owner review.
- Questions to resolve standard, exception, license, and usage decisions.

## Expected Outputs

TraceSpace should support these outputs:

- Software overlap report.
- Duplicate capability report.
- Approved tool matrix.
- Retired or replacement candidates.
- ServiceDesk request guidance gaps.
- License rationalization candidates.
- SME or owner review questions.
- monday cleanup tasks.
- Knowledge graph connections with accepted `overlaps_on` edges.

## Current Implementation

Implemented core support includes:

- Software inventory workspace preset.
- Enterprise tool rationalization prompt profile and action.
- `software_overlap_report` artifact contract.
- Software inventory ontology entities and relationship types.
- Deterministic overlap scoring helper.
- Validation that keeps inferred or weak candidates reviewable.
- Frontend review surfacing for potential overlap candidates, scores, factors,
  recommendations, evidence, and review state.
- Acceptance of software overlap report relationship edges into the canonical
  graph after review.

## Validation Plan

Before calling this production-ready, validate with at least one realistic
software inventory scenario:

1. Upload or create a source-backed inventory with applications, owners,
   categories, workflows, licenses, and statuses.
2. Generate a Software Inventory workspace brief.
3. Run Software Overlap from the Connections or Ask AI flow.
4. Confirm the report shows potential overlaps with deterministic score
   factors.
5. Confirm weak or inferred candidates remain `needs_review`.
6. Accept a reviewed overlap edge and verify it appears in the canonical graph.
7. Export or hand off review actions as tasks.

Recommended fixture pair:

```text
Bluebeam
Adobe Acrobat
```

Use shared PDF markup/review workflows, paid licensing, design/admin user
groups, and standard/exception guidance to verify scoring behavior.

## Known Limitations

- The quality of scoring depends on the quality of extracted inventory fields.
- There is not yet a dedicated import normalizer for license-utilization,
  ServiceDesk, or security-review exports.
- There is not yet a full end-to-end Playwright test covering the complete
  Software Inventory brief to overlap acceptance flow.
- There is not yet a dedicated standalone software-overlap dashboard; the
  current experience uses the AI draft/review flow and graph connections.

## Future Roadmap

- Add realistic CSV/XLSX software inventory fixtures.
- Add a Playwright e2e flow for Software Inventory -> Software Overlap ->
  review -> accept edge.
- Normalize license and usage fields from common exports.
- Add a compact approved-tool matrix view.
- Add markdown/CSV export for software overlap reports.
- Add monday cleanup task templates for owner review, license utilization, and
  approved-tool guidance updates.
