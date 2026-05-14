import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.monday.client import MondayClient
from integrations.monday.persistence import (
    apply_monday_status_updates_to_flow_json,
    monday_refs_from_flow_json,
    monday_status_updates_from_result,
)


def test_monday_status_pull_dry_run_operations_snapshot():
    refs = {
        "task-1": {
            "board_id": "board-1",
            "group_id": "group-1",
            "item_id": "item-1",
        },
        "task-2": {
            "board_id": "board-1",
            "group_id": "group-1",
            "item_id": "item-2",
        },
    }

    result = MondayClient("test-token").pull_item_statuses(refs)

    assert result["mode"] == "dry_run"
    assert result["operation_count"] == 1
    assert result["operations"][0]["client_key"] == "monday-status-pull"
    assert result["operations"][0]["variables"] == {
        "item_ids": ["item-1", "item-2"],
        "column_ids": ["status", "review_status", "docmap_review_state"],
    }
    assert result["operations"][0]["metadata"]["node_by_item_id"] == {
        "item-1": "task-1",
        "item-2": "task-2",
    }


def test_monday_status_result_maps_and_applies_review_state():
    flow_json = json.dumps(
        {
            "nodes": [
                {
                    "id": "task-1",
                    "type": "response",
                    "data": {
                        "title": "Review checklist",
                        "status": "needs_review",
                        "external_refs": {
                            "monday": {
                                "board_id": "board-1",
                                "group_id": "group-1",
                                "item_id": "item-1",
                                "export_batch_id": "batch-1",
                            }
                        },
                    },
                },
                {
                    "id": "task-2",
                    "type": "response",
                    "data": {
                        "title": "Blocked checklist",
                        "status": "in_review",
                        "external_refs": {
                            "monday": {
                                "board_id": "board-1",
                                "group_id": "group-1",
                                "item_id": "item-2",
                            }
                        },
                    },
                },
            ],
            "edges": [],
        }
    )
    refs = monday_refs_from_flow_json(flow_json)
    result = {
        "mode": "executed",
        "responses": [
            {
                "client_key": "monday-status-pull",
                "metadata": {
                    "node_by_item_id": {
                        "item-1": "task-1",
                        "item-2": "task-2",
                    }
                },
                "response": {
                    "data": {
                        "items": [
                            {
                                "id": "item-1",
                                "column_values": [
                                    {"id": "review_status", "text": "Done", "value": None}
                                ],
                            },
                            {
                                "id": "item-2",
                                "column_values": [
                                    {"id": "review_status", "text": "Stuck", "value": None}
                                ],
                            },
                        ]
                    }
                },
            }
        ],
    }

    updates = monday_status_updates_from_result(
        result,
        refs,
        "2026-05-14T12:00:00Z",
    )
    updated = json.loads(apply_monday_status_updates_to_flow_json(flow_json, updates))

    assert updates == {
        "task-1": {
            "status": "accepted",
            "monday_status": "Done",
            "monday_item_id": "item-1",
            "last_pulled_at": "2026-05-14T12:00:00Z",
        },
        "task-2": {
            "status": "needs_review",
            "monday_status": "Stuck",
            "monday_item_id": "item-2",
            "last_pulled_at": "2026-05-14T12:00:00Z",
        },
    }
    assert updated["nodes"][0]["data"]["status"] == "accepted"
    assert updated["nodes"][0]["data"]["external_refs"]["monday"]["export_batch_id"] == "batch-1"
    assert updated["nodes"][0]["data"]["external_refs"]["monday"]["status"] == "Done"
    assert updated["nodes"][1]["data"]["status"] == "needs_review"
