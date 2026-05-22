import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from export.connected_package import (
    connected_package_evidence_csv_export,
    connected_package_export_bundle,
    connected_package_handoff_candidates,
    connected_package_json_export,
    connected_package_markdown_export,
    connected_package_mermaid_export,
)


SOURCE_REF = {
    "document_id": "doc-package",
    "page": 4,
    "section": "Accepted Flow",
    "quote_snippet": "The reviewer accepted the package flow.",
}


def test_connected_package_export_shapes_are_deterministic_and_source_backed():
    package = _accepted_package()

    json_export = connected_package_json_export(package, {"id": "workspace-1", "title": "Workspace One"})
    markdown = connected_package_markdown_export(package)
    csv_export = connected_package_evidence_csv_export(package)
    mermaid = connected_package_mermaid_export(package)
    bundle = connected_package_export_bundle(package, {"id": "workspace-1", "title": "Workspace One"})

    assert json_export["export_type"] == "connected_picture_package"
    assert json_export["package_id"] == "pkg-export-1"
    assert json_export["workspace"]["title"] == "Workspace One"
    assert json_export["evidence_rows"][0]["Source Document"] == "doc-package"
    assert markdown.startswith("# Accepted Export Package")
    assert "## Evidence Rows" in markdown
    assert "The reviewer accepted the package flow." in markdown
    assert "Package ID,Item ID,Item Type,Title,Review State" in csv_export
    assert "pkg-export-1,evidence-item,structured_evidence,Accepted evidence,source_backed" in csv_export
    assert mermaid == (
        "flowchart TD\n"
        '  node_start["Start review"]\n'
        '  node_decision["Approve package"]\n'
        "  node_start -->|Ready for approval| node_decision\n"
    )
    assert bundle["evidence_rows"] == json_export["evidence_rows"]


def test_connected_package_handoff_candidates_reuse_existing_miro_and_monday_payloads():
    candidates = connected_package_handoff_candidates(
        _accepted_package(),
        {"id": "workspace-1", "title": "Workspace One"},
        batch_id="batch-export",
    )

    assert candidates["miro"]["target"] == "connected_picture_package_board"
    assert candidates["miro"]["mode"] == "dry_run"
    assert candidates["miro"]["export_batch"]["integration"] == "miro"
    assert candidates["miro"]["items"][0]["node_id"] == "node-start"
    assert candidates["miro"]["connectors"][0]["edge_id"] == "edge-start-decision"
    assert candidates["monday"]["mode"] == "dry_run"
    assert candidates["monday"]["export_batch"]["scope"] == "connected_picture_package"
    assert candidates["monday"]["target"]["board_id"] == ""
    assert candidates["monday"]["items"][0]["name"] == "Push package to stakeholders"
    assert candidates["monday"]["items"][0]["source_quote"] == "The reviewer accepted the package flow."
    assert "confirmed monday board_id/group_id" in candidates["deferred_backend_fields"]


def _accepted_package():
    return {
        "package_id": "pkg-export-1",
        "title": "Accepted Export Package",
        "status": "accepted",
        "primary_nodes": [
            {
                "item_id": "node-start-item",
                "node_id": "node-start",
                "title": "Start review",
                "node_type": "workflow",
                "review_state": "source_backed",
                "source_refs": [SOURCE_REF],
            },
            {
                "item_id": "node-decision-item",
                "node_id": "node-decision",
                "title": "Approve package",
                "node_type": "decision",
                "review_state": "source_backed",
                "source_refs": [SOURCE_REF],
            },
        ],
        "relationship_edges": [
            {
                "item_id": "edge-start-decision-item",
                "edge_id": "edge-start-decision",
                "source_node_id": "node-start",
                "target_node_id": "node-decision",
                "relationship_type": "next",
                "label": "Ready for approval",
                "review_state": "source_backed",
                "source_refs": [SOURCE_REF],
            }
        ],
        "structured_evidence": [
            {
                "item_id": "evidence-item",
                "id": "evidence-row",
                "title": "Accepted evidence",
                "evidence_type": "source_quote",
                "review_state": "source_backed",
                "source_refs": [SOURCE_REF],
            }
        ],
        "evidence_links": [
            {
                "item_id": "evidence-link-item",
                "source_item_id": "evidence-item",
                "target_item_id": "node-decision-item",
                "source_refs": [SOURCE_REF],
            }
        ],
        "tasks": [
            {
                "item_id": "task-item",
                "id": "task-review",
                "title": "Push package to stakeholders",
                "status": "accepted",
                "priority": "high",
                "owner_id": "ops",
                "due_date": "2026-06-01",
                "source_refs": [SOURCE_REF],
            }
        ],
    }
