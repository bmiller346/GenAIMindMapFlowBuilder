import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph.schemas import (
    GraphSchemaError,
    validate_monday_execution_result,
    validate_monday_export_payload,
    validate_monday_template,
)
from integrations.monday.client import MondayClient
from integrations.monday.exporter import (
    export_tasks_to_monday_payload,
    select_monday_task_nodes,
)
from integrations.monday.mapper import map_task_node_to_monday_item
from integrations.monday.persistence import (
    apply_monday_external_refs_to_flow_json,
    monday_item_refs_from_result,
)
from integrations.monday.templates import (
    AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    resolve_monday_template,
)


def test_monday_existing_group_payload_and_dry_run_operations_snapshot():
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Draft checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        confirmed=False,
        batch_id="batch-1",
        board_id="board-1",
        group_id="group-1",
        scope="branch",
        root_node_id="root",
        created_at="2026-05-14T12:00:00Z",
    )

    assert payload["mode"] == "dry_run"
    assert payload["target"] == {
        "board_id": "board-1",
        "group_id": "group-1",
        "existing_board": True,
        "existing_group": True,
    }
    assert payload["summary"] == {
        "item_count": 1,
        "will_create_board": False,
        "will_create_groups": False,
        "will_create_items": 1,
        "will_use_existing_board": True,
        "will_use_existing_group": True,
        "group_creation_policy": {
            "mvp_scope": "existing_board_existing_group_only",
            "will_create_groups": False,
            "decision": (
                "MVP exports require the user to choose an existing monday board and group. "
                "Automatic group creation from TraceSpace categories is deferred until conflict "
                "handling and target-template governance exist."
            ),
        },
    }
    assert payload["export_batch"] | {
        "id": payload["export_batch"].get("id", ""),
        "integration": payload["export_batch"].get("integration", ""),
        "mode": payload["export_batch"].get("mode", ""),
        "workspace_title": payload["export_batch"].get("workspace_title", ""),
    } == {
        "id": "batch-1",
        "integration": "monday",
        "mode": "dry_run",
        "export_batch_id": "batch-1",
        "workspace_id": "workspace-1",
        "workspace_title": "Training Rollout",
        "target": "monday",
        "scope": "branch",
        "root_node_id": "root",
        "created_at": "2026-05-14T12:00:00Z",
        "created_by": "",
        "status": "previewed",
        "external_target_id": "board:board-1/group:group-1",
        "item_count": 1,
    }

    result = MondayClient("test-token").export_existing_group_items(payload)

    assert result["mode"] == "dry_run"
    assert result["operation_count"] == 1
    assert result["operations"][0]["client_key"] == "monday-item-task-1"
    assert result["operations"][0]["variables"]["board_id"] == "board-1"
    assert result["operations"][0]["variables"]["group_id"] == "group-1"
    column_values = json.loads(result["operations"][0]["variables"]["column_values"])
    assert column_values["node_id"] == "task-1"
    assert column_values["status"] == {"label": "needs_review"}
    assert column_values["review_state"] == {"label": "needs_review"}
    assert column_values["due_date"] == {"date": "2026-06-01"}
    assert column_values["source_quote"] == "Checklist needs SME review."
    assert column_values["export_batch_id"] == "batch-1"
    validate_monday_export_payload(payload)
    validate_monday_template(payload["template"])


def test_monday_client_executed_result_keeps_node_ids(monkeypatch):
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Draft checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        confirmed=True,
        batch_id="batch-1",
        board_id="board-1",
        group_id="group-1",
    )
    client = MondayClient("test-token")
    monkeypatch.setattr(
        client,
        "_post",
        lambda operation: {
            "data": {
                "create_item": {
                    "id": "item-1",
                    "url": "https://monday.test/boards/board-1/pulses/item-1",
                }
            }
        },
    )

    result = client.export_existing_group_items(payload, dry_run=False)

    assert result["mode"] == "executed"
    assert result["export_batch"]["status"] == "pushed"
    validate_monday_execution_result(result)
    assert result["responses"] == [
        {
            "client_key": "monday-item-task-1",
            "node_id": "task-1",
            "response": {
                "data": {
                    "create_item": {
                        "id": "item-1",
                        "url": "https://monday.test/boards/board-1/pulses/item-1",
                    }
                }
            },
        }
    ]


