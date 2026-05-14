import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.monday.client import MondayClient
from integrations.monday.exporter import export_tasks_to_monday_payload
from integrations.monday.templates import (
    AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    map_item_to_template_columns,
    resolve_monday_template,
)


def test_autodesk_building_block_review_template_maps_neutral_fields():
    template = resolve_monday_template(AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID)

    assert template["name"] == "Autodesk Building Block Review"
    assert map_item_to_template_columns(
        {
            "status": "accepted",
            "review_state": "accepted",
            "priority": "high",
            "owner": "review-team",
            "due_date": "2026-06-15",
            "confidence": 0.91,
            "node_id": "task-1",
            "node_type": "task",
            "source_document": "doc-1",
            "source_page": 8,
            "source_section": "Review",
            "source_quote": "Use accepted task preview.",
            "app_link": "/workspaces/workspace-1/nodes/task-1",
            "export_batch_id": "batch-1",
            "accepted_flows": ["branch_to_task", "source_reference_repair"],
            "selection_reason": ["accepted task preview"],
        },
        template,
    ) == {
        "review_status": "accepted",
        "docmap_review_state": "accepted",
        "priority": "high",
        "owner": "review-team",
        "target_date": "2026-06-15",
        "ai_confidence": 0.91,
        "docmap_node_id": "task-1",
        "building_block_type": "task",
        "source_document": "doc-1",
        "source_page": 8,
        "source_section": "Review",
        "source_evidence": "Use accepted task preview.",
        "docmap_link": "/workspaces/workspace-1/nodes/task-1",
        "export_batch_id": "batch-1",
        "accepted_preview_flows": "branch_to_task, source_reference_repair",
        "selection_reason": "accepted task preview",
    }


def test_monday_payload_and_operations_include_autodesk_template():
    payload = export_tasks_to_monday_payload(
        [_task_node("task-1", "Review checklist")],
        {"id": "workspace-1", "title": "Training Rollout"},
        batch_id="batch-1",
        board_id="board-1",
        group_id="group-1",
        template_id=AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    )

    assert payload["template"]["id"] == AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID

    result = MondayClient("test-token").export_existing_group_items(payload)
    operation = result["operations"][0]
    column_values = json.loads(operation["variables"]["column_values"])

    assert result["template"]["id"] == AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID
    assert operation["metadata"]["template_id"] == AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID
    assert operation["variables"]["item_name"] == "Review checklist"
    assert column_values["review_status"] == "needs_review"
    assert column_values["target_date"] == "2026-06-01"
    assert column_values["docmap_node_id"] == "task-1"
    assert column_values["source_evidence"] == "Review checklist with SMEs."


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
        "metadata": {"app_link": "/workspaces/workspace-1/nodes/task-1"},
        "external_refs": {},
    }
