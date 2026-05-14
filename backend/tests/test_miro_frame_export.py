import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.miro.client import MiroClient
from integrations.miro.exporter import (
    export_branch_to_miro_payload,
    export_sme_review_board_payload,
)
from integrations.miro.persistence import (
    apply_miro_external_refs_to_flow_json,
    miro_item_refs_from_result,
)
from graph.schemas import ExportBatch


def test_selected_branch_frame_payload_and_client_operations_snapshot():
    payload = export_branch_to_miro_payload(
        [_node("root", "Root"), _node("task-1", "Draft checklist")],
        [_edge("edge-root-task", "root", "task-1")],
        {"id": "workspace-1", "title": "Training Rollout"},
        target="selected_branch_frame",
    )

    assert payload["target"] == "selected_branch_frame"
    assert payload["batch_id"].startswith("miro-export-")
    ExportBatch.model_validate(payload["export_batch"])
    assert payload["export_batch"]["integration"] == "miro"
    assert payload["export_batch"]["target"] == "selected_branch_frame"
    assert payload["summary"] == {"shape_count": 2, "connector_count": 1}
    assert payload["items"][0]["node_id"] == "root"
    assert payload["items"][0]["export_batch_id"] == payload["batch_id"]
    assert payload["items"][1]["position"] == {"x": 360, "y": 160}
    assert payload["connectors"][0]["start_item"] == "shape-root"
    assert payload["connectors"][0]["end_item"] == "shape-task-1"
    assert payload["connectors"][0]["export_batch_id"] == payload["batch_id"]

    result = MiroClient("test-token").export_frame_payload("board-1", payload)

    assert result["mode"] == "dry_run"
    assert result["batch_id"] == payload["batch_id"]
    assert result["export_batch"] == payload["export_batch"]
    assert result["operation_count"] == 4
    assert result["operations"][0]["url"] == "https://api.miro.com/v2/boards/board-1/frames"
    assert result["operations"][1]["client_key"] == "shape-root"
    assert result["operations"][1]["body"]["metadata"]["export_batch_id"] == payload["batch_id"]
    assert result["operations"][3]["client_key"] == "connector-edge-root-task"


def test_workspace_board_payload_and_client_operations_snapshot():
    payload = export_branch_to_miro_payload(
        [
            _node("root", "Root"),
            _node("task-1", "Draft checklist"),
            _node("task-2", "Review checklist"),
        ],
        [
            _edge("edge-root-task-1", "root", "task-1"),
            _edge("edge-root-task-2", "root", "task-2"),
        ],
        {"id": "workspace-1", "title": "Training Rollout"},
        target="workspace_board",
    )

    assert payload["target"] == "workspace_board"
    assert payload["export_batch"]["scope"] == "workspace"
    assert payload["summary"] == {"shape_count": 3, "connector_count": 2}
    assert payload["layout"]["frame"]["title"] == "Training Rollout"
    assert payload["connectors"][1]["start_item"] == "shape-root"
    assert payload["connectors"][1]["end_item"] == "shape-task-2"

    result = MiroClient("test-token").export_frame_payload("board-1", payload)

    assert result["mode"] == "dry_run"
    assert result["operation_count"] == 6
    assert result["operations"][0]["body"]["data"]["title"] == "Training Rollout"
    assert result["operations"][3]["client_key"] == "shape-task-2"
    assert result["operations"][5]["client_key"] == "connector-edge-root-task-2"


def test_sme_review_board_payload_filters_needs_review_nodes_snapshot():
    graph = {
        "workspace": {"id": "workspace-1", "title": "Training Rollout"},
        "nodes": [
            _node("root", "Root"),
            {
                **_node("review-1", "Review checklist"),
                "status": "needs_review",
                "priority": "high",
                "owner_id": "sme-team",
            },
            {
                **_node("review-2", "Confirm source evidence"),
                "node_type": "needs_review",
                "status": "needs_review",
            },
            _node("done-1", "Already accepted"),
        ],
        "edges": [
            _edge("edge-root-review-1", "root", "review-1"),
            _edge("edge-review-1-review-2", "review-1", "review-2"),
            _edge("edge-review-2-done", "review-2", "done-1"),
        ],
    }

    payload = export_sme_review_board_payload(graph, batch_id="miro-review-batch")

    assert payload["target"] == "sme_review_board"
    assert payload["batch_id"] == "miro-review-batch"
    assert payload["export_batch"]["target"] == "sme_review_board"
    assert payload["export_batch"]["scope"] == "workspace"
    assert payload["summary"] == {
        "shape_count": 2,
        "connector_count": 1,
        "review_node_count": 2,
    }
    assert payload["layout"]["strategy"] == "sme_review_grid"
    assert payload["layout"]["frame"]["title"] == "Training Rollout SME Review"
    assert [item["node_id"] for item in payload["items"]] == ["review-1", "review-2"]
    assert payload["items"][0]["review_state"] == "needs_review"
    assert payload["items"][0]["priority"] == "high"
    assert payload["items"][0]["source"]["quote_snippet"] == "Checklist needs SME review."
    assert [connector["edge_id"] for connector in payload["connectors"]] == [
        "edge-review-1-review-2"
    ]

    result = MiroClient("test-token").export_frame_payload("board-1", payload)

    assert result["mode"] == "dry_run"
    assert result["operation_count"] == 4
    assert result["operations"][0]["body"]["data"]["title"] == "Training Rollout SME Review"
    assert result["operations"][1]["client_key"] == "shape-review-1"
    assert result["operations"][3]["client_key"] == "connector-edge-review-1-review-2"


