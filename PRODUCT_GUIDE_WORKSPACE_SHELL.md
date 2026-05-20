# Product Guide: Workspace Shell And Ribbon

## Purpose

The workspace shell is the interaction frame for reviewing and editing the
canonical graph. It should make TraceSpace feel like a controlled authoring
workspace rather than a stack of independent popups.

The shell direction is:

```text
Sources -> Map -> AI proposals -> Review tray -> Accepted workspace -> Outputs
```

This guide defines the intended user experience. Delivery sequencing lives in
`UI_SHELL_RIBBON_REFACTOR_ROADMAP.md`.

## User Promise

Users should always know:

- What object or scope is selected.
- Where commands live.
- Where metadata is edited.
- Where AI proposals are reviewed.
- Whether a change has already affected the accepted workspace.

The map canvas should remain readable while the user reviews sources,
relationships, branch structure, and AI suggestions.

## Layout Contract

### Top Ribbon

The top ribbon owns durable commands.

Expected command groups:

- Workspace and selection basics: select, fit, clear selection, delete.
- Map controls: structure mode, relationship labels, branch colors, layout.
- AI actions: ask selected nodes, find connections, summarize branch, generate
  candidate changes.
- Review controls: source coverage, needs-review queues, confidence filters.
- Sources and outputs: manage sources, export, preview generated artifacts.

The ribbon can be contextual, but it should not hide the user's main mode. A
selected node, selected branch, selected source, or empty canvas should each
make the available commands clearer, not create another competing panel.

### Left Navigator

The left navigator owns orientation.

It may contain:

- Workspace outline.
- Source library.
- Branch tree.
- Saved views.
- Activity summaries.

It should not become a metadata editor or AI proposal review surface.

### Center Canvas

The canvas owns spatial understanding.

Allowed overlays:

- Lightweight selection toolbar.
- Drag and lasso selection affordances.
- Small edge or node affordances.
- Short-lived status messages.

Avoid placing persistent AI forms, metadata forms, or review queues over the
canvas.

### Right Properties Panel

The right panel owns metadata for the selected object.

Valid panel subjects:

- Node.
- Edge.
- Branch.
- Source.
- Workspace.

It should preserve editing behavior and source traceability, but it should not
host large AI draft review flows.

### Bottom Review Tray

The bottom tray owns reviewable work before it mutates the accepted workspace.

Valid tray subjects:

- AI draft previews.
- Find-connections candidates.
- Source coverage repair suggestions.
- Needs-review queues.
- Task readiness candidates.
- Task and checklist previews before acceptance.
- Output preview/apply flows.

AI can propose changes here. The accepted graph changes only after explicit
review and acceptance.

Accepted task work does not become tray-only. The Review Tray is for generated
task previews, readiness gaps, potential tasks, and accept/reject flows before
mutation. The structured canvas `Tasks` view remains the operational table over
accepted canonical task data. Likewise, Checklist Preview belongs in the bottom
Review Tray, while Checklist View and Checklist Artifact belong in the accepted
workspace/output layer after review.

### Overlay Layer

The overlay layer is reserved for:

- True modals.
- Menus.
- Popovers.
- Confirmations.

It should not host persistent workspace tools.

## Interaction Rules

1. Selecting a node should not open multiple large surfaces.
2. Metadata editing belongs in the right panel.
3. Reviewable AI output belongs in the bottom tray.
4. Workspace orientation belongs in the left navigator.
5. Map mode, lens, labels, branch colors, and layout belong in the ribbon.
6. Quick Ask AI for selected nodes can stay lightweight, but graph-changing
   work must stay preview-first.
7. Relationship labels are useful as a lens, not as permanent visual clutter.
8. Branch colors should help scan structure without overpowering node text.
9. Floating docks are transitional unless a specific utility window truly needs
   free placement.
10. The canonical graph remains the source of truth; shell state is layout
    state only.

## AI Workflow Language

Use clear product language:

- `Ask selected`
- `Find connections`
- `Review candidates`
- `Preview changes`
- `Apply to workspace`
- `Reject`
- `Keep as draft`

Avoid ambiguous language that makes users wonder whether AI has already changed
the map.

## Source And Review Language

Use source-grounded language:

- `Source-backed`
- `Needs review`
- `Coverage gap`
- `Relationship candidate`
- `Accepted relationship`
- `Confidence`
- `Rationale`

Avoid presenting inferred relationships as accepted facts until the user accepts
them.

## Design Boundaries

- Do not create a landing page or explanation-first screen for this work.
- Do not add more large floating surfaces.
- Do not combine metadata editing and AI proposal review in one crowded panel.
- Do not move canonical graph mutation earlier in the workflow.
- Do not make relationship labels always-on by default.
- Do not treat Miro, monday.com, or exports as the canonical workspace.

## Validation Intent

The shell direction is valid when users can complete these workflows without
panel collisions:

- Upload source, generate map, review source-backed structure.
- Select several nodes, ask a quick question, return to the canvas.
- Select a branch, see branch context, and inspect its relationships.
- Run Find connections, review candidates, accept only selected relationships.
- Edit node metadata while still seeing enough map context.
- Switch relationship lenses without losing the readable mind map hierarchy.
- Export an output without covering unrelated metadata or AI panels.

## Roadmap Link

Implementation sequencing, agent ownership, and regression checklists live in:

- `UI_SHELL_RIBBON_REFACTOR_ROADMAP.md`
