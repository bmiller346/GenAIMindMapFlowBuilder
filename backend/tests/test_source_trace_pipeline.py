import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents.ingestion import build_source_document, chunk_text
from documents.source_refs import attach_source_refs_to_mindmap
from export.workspace_graph import build_workspace_graph, graph_to_task_rows
from integrations.miro.mapper import map_workspace_node_to_miro_shape
from integrations.monday.mapper import map_task_node_to_monday_item


def test_source_document_to_chunk_to_graph_to_export_trace():
    document_text = (
        "Electrical Scope\n\n"
        "Panel schedules must include breaker naming standards and QA review notes."
    )
    source_document = build_source_document("Electrical Scope.md", document_text.encode("utf-8"))
    chunks = chunk_text(document_text, source_document["id"], page=3)
    mindmap = {
        "nodes": [
            {
                "id": "root",
                "type": "dataSource",
                "position": {"x": 0, "y": 0},
                "data": {
                    "content": "Electrical Scope",
                    "name": "md",
                    "flow_id": "workspace-trace",
                },
            },
            {
                "id": "task-panel-schedules",
                "type": "response",
                "position": {"x": 240, "y": 0},
                "data": {
                    "title": "Review panel schedules",
                    "node_type": "task",
                    "priority": "high",
                    "data": {
                        "summ": "Panel schedules must include breaker naming standards.",
                    },
                },
            },
        ],
        "edges": [
            {
                "id": "edge-root-task",
                "source": "root",
                "target": "task-panel-schedules",
            }
        ],
    }

    grounded_mindmap = attach_source_refs_to_mindmap(mindmap, source_document, chunks)
    graph = build_workspace_graph(
        {
            "_id": "workspace-trace",
            "flow_name": "Trace Workspace",
            "summary": "Trace source citations.",
            "flow_type": "mind_map",
            "flow_json": json.dumps(grounded_mindmap),
        }
    )
    task_node = next(node for node in graph["nodes"] if node["id"] == "task-panel-schedules")
    task_rows = graph_to_task_rows(graph)
    miro_shape = map_workspace_node_to_miro_shape(task_node)
    monday_item = map_task_node_to_monday_item(task_node)
    expected_quote = " ".join(chunks[0]["text"].split())

    expected_ref = {
        "document_id": source_document["id"],
        "page": 3,
        "section": "Electrical Scope",
        "chunk_id": chunks[0]["id"],
        "quote_snippet": expected_quote,
        "confidence": "inferred",
    }

    assert task_node["source_refs"] == [expected_ref]
    assert task_rows[0]["Source Document"] == source_document["id"]
    assert task_rows[0]["Source Page"] == 3
    assert task_rows[0]["Source Section"] == "Electrical Scope"
    assert task_rows[0]["Source Quote"] == expected_quote
    assert miro_shape["source"] == {
        "document_id": source_document["id"],
        "page": 3,
        "section": "Electrical Scope",
        "quote_snippet": expected_quote,
    }
    assert monday_item["source_document"] == source_document["id"]
    assert monday_item["source_page"] == 3
    assert monday_item["source_section"] == "Electrical Scope"
    assert monday_item["source_quote"] == expected_quote
