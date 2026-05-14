from graph.schemas import ExportBatch
from integrations.monday.exporter import export_tasks_to_monday_payload
from integrations.monday.persistence import monday_item_refs_from_result


def test_monday_payload_uses_durable_export_batch_schema():
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Review checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        confirmed=True,
        batch_id="monday-export-test",
        board_id="board-1",
        group_id="group-1",
        scope="branch",
        root_node_id="task-root",
        created_at="2026-05-14T12:00:00Z",
    )

    assert payload["batch_id"] == "monday-export-test"
    assert payload["mode"] == "confirmed_payload"
    assert payload["export_batch"] == {
        "id": "monday-export-test",
        "integration": "monday",
        "target": "monday",
        "mode": "confirmed_payload",
        "workspace_id": "workspace-1",
        "workspace_title": "Training Rollout",
        "scope": "branch",
        "root_node_id": "task-root",
        "external_target_id": "board:board-1/group:group-1",
        "item_count": 1,
        "created_at": "2026-05-14T12:00:00Z",
        "created_by": "",
        "status": "confirmed",
        "export_batch_id": "monday-export-test",
    }
    ExportBatch.model_validate(payload["export_batch"])
    assert payload["items"][0]["batch_id"] == "monday-export-test"
    assert payload["items"][0]["export_batch_id"] == "monday-export-test"
    assert payload["items"][0]["export_batch"] == payload["export_batch"]
    assert payload["items"][0]["external_refs"]["monday"] == {
        "export_batch_id": "monday-export-test",
    }


def test_monday_persisted_refs_include_export_batch_id():
    result = {
        "batch_id": "monday-export-test",
        "export_batch": {
            "id": "monday-export-test",
            "export_batch_id": "monday-export-test",
            "integration": "monday",
            "target": "monday",
            "mode": "executed",
        },
        "responses": [
            {
                "node_id": "task-1",
                "response": {
                    "data": {
                        "create_item": {
                            "id": "item-1",
                            "url": "https://monday.test/item/1",
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

    assert refs == {
        "task-1": {
            "board_id": "board-1",
            "group_id": "group-1",
            "item_id": "item-1",
            "url": "https://monday.test/item/1",
            "export_batch_id": "monday-export-test",
            "last_pushed_at": "2026-05-14T12:00:00Z",
        }
    }


def _task_node(node_id: str, title: str) -> dict:
    return {
        "id": node_id,
        "title": title,
        "node_type": "task",
        "status": "needs_review",
        "priority": "high",
        "owner_id": "team-docs",
        "due_date": "2026-06-01",
        "confidence": 0.8,
        "source_refs": [
            {
                "document_id": "doc-1",
                "page": 3,
                "section": "Tasks",
                "quote_snippet": "Review checklist with SMEs.",
            }
        ],
        "external_refs": {},
        "metadata": {"app_link": "/workspaces/workspace-1/nodes/task-1"},
    }