def test_miro_client_executed_result_keeps_client_keys(monkeypatch):
    payload = export_branch_to_miro_payload(
        [_node("task-1", "Draft checklist")],
        [],
        {"id": "workspace-1", "title": "Training Rollout"},
        target="selected_branch_frame",
    )
    client = MiroClient("test-token")
    responses = iter(
        [
            {"id": "frame-1"},
            {"id": "miro-item-1", "links": {"self": "https://miro.test/item/1"}},
        ]
    )
    monkeypatch.setattr(client, "_post", lambda operation: next(responses))

    result = client.export_frame_payload("board-1", payload, dry_run=False)

    assert result == {
        "mode": "executed",
        "board_id": "board-1",
        "batch_id": payload["batch_id"],
        "export_batch": {
            **payload["export_batch"],
            "mode": "executed",
            "status": "executed",
        },
        "responses": [
            {"client_key": "frame", "response": {"id": "frame-1"}},
            {
                "client_key": "shape-task-1",
                "response": {
                    "id": "miro-item-1",
                    "links": {"self": "https://miro.test/item/1"},
                },
            },
        ],
    }


def test_miro_client_resolves_connector_item_refs_before_execution(monkeypatch):
    payload = export_branch_to_miro_payload(
        [_node("root", "Root"), _node("task-1", "Draft checklist")],
        [_edge("edge-root-task", "root", "task-1")],
        {"id": "workspace-1", "title": "Training Rollout"},
        target="workspace_board",
    )
    client = MiroClient("test-token")
    posted_operations = []
    responses = iter(
        [
            {"id": "frame-1"},
            {"id": "miro-root"},
            {"id": "miro-task-1"},
            {"id": "connector-1"},
        ]
    )

    def fake_post(operation):
        posted_operations.append(operation)
        return next(responses)

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.export_frame_payload("board-1", payload, dry_run=False)

    assert result["responses"][3]["client_key"] == "connector-edge-root-task"
    assert posted_operations[3]["body"]["startItem"] == {"id": "miro-root"}
    assert posted_operations[3]["body"]["endItem"] == {"id": "miro-task-1"}
    assert payload["connectors"][0]["start_item"] == "shape-root"
    assert payload["connectors"][0]["end_item"] == "shape-task-1"


def test_miro_execution_result_persists_external_refs_to_flow_json():
    flow_json = json.dumps(
        {
            "nodes": [
                {
                    "id": "task-1",
                    "type": "response",
                    "data": {"title": "Draft checklist"},
                },
                {
                    "id": "task-2",
                    "type": "response",
                    "data": {
                        "title": "Review checklist",
                        "external_refs": {"monday": {"item_id": "monday-1"}},
                    },
                },
            ],
            "edges": [],
        }
    )
    result = {
        "mode": "executed",
        "board_id": "board-1",
        "responses": [
            {"client_key": "frame", "response": {"id": "frame-1"}},
            {
                "client_key": "shape-task-1",
                "response": {
                    "id": "miro-item-1",
                    "links": {"self": "https://miro.test/item/1"},
                },
            },
            {"client_key": "shape-task-2", "response": {"id": "miro-item-2"}},
        ],
    }

    result["batch_id"] = "miro-export-test"
    result["export_batch"] = {
        "id": "miro-export-test",
        "integration": "miro",
        "target": "selected_branch_frame",
        "mode": "executed",
    }
    refs = miro_item_refs_from_result("board-1", result, "2026-05-14T12:00:00Z")
    updated = json.loads(apply_miro_external_refs_to_flow_json(flow_json, refs))

    assert refs == {
        "task-1": {
            "board_id": "board-1",
            "item_id": "miro-item-1",
            "url": "https://miro.test/item/1",
            "export_batch_id": "miro-export-test",
            "last_pushed_at": "2026-05-14T12:00:00Z",
        },
        "task-2": {
            "board_id": "board-1",
            "item_id": "miro-item-2",
            "url": "https://miro.com/app/board/board-1/?moveToWidget=miro-item-2",
            "export_batch_id": "miro-export-test",
            "last_pushed_at": "2026-05-14T12:00:00Z",
        },
    }
    assert updated["nodes"][0]["data"]["external_refs"]["miro"] == refs["task-1"]
    assert updated["nodes"][1]["data"]["external_refs"]["monday"] == {
        "item_id": "monday-1"
    }
    assert updated["nodes"][1]["data"]["external_refs"]["miro"] == refs["task-2"]


def _node(node_id: str, title: str) -> dict:
    return {
        "id": node_id,
        "title": title,
        "node_type": "task",
        "status": "ai_generated",
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
