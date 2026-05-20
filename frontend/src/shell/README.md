# UI Shell Contract

The shell is an opt-in compatibility scaffold behind `VITE_ENABLE_UI_SHELL_RIBBON` or localStorage `docmap.uiShellRibbon.enabled`.

## Slots

- `ribbon`: fixed top command area.
- `leftPanel`: workspace navigation rail.
- `centerCanvas`: existing graph/canvas app surface.
- `rightPanel`: selected item properties.
- `statusBar`: lightweight workspace context and temporary view overrides.
- `bottomTray`: reviewable/generated work.
- `overlayLayer`: future modal/popover host.

`WorkspaceShell` exposes `data-has-left-panel`, `data-has-right-panel`, `data-has-bottom-tray`, and `data-has-status-bar` so tests and downstream lane owners can assert the mounted slot contract without depending on CSS class names.

## Empty State Policy

Closed optional slots collapse by default. A lane should pass `rightPanelPlaceholder` or `bottomTrayPlaceholder` only when it intentionally wants an empty visible surface.

## Ownership Boundaries

Shell/Foundation owns slot markup, shell-level CSS variables, responsive scaffold behavior, and feature-flag integration. It should not move graph logic, AI workflows, inspectors, source parsing, LocalViews behavior, or panel routing authority. Those migrations belong to their lane owners.

In shell mode, right-rail routing authority lives in `shellStore.rightPanel`.
Node, edge, source, and branch properties render from that route. AI Helpers /
Next Steps uses `rightPanel.kind === 'guide'`; it is a guide surface, not a
metadata or review surface. Legacy graph inspector ids are still supported as
compatibility inputs, but they should not be the rendered source of truth for
the shell right rail.