def test_staged_monday_selection_input_overrides_item_fields():
    node = {
        **_task_node("task-1", "Canonical title"),
        "monday_selection_input": {
            "selected": True,
            "selected_at": "2026-05-14T12:00:00Z",
            "source": "accepted_local_preview_metadata",
            "accepted_flows": ["branch_to_task", "source_reference_repair"],
            "selection_reason": ["accepted task preview"],
            "item": {
                "name": "Accepted preview task",
                "node_id": "task-1",
                "status": "ready_for_export",
                "review_state": "accepted",
                "priority": "critical",
                "owner": "review-team",
                "due_date": "2026-06-15",
                "confidence": 0.91,
                "source_document": "doc-accepted",
                "source_page": 8,
                "source_section": "Accepted Work",
                "source_quote": "Use the accepted task preview.",
                "node_type": "task",
            },
        },
    }

    item = map_task_node_to_monday_item(node, {"id": "batch-1"})

    assert item["name"] == "Accepted preview task"
    assert item["status"] == "ready_for_export"
    assert item["review_state"] == "accepted"
    assert item["priority"] == "critical"
    assert item["owner"] == "review-team"
    assert item["source_document"] == "doc-accepted"
    assert item["source_quote"] == "Use the accepted task preview."
    assert item["accepted_flows"] == ["branch_to_task", "source_reference_repair"]
    assert item["selection_reason"] == ["accepted task preview"]
    assert item["external_refs"]["monday"]["export_batch_id"] == "batch-1"


def test_autodesk_template_payload_contract_snapshot():
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Draft checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        confirmed=True,
        batch_id="batch-1",
        board_id="board-1",
        group_id="group-1",
        template_id=AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    )
    result = MondayClient("test-token").export_existing_group_items(payload)
    column_values = json.loads(result["operations"][0]["variables"]["column_values"])

    assert payload["template"] == resolve_monday_template(
        AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID
    )
    assert column_values["review_status"] == {"label": "needs_review"}
    assert column_values["docmap_review_state"] == {"label": "needs_review"}
    assert column_values["target_date"] == {"date": "2026-06-01"}
    assert column_values["docmap_node_id"] == "task-1"
    assert column_values["source_evidence"] == "Checklist needs SME review."
    assert column_values["export_batch_id"] == "batch-1"
    validate_monday_export_payload(payload)


def test_monday_payload_contract_rejects_batch_mismatch():
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Draft checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        batch_id="batch-1",
        board_id="board-1",
        group_id="group-1",
    )
    payload["items"][0]["export_batch_id"] = "other-batch"

    try:
        validate_monday_export_payload(payload)
    except GraphSchemaError as exc:
        assert "items.0.export_batch_id: must match payload batch_id" in exc.errors
    else:
        raise AssertionError("Expected monday payload schema failure.")


def test_monday_task_selection_prefers_staged_nodes_when_present():
    graph = {
        "nodes": [
            {
                **_task_node("staged-1", "Staged task"),
                "monday_selection_input": {
                    "selected": True,
                    "item": {"name": "Staged task", "node_id": "staged-1"},
                },
            },
            _task_node("fallback-task", "Fallback task"),
        ],
        "tasks": [
            {"node_id": "staged-1"},
            {"node_id": "fallback-task"},
        ],
    }

    assert [node["id"] for node in select_monday_task_nodes(graph)] == ["staged-1"]


def test_monday_execution_result_persists_external_refs_to_flow_json():
    flow_json = json.dumps(
        {
            "nodes": [
                {
                    "id": "task-1",
                    "type": "response",
                    "data": {
                        "title": "Draft checklist",
                        "external_refs": {"miro": {"item_id": "miro-1"}},
                    },
                }
            ],
            "edges": [],
        }
    )
    result = {
        "mode": "executed",
        "board_id": "board-1",
        "group_id": "group-1",
        "export_batch": {"export_batch_id": "batch-1"},
        "responses": [
            {
                "node_id": "task-1",
                "response": {
                    "data": {
                        "create_item": {
                            "id": "item-1",
                            "url": "https://monday.test/boards/board-1/pulses/item-1",
                        }
                    }
                },
            }
        ],
    }

    refs = monday_item_refs_from_result(
        "board-1",
        "group-1",
        result,
        "2026-05-14T12:00:00Z",
    )
    updated = json.loads(apply_monday_external_refs_to_flow_json(flow_json, refs))

    assert refs == {
        "task-1": {
            "board_id": "board-1",
            "group_id": "group-1",
            "item_id": "item-1",
            "url": "https://monday.test/boards/board-1/pulses/item-1",
            "export_batch_id": "batch-1",
            "last_pushed_at": "2026-05-14T12:00:00Z",
        }
    }
    assert updated["nodes"][0]["data"]["external_refs"]["miro"] == {
        "item_id": "miro-1"
    }
    assert updated["nodes"][0]["data"]["external_refs"]["monday"] == refs["task-1"]


def _task_node(node_id: str, title: str) -> dict:
    return {
        "id": node_id,
        "title": title,
        "node_type": "task",
        "status": "needs_review",
        "priority": "high",
        "owner_id": "team-docs",
        "due_date": "2026-06-01",
        "confidence": 0.55,
        "source_refs": [
            {
                "document_id": "doc-1",
                "page": 3,
                "section": "Tasks",
                "quote_snippet": "Checklist needs SME review.",
            }
        ],
        "metadata": {"app_link": "http://localhost:5173/workspace/workspace-1"},
        "external_refs": {},
    }
