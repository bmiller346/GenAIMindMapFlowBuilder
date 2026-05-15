import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.monday.client import (
    MondayClient,
    assess_existing_group_preflight,
)
from integrations.monday.templates import AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID


def test_monday_existing_group_preflight_dry_run_operation_snapshot():
    result = MondayClient("test-token").preflight_existing_group(
        "board-1",
        "group-1",
        template_id=AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    )

    assert result["mode"] == "dry_run"
    assert result["board_id"] == "board-1"
    assert result["group_id"] == "group-1"
    assert result["template"]["id"] == AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID
    assert result["operation"]["client_key"] == "monday-existing-group-preflight"
    assert result["operation"]["variables"] == {"board_ids": ["board-1"]}
    assert result["operation"]["metadata"]["required_column_types"] == {
        "docmap_review_state": "status",
        "review_status": "status",
        "target_date": "date",
    }
    assert "docmap_node_id" in result["operation"]["metadata"]["required_column_ids"]


def test_monday_existing_group_preflight_assesses_board_group_and_columns():
    operation = MondayClient("test-token").build_existing_group_preflight_operation(
        "board-1",
        "group-1",
        template_id=AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    )
    response = {
        "data": {
            "boards": [
                {
                    "id": "board-1",
                    "name": "Review board",
                    "groups": [{"id": "group-1", "title": "Tasks"}],
                    "columns": [
                        _column("review_status", "Review status", "status"),
                        _column("docmap_review_state", "TraceSpace state", "status"),
                        _column("target_date", "Target date", "date"),
                        _column("priority", "Priority", "text"),
                        _column("owner", "Owner", "text"),
                        _column("ai_confidence", "Confidence", "text"),
                        _column("docmap_node_id", "Node ID", "text"),
                        _column("building_block_type", "Type", "text"),
                        _column("source_document", "Source document", "text"),
                        _column("source_page", "Source page", "text"),
                        _column("source_section", "Source section", "text"),
                        _column("source_evidence", "Evidence", "text"),
                        _column("docmap_link", "TraceSpace link", "text"),
                        _column("export_batch_id", "Export batch", "text"),
                        _column("accepted_preview_flows", "Accepted flows", "text"),
                        _column("selection_reason", "Selection reason", "text"),
                    ],
                }
            ]
        }
    }

    preflight = assess_existing_group_preflight(response, operation)

    assert preflight["ok"] is True
    assert preflight["board_found"] is True
    assert preflight["group_found"] is True
    assert preflight["missing_column_ids"] == []
    assert preflight["type_mismatches"] == []


def test_monday_existing_group_preflight_reports_missing_and_mismatched_columns():
    operation = MondayClient("test-token").build_existing_group_preflight_operation(
        "board-1",
        "group-1",
        template_id=AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    )
    response = {
        "data": {
            "boards": [
                {
                    "id": "board-1",
                    "name": "Review board",
                    "groups": [{"id": "other-group", "title": "Other"}],
                    "columns": [
                        _column("review_status", "Review status", "text"),
                        _column("target_date", "Target date", "status"),
                    ],
                }
            ]
        }
    }

    preflight = assess_existing_group_preflight(response, operation)

    assert preflight["ok"] is False
    assert preflight["group_found"] is False
    assert "docmap_node_id" in preflight["missing_column_ids"]
    assert {
        "column_id": "review_status",
        "expected_type": "status",
        "actual_type": "text",
    } in preflight["type_mismatches"]
    assert {
        "column_id": "target_date",
        "expected_type": "date",
        "actual_type": "status",
    } in preflight["type_mismatches"]
    assert {issue["code"] for issue in preflight["issues"]} >= {
        "monday_group_not_found",
        "monday_column_not_found",
        "monday_column_type_mismatch",
    }


def _column(column_id: str, title: str, column_type: str) -> dict:
    return {
        "id": column_id,
        "title": title,
        "type": column_type,
        "settings_str": "{}",
    }
