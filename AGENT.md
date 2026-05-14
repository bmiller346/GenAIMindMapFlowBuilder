# DocMap Agent Guide

## Mission
Turn this fork into a document-to-structured-workspace product:

`PDF/DOCX/MD/TXT -> extracted structure -> normalized graph -> multiple editable views`

The product is not "an AI chat with attachments." The product is a persistent workspace graph that can be rendered as a mind map, outline, task list, table, and later board/calendar/org chart views.

## Product Rules
1. The normalized workspace graph is the source of truth.
2. Mind map, tasks, table, and outline are views over the same data.
3. Every AI-generated node should retain source traceability when possible.
4. Prefer strict JSON contracts over freeform text generation.
5. Keep MVP scope narrow until the document-to-graph loop is reliable.
6. Miro is the visual collaboration endpoint, not the canonical store.
7. monday.com is the task execution endpoint, not the canonical store.

## Current Build Focus
### In scope
- Upload `pdf`, `docx`, `md`, and `txt`
- Extract and chunk document content
- Generate a structured hierarchy
- Render and edit a graph-based mind map
- Toggle the same data into outline/task/table views
- Export JSON, Markdown, and PNG

### Out of scope for now
- Full collaboration workflows
- Enterprise admin/policy layers
- Broad multimodal parity with the upstream demo
- Large prompt stacks that hide brittle architecture

### Integration stance
- Export to Miro for collaborative review and board-level visualization
- Export to monday.com for actionable tasks, owners, and due dates
- Support import/sync only after internal node IDs and external refs are stable

## OpenAI Direction
- Preferred user-selectable models: `gpt-5.4`, `gpt-5.5`
- Default generation model: `gpt-5.5`
- Default reasoning/support model: `gpt-5.4`
- Target API direction: migrate legacy assistant-style flows toward modern OpenAI Responses-based patterns incrementally, not in a destabilizing rewrite

## Context Discipline
When working as an agent in this repo:

1. Read only the files needed for the task.
2. Summarize before widening scope.
3. Do not paste giant prompts or long generated JSON into planning docs.
4. Prefer updating this file, `AGENTS.md`, and `README.md` with concise decisions over repeating history in chat.
5. Record only durable decisions, active constraints, and next milestones.

## Architecture North Star
### Source-of-truth model
- `workspaces`
- `documents`
- `document_chunks`
- `nodes`
- `edges`
- `source_refs`
- `tasks`
- `views`
- `external_refs`

### Rendered views
- Mind map
- Outline
- Task list
- Table
- Markdown export

### Integration endpoints
- Miro board, frame, mind map, or shapes-plus-connectors export
- monday.com board, groups, items, and subitems export
- Status/comment pullback only after export mappings are durable

## Next Roadmap
1. Stabilize document ingestion around PDF/DOCX/MD/TXT only.
2. Normalize graph persistence so view transforms stop duplicating state.
3. Add source refs, review states, and `external_refs` to node details.
4. Add neutral exports: rich JSON, Markdown, CSV task list, and OPML.
5. Add Miro export with branch-level export first and full-board export second.
6. Add monday.com task export with preview/confirm flow.
7. Migrate legacy OpenAI beta assistant calls to a cleaner current SDK pattern.

## Definition of Better
- Smaller prompts
- Clearer schemas
- Fewer duplicated flows
- Better traceability
- Less "AI demo" behavior
- More durable product architecture
