import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.miro.client import MiroClient
from integrations.miro.native_mindmap import (
    NATIVE_MINDMAP_EVALUATION,
    export_native_mindmap_payload,
)


def test_native_mindmap_payload_documents_experimental_decision():
    payload = export_native_mindmap_payload(
        {
            "workspace": {"id": "workspace-1", "title": "Training Rollout"},
            "nodes": [
                _node("root", "Training Rollout"),
                _node("task-1", "Review checklist"),
            ],
            "edges": [_edge("edge-root-task", "root", "task-1")],
        },
        batch_id="native-batch-1",
    )

    assert payload["target"] == "native_mindmap_experimental"
    assert payload["batch_id"] == "native-batch-1"
    assert payload["evaluation"] == NATIVE_MINDMAP_EVALUATION
    assert payload["evaluation"]["recommendation"] == "keep_shapes_connectors_as_default"
    assert payload["summary"] == {
        "node_count": 2,
        "root_count": 1,
        "connector_count": 0,
    }
    assert payload["nodes"][0]["id"] == "mindmap-root"
    assert payload["nodes"][0]["parent_item"] == ""
    assert payload["nodes"][1]["id"] == "mindmap-task-1"
    assert payload["nodes"][1]["parent_item"] == "mindmap-root"
    assert payload["nodes"][1]["metadata"]["source_quote"] == "Checklist needs SME review."


def test_native_mindmap_dry_run_operations_snapshot():
    payload = export_native_mindmap_payload(
        {
            "workspace": {"id": "workspace-1", "title": "Training Rollout"},
            "nodes": [
                _node("root", "Training Rollout"),
                _node("task-1", "Review checklist"),
            ],
            "edges": [_edge("edge-root-task", "root", "task-1")],
        },
        batch_id="native-batch-1",
    )

    result = MiroClient("test-token").export_native_mindmap_payload("board-1", payload)

    assert result["mode"] == "dry_run"
    assert result["evaluation"]["api_status"] == "experimental"
    assert result["operation_count"] == 2
    assert result["operations"][0]["url"] == (
        "https://api.miro.com/v2-experimental/boards/board-1/mindmap_nodes"
    )
    assert "parent" not in result["operations"][0]["body"]
    assert result["operations"][1]["body"]["parent"] == {"id": "mindmap-root"}
    assert result["operations"][1]["body"]["data"]["nodeView"] == {
        "type": "text",
        "content": "Review checklist",
    }


def test_native_mindmap_execution_resolves_parent_ids(monkeypatch):
    payload = export_native_mindmap_payload(
        {
            "workspace": {"id": "workspace-1", "title": "Training Rollout"},
            "nodes": [
                _node("root", "Training Rollout"),
                _node("task-1", "Review checklist"),
            ],
            "edges": [_edge("edge-root-task", "root", "task-1")],
        },
        batch_id="native-batch-1",
    )
    client = MiroClient("test-token")
    posted_operations = []
    responses = iter([{"id": "miro-root"}, {"id": "miro-task-1"}])

    def fake_post(operation):
        posted_operations.append(operation)
        return next(responses)

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.export_native_mindmap_payload("board-1", payload, dry_run=False)

    assert result["mode"] == "executed"
    assert result["export_batch"]["status"] == "experimental_executed"
    assert posted_operations[1]["body"]["parent"] == {"id": "miro-root"}


def _node(node_id: str, title: str) -> dict:
    return {
        "id": node_id,
        "title": title,
        "node_type": "task",
        "status": "needs_review",
        "source_refs": [
            {
                "document_id": "doc-1",
                "page": 2,
                "section": "Tasks",
                "quote_snippet": "Checklist needs SME review.",
            }
        ],
        "metadata": {},
    }


def _edge(edge_id: str, source: str, target: str) -> dict:
    return {
        "id": edge_id,
        "source_node_id": source,
        "target_node_id": target,
        "relationship_type": "contains",
        "metadata": {},
    }
