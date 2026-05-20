# Agent Operating Notes

Read [`AGENT.md`](./AGENT.md) first.

## Defaults
- Keep changes aligned to the TraceSpace MVP.
- Prefer `gpt-5.5` for primary generation and `gpt-5.4` for leaner reasoning tasks unless the code path already requires a user-selected model.
- Keep prompts, plans, and summaries compact.
- Do not expand the upstream broad multimodal surface area unless the task explicitly requires it.
- Use the Fast Context Intake section in `AGENT.md` before opening broad files
  or specialized roadmap docs.
- Prefer `rg` for the owning files/tests, then read narrow file ranges.

## Product Guardrails
1. Treat the normalized graph as the product core.
2. Treat views as projections, not separate data silos.
3. Preserve source references and reviewability wherever feasible.
4. Prefer incremental modernization over risky rewrites.
5. Treat Miro exports as collaboration artifacts and monday exports as execution artifacts.

## Active UI Shell Refactor
- For workspace shell, ribbon, panel, inspector, AI review, or map lens work,
  read `PRODUCT_GUIDE_WORKSPACE_SHELL.md` and
  `UI_SHELL_RIBBON_REFACTOR_ROADMAP.md` before editing.
- Preserve the direction: top ribbon for commands, left navigator for
  orientation, right panel for metadata, bottom tray for reviewable AI/output
  work, and canvas overlays kept lightweight.
- Keep graph/source/AI data contracts separate from shell layout state.
- Prefer feature-flagged, incremental migration over replacing multiple
  surfaces in one pass.
- When parallel agents are active, keep ownership narrow and list every touched
  file in the final handoff.
