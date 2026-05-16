# External Handoffs Product Guide

This guide defines TraceSpace handoff to Miro, monday.com, and neutral export
formats.

## Purpose

TraceSpace is supplemental for enterprise teams. It creates source-grounded
structure and reviewable work, but enterprise execution often happens in tools
that are already adopted.

Miro and monday.com are therefore not minor exports. They are bridge points
that let TraceSpace output become useful inside existing collaboration,
review, tracking, and governance workflows.

This is the practical enterprise path: TraceSpace should not pretend to replace
the systems companies already use to automate, assign, and track work. It
should create source-grounded, reviewed structure and then hand the right slices
to those systems cleanly.

## Target Users

- Enterprise teams that already manage execution in monday.com.
- Stakeholders and SMEs who review visually in Miro.
- Program managers who need reviewed work translated into trackable tasks.
- Operations, BIM, IT, or transformation teams that need traceability before
  work leaves TraceSpace.

## Product Position

TraceSpace remains the canonical source-grounded workspace.

Miro is for:

- Visual review.
- Stakeholder alignment.
- Workshop maps.
- Architecture, dependency, or process visualization.
- Comments and collaboration around accepted structure.

monday.com is for:

- Task tracking.
- Owner assignment.
- Due dates, priority, and status.
- Cleanup or implementation queues.
- Follow-up work after TraceSpace review.

Neutral exports are for:

- Audit packets.
- Offline review.
- Markdown, JSON, CSV, OPML, Mermaid, PNG, and SVG delivery.

## Product Rules

- Handoffs are projections of accepted TraceSpace graph state.
- External systems are not canonical graph stores.
- Pushes require validation and user confirmation.
- Dry-run or preview should happen before external writes.
- Internal node IDs must be preserved in payloads and external metadata.
- Returned external IDs should be stored as integration metadata.
- Pullbacks may annotate graph nodes with external status projections.
- Pullbacks must not overwrite canonical graph fields without a user-reviewed
  accept path.

## Expected Outputs

TraceSpace should support:

- Branch-to-Miro visual handoff.
- Workspace-to-Miro review board.
- Branch-to-monday task handoff.
- Existing monday board/group export.
- monday status projection preview.
- Implementation handoff package.
- Handoff readiness review.
- Export batch metadata and audit trail.
- TraceSpace-to-enterprise follow-up queue: what is ready, what is blocked, and
  what still needs owner review before it becomes trackable work.

## Review Language

Preferred language:

```text
Ready for handoff
Needs handoff review
Staged for monday
Preview before push
External status projection
```

Avoid language that implies uncontrolled sync:

```text
Synced source of truth
Auto-updated canonical status
Two-way overwrite
```

## Validation Intent

Validate with both transport-neutral tests and live credential smoke tests:

1. Build preview payloads from accepted graph state.
2. Confirm task, checklist, source, owner, due date, and priority fields map
   correctly.
3. Confirm the user must provide required board/group targets.
4. Confirm confirmation is required before item creation.
5. Push to live Miro and monday.com test destinations.
6. Persist external refs and export batch metadata.
7. Pull monday status as a projection without changing canonical node status.
8. Confirm external failures are recoverable and do not corrupt graph state.

## Future Roadmap

- Live Miro and monday.com smoke verification.
- Stronger handoff readiness UI.
- Enterprise template mapping for monday boards.
- Miro review metadata and comment pullback.
- Conflict review before any bidirectional sync.
- Optional Planner or other enterprise destination only if monday.com is not
  enough for the target company.
