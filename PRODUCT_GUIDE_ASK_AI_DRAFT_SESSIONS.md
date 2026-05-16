# Ask AI Draft Sessions Product Guide

This guide defines Ask AI as TraceSpace's main drafting and mutation surface.

## Purpose

Ask AI should let users turn selected context into reviewable work without
silently changing the accepted workspace.

The goal is not a chat box bolted onto a graph. The goal is a draft workspace
where AI can propose structure, users can revise it, and only accepted changes
enter the canonical graph.

## Target Users

- Users shaping messy source material into structure.
- Reviewers converting selected nodes, branches, sources, or whole workspaces
  into outputs.
- SMEs repairing gaps, reviewing assumptions, and accepting only trusted work.
- Enterprise users who need traceable AI assistance before handoff to existing
  systems.

## Supported Scopes

Ask AI should support:

- Whole workspace.
- Selected node.
- Selected branch.
- Selected source.
- Multiple selected sources.
- Added source context.
- Custom prompt with explicit output shape.

## Product Rules

- AI graph-changing work is draft-first.
- Drafts can be revised conversationally.
- Drafts preserve source scope and session history.
- The canonical graph changes only after explicit acceptance.
- Unsourced or inferred additions are marked `needs_review`.
- Accept modes must be clear: append, merge, replace selected branch, or attach
  artifact.
- Rejected drafts should not mutate saved graph state.

Preferred language:

```text
Draft
Preview
Accept
Needs review
Source-scoped
Assumption
```

Avoid language that implies automatic authority:

```text
Fixed
Approved
Final
Synced
```

## Expected Outputs

Ask AI should produce reviewable artifacts such as:

- Graph patches.
- Relationship edges.
- Source coverage reports.
- Tables.
- Tasks.
- Checklists.
- Flowcharts.
- Team roadmaps.
- Training outlines.
- SOP drafts.
- Implementation handoff packages.
- Software overlap reports.
- SME questions.

## Validation Intent

Validate with browser and backend tests that:

1. Every scope sends the intended context.
2. Draft session state persists across revisions.
3. Accepting a draft mutates the graph only through the accepted path.
4. Rejecting or closing a draft leaves the graph unchanged.
5. Source refs, assumptions, review state, and artifact type survive save and
   reload.
6. Legacy one-shot flows do not bypass draft-first mutation.

## Future Roadmap

- Improve retrieval and ranking policy.
- Add richer side-by-side diff review.
- Add output-shape specific accept controls.
- Add draft history and compare views.
- Retire remaining legacy preview panels once draft sessions cover their
  behavior.
