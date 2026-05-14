# DocMap Workspace

This fork is being reshaped from a broad AI demo into a document-to-structured-workspace engine.

## Product Goal

Upload `PDF`, `DOCX`, `Markdown`, or `TXT`, extract structure with AI, and persist one normalized workspace graph that can be rendered as multiple views:

- Mind map
- Outline
- Task list
- Table
- Markdown export

The key architectural rule is simple:

`one persistent graph -> many views`

Mind map data should not become a second silo. Tasks should not be copied into a separate truth source. Views should be projections of the same workspace model.

## Platform Fit

This fork is best positioned as the missing middle layer in a company stack that already uses Miro and monday.com:

- This app: document ingestion, structure extraction, normalized graph, source citations
- Miro: visual collaboration and SME review
- monday.com: task execution and status tracking

That means this product should optimize for export and sync bridges, not try to replace either platform.

## Current Direction

This repo still contains upstream demo-era capabilities such as web, media, SQL, and Gemini paths. Those remain in the codebase, but the fork direction is now centered on the DocMap MVP:

1. Upload one `pdf` or `docx`
2. Extract text and structure
3. Generate a hierarchical graph
4. Render an editable mind map
5. Preserve source references
6. Convert selected branches into task-oriented views
7. Export JSON, Markdown, and PNG

## OpenAI Model Strategy

The project now treats OpenAI as the primary model path for document workflows.

- Supported selectable models in the persona UI: `gpt-5.4`, `gpt-5.5`
- Default generation model: `gpt-5.5`
- Default reasoning/support model: `gpt-5.4`
- Default embedding model: `text-embedding-3-large`

These defaults are controlled in `backend/app.py` through environment variables:

```env
openai_default_model=gpt-5.5
openai_reasoning_model=gpt-5.4
openai_embedding_model=text-embedding-3-large
```

The current backend still uses legacy assistant-style OpenAI flows in several places. That is now a modernization target rather than the desired long-term architecture.

## Product Spec Snapshot

### Source of truth

```text
Workspace
├── Source Documents
├── Document Chunks
├── Nodes
├── Edges
├── Source References
├── Tasks
├── External Refs
└── View State
```

### View projections

```text
Normalized Graph
├── Mind Map View
├── Outline View
├── Task List View
├── Table View
└── Markdown Export
```

### Integration projections

```text
Normalized Graph
├── Miro Board / Frame Export
├── monday.com Board / Group / Item Export
├── MMD-compatible JSON
├── OPML with attributes
└── CSV task export
```

### Controlled node types

```text
category
concept
standard
workflow
procedure
decision
risk
requirement
task
reference
definition
question
dependency
needs_review
```

## MVP Acceptance Criteria

1. User uploads one PDF or DOCX.
2. System extracts document text.
3. System generates a hierarchical node graph.
4. User sees an editable mind map.
5. Nodes can retain source references.
6. User can convert a selected branch into task-oriented output.
7. User can export PNG and Markdown.
8. User can save and reopen a workspace.

## Integration Direction

### Miro first

Miro is the best first external integration because it extends the visual review workflow you liked without forcing Miro to become the system of record.

Recommended export order:

1. Selected branch to Miro frame
2. Whole workspace to Miro board
3. Native mind map export where viable
4. Fallback shapes and connectors export

Each exported object should preserve the internal node ID and app backlink so later sync is possible.

### monday.com second

monday.com should receive only the actionable subset of the graph:

- `task`
- `procedure`
- `needs_review`
- optionally review-ready `workflow` nodes

Recommended export order:

1. Branch-to-task preview
2. Export tasks to existing board/group
3. Create board from workspace template
4. Pull status back into the app

### MMD / OPML compatibility

Miro Mind Map Downloader style exports are useful compatibility targets, especially:

- MMD-compatible JSON
- OPML with attributes
- Hierarchy CSV

These should be treated as bridge formats, not the internal canonical model.

## Roadmap

### Phase 1
- Narrow ingestion around `pdf`, `docx`, `md`, and `txt`
- Improve graph generation contracts
- Replace hardcoded model choices with GPT-5.4 / GPT-5.5 defaults and selection
- Add stable internal IDs and neutral export scaffolding

### Phase 2
- Normalize workspace persistence for nodes, edges, refs, and tasks
- Add source citation panels and review states
- Add true outline and table projections from the same graph
- Add JSON, Markdown, CSV, and OPML exports

### Phase 3
- Add branch-to-task preview and acceptance flow
- Add Miro export with shapes/connectors fallback
- Store `external_refs` for Miro objects
- Reduce or retire duplicate legacy flows

### Phase 4
- Add monday.com task export and board mapping
- Pull monday statuses back into the app
- Pull Miro review metadata/comments where feasible
- Migrate legacy assistant-style OpenAI calls to cleaner modern OpenAI patterns

## Repo Notes

- [`AGENT.md`](./AGENT.md): compact operating guide for future agentic work
- [`AGENTS.md`](./AGENTS.md): short rules for tooling-aware agents
- `backend/app.py`: current backend integration hub
- `frontend/src/prompts/promptsModel.js`: persona prompts and selectable OpenAI models

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install poetry
poetry install
uvicorn app:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create `backend/.env`:

```env
mongo_db_url=
openai_api_key=
openai_default_model=gpt-5.5
openai_reasoning_model=gpt-5.4
openai_embedding_model=text-embedding-3-large

gemini_api_key=
gcp_project_id=
aws_access_key_id=
aws_secret_access_key=
bucket_name=
```

## Important Caveat

This fork now has a clearer target than the upstream project, but the backend is still carrying legacy implementation patterns and a wide feature surface. The intended next step is consolidation, not more sprawl.
