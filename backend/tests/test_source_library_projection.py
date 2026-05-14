import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents.ingestion import build_source_document, chunk_text
from export.workspace_graph import build_workspace_graph
from graph.schemas import WorkspaceGraph


def test_workspace_graph_projects_source_library_from_components_and_citations():
    document_text = (
        "Electrical Scope\n\n"
        "Panel schedules must include breaker naming standards and QA review notes."
    )
    source_document = build_source_document("Electrical Scope.md", document_text.encode("utf-8"))
    chunks = chunk_text(document_text, source_document["id"], page=3)
    flow = {
        "_id": "workspace-sources",
        "flow_name": "Source Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "source-node",
                        "type": "dataSource",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Electrical Scope.md",
                            "source_refs": [{"document_id": source_document["id"]}],
                        },
                    },
                    {
                        "id": "task-node",
                        "type": "response",
                        "position": {"x": 240, "y": 0},
                        "data": {
                            "title": "Review panel schedules",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": source_document["id"],
                                    "page": 3,
                                    "section": "Electrical Scope",
                                    "chunk_id": chunks[0]["id"],
                                    "quote_snippet": "Panel schedules must include breaker naming standards.",
                                    "confidence": 0.9,
                                }
                            ],
                        },
                    },
                ],
                "edges": [{"id": "edge-1", "source": "source-node", "target": "task-node"}],
            }
        ),
    }
    components = [
        {
            "source_document_id": source_document["id"],
            "source_document": source_document,
            "document_chunks": chunks,
            "source_segments": [
                {
                    "text": document_text,
                    "page": 3,
                    "heading": "Electrical Scope",
                    "start_char": 0,
                    "end_char": len(document_text),
                }
            ],
        }
    ]

    graph = build_workspace_graph(flow, source_components=components)
    library = graph["source_library"]

    assert library["summary"] == {
        "document_count": 1,
        "citation_count": 2,
        "failure_count": 0,
    }
    assert library["citations"][1] == {
        "node_id": "task-node",
        "node_title": "Review panel schedules",
        "document_id": source_document["id"],
        "chunk_id": chunks[0]["id"],
        "page": 3,
        "section": "Electrical Scope",
        "quote_snippet": "Panel schedules must include breaker naming standards.",
        "confidence": 0.9,
    }
    assert library["documents"][0]["id"] == source_document["id"]
    assert library["documents"][0]["filename"] == "Electrical-Scope.md"
    assert library["documents"][0]["source_node_ids"] == ["source-node"]
    assert library["documents"][0]["cited_node_ids"] == ["source-node", "task-node"]
    assert library["documents"][0]["chunk_count"] == 1
    assert library["documents"][0]["segment_count"] == 1
    assert library["documents"][0]["coverage"] == {
        "cited_chunks": 1,
        "total_chunks": 1,
        "cited_pages": 1,
        "total_pages": 1,
    }
    assert library["documents"][0]["chunks"][0]["snippet"]
    assert library["documents"][0]["chunks"][0]["cited_by_count"] == 1
    WorkspaceGraph.model_validate(graph)


def test_workspace_graph_preserves_saved_source_library_without_components():
    flow = {
        "_id": "workspace-saved-sources",
        "flow_name": "Saved Source Workspace",
        "flow_json": json.dumps(
            {
                "source_library": {
                    "documents": [
                        {
                            "id": "src_saved_v1",
                            "filename": "Saved.md",
                            "type": "md",
                            "status": "uploaded",
                            "chunks": [
                                {
                                    "id": "chunk-1",
                                    "document_id": "src_saved_v1",
                                    "index": 0,
                                    "text": "Saved chunk text",
                                }
                            ],
                        }
                    ],
                    "failures": [
                        {
                            "document_id": "src_failed_v1",
                            "filename": "Bad.pdf",
                            "status": "failed",
                            "message": "Could not parse PDF.",
                        }
                    ],
                },
                "nodes": [
                    {
                        "id": "task-node",
                        "type": "response",
                        "data": {
                            "title": "Saved citation",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": "src_saved_v1",
                                    "chunk_id": "chunk-1",
                                    "page": 4,
                                }
                            ],
                        },
                    }
                ],
                "edges": [],
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["source_library"]["summary"] == {
        "document_count": 1,
        "citation_count": 1,
        "failure_count": 1,
    }
    assert graph["source_library"]["documents"][0]["coverage"]["cited_chunks"] == 1
    assert graph["source_library"]["documents"][0]["chunks"][0]["snippet"] == "Saved chunk text"
    assert graph["source_library"]["failures"][0]["filename"] == "Bad.pdf"
