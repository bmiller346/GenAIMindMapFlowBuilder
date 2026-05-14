import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents.source_refs import attach_source_refs_to_mindmap


def test_attach_source_refs_to_nested_response_data():
    source_document = {"id": "src_demo_v1"}
    chunks = [
        {
            "id": "chk_panel",
            "document_id": "src_demo_v1",
            "text": "Panel schedules must include breaker naming standards and load notes.",
            "page": 7,
            "heading": "Electrical standards",
        }
    ]
    mindmap = {
        "nodes": [
            {
                "id": "root",
                "type": "dataSource",
                "data": {"content": "Electrical Guide"},
            },
            {
                "id": "node-1",
                "type": "response",
                "data": {
                    "data": {
                        "question": "What should panel schedules include?",
                        "summ": "Panel schedules include breaker naming standards.",
                    }
                },
            },
        ],
        "edges": [],
    }

    grounded = attach_source_refs_to_mindmap(mindmap, source_document, chunks)

    nested_refs = grounded["nodes"][1]["data"]["data"]["source_refs"]
    root_refs = grounded["nodes"][0]["data"]["source_refs"]

    assert nested_refs[0]["document_id"] == "src_demo_v1"
    assert nested_refs[0]["page"] == 7
    assert nested_refs[0]["chunk_id"] == "chk_panel"
    assert nested_refs[0]["confidence"] == "inferred"
    assert root_refs[0]["confidence"] == "document"


def test_attach_source_refs_does_not_overwrite_existing_refs():
    existing_ref = {"document_id": "manual-doc", "page": 2}
    mindmap = {
        "nodes": [
            {
                "id": "node-1",
                "type": "response",
                "data": {"data": {"summ": "Panel schedules", "source_refs": [existing_ref]}},
            }
        ]
    }

    grounded = attach_source_refs_to_mindmap(mindmap, {"id": "src_demo_v1"}, [])

    assert grounded["nodes"][0]["data"]["data"]["source_refs"] == [existing_ref]


def test_unmatched_generated_nodes_are_marked_needs_review():
    mindmap = {
        "nodes": [
            {
                "id": "node-1",
                "type": "response",
                "data": {
                    "data": {
                        "summ": "This generated claim has no matching source text.",
                    }
                },
            }
        ]
    }

    grounded = attach_source_refs_to_mindmap(
        mindmap,
        {"id": "src_demo_v1"},
        [{"id": "chk_other", "text": "Unrelated installation notes."}],
    )

    nested_data = grounded["nodes"][0]["data"]["data"]
    assert nested_data["source_refs"] == []
    assert nested_data["status"] == "needs_review"


def test_unmatched_generated_nodes_preserve_existing_status():
    mindmap = {
        "nodes": [
            {
                "id": "node-1",
                "type": "response",
                "data": {
                    "data": {
                        "summ": "Ungrounded but already reviewable.",
                        "status": "ai_generated",
                    }
                },
            }
        ]
    }

    grounded = attach_source_refs_to_mindmap(mindmap, {"id": "src_demo_v1"}, [])

    nested_data = grounded["nodes"][0]["data"]["data"]
    assert nested_data["source_refs"] == []
    assert nested_data["status"] == "ai_generated"
