# Source-Set And Folder Completeness Product Guide

This guide defines TraceSpace source-set review: turning folders, standards
libraries, policy sets, and mixed source packages into a source-cited
completeness review.

## Purpose

TraceSpace should help users understand what is present, missing, stale,
contradictory, duplicated, or weakly supported across a source set.

The goal is not to summarize a folder. The goal is to produce an auditable
review of source coverage and missing work.

## Target Users

- Practice, BIM, VDC, standards, and operations leaders reviewing source
  libraries.
- Project or program teams comparing expected artifacts with what exists.
- SMEs who need focused questions instead of a raw folder dump.
- Reviewers preparing roadmap, training, SOP, or handoff outputs from source
  packages.

## Supported Sources

Useful source material includes:

- Standards folders.
- SOP and workflow folders.
- Policy libraries.
- Project closeout or lessons-learned folders.
- Revit/BIM standards, templates, content lists, and QA/QC notes.
- Markdown, TXT, DOCX, PDF, CSV, and other parsed source records.

Folder-relative paths matter. TraceSpace should preserve them wherever possible
so findings can point back to specific files.

## Review Model

The source-set review should classify:

- Document inventory.
- Document type and role.
- Covered topics.
- Partial topics.
- Missing expected artifacts.
- Stale or outdated material.
- Duplicated or overlapping files.
- Contradictions.
- Source-only material not yet represented in the graph.
- SME questions.

Preferred language:

```text
Coverage gap
Needs owner review
Missing expected artifact
Potential duplicate source
Possible contradiction
```

Avoid unsupported language:

```text
This folder is complete.
This standard is wrong.
Delete this source.
```

## Expected Outputs

TraceSpace should support:

- Folder inventory.
- Source-set review report.
- Source coverage report.
- Missing information report.
- SME question list.
- Completion roadmap.
- Task/checklist candidates.
- Source-backed graph structure.

## Validation Intent

Validate with realistic folder-style fixtures:

1. Upload or attach multiple files with folder-relative paths.
2. Confirm source metadata and chunks preserve file identity.
3. Generate a source-set review.
4. Confirm documented, partial, missing, duplicate, stale, and contradictory
   findings are separated.
5. Confirm every specific finding has source refs or is marked as an assumption
   or review question.
6. Confirm accepted findings can become roadmap, task, checklist, or graph
   structure without losing source provenance.

## Future Roadmap

- Add stronger expected-artifact templates by domain.
- Add richer folder comparison fixtures.
- Add completeness scoring with transparent factors.
- Add browser e2e validation for source-set upload to review to accepted
  outputs.
- Add exportable review packets for SMEs and stakeholders.
