# Agent Operating Notes

Read [`AGENT.md`](./AGENT.md) first.

## Defaults
- Keep changes aligned to the TraceSpace MVP.
- Prefer `gpt-5.5` for primary generation and `gpt-5.4` for leaner reasoning tasks unless the code path already requires a user-selected model.
- Keep prompts, plans, and summaries compact.
- Do not expand the upstream broad multimodal surface area unless the task explicitly requires it.

## Product Guardrails
1. Treat the normalized graph as the product core.
2. Treat views as projections, not separate data silos.
3. Preserve source references and reviewability wherever feasible.
4. Prefer incremental modernization over risky rewrites.
5. Treat Miro exports as collaboration artifacts and monday exports as execution artifacts.
