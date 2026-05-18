import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import fallback_source_mindmap, fallback_source_summary
from graph.ai_contract import validate_ai_mindmap_contract


def sample_source_context():
    source_document = {
        "id": "src_timeout_demo_v1",
        "filename": "timeout-demo.pdf",
        "original_filename": "Timeout Demo.pdf",
        "type": "pdf",
        "file_hash": "abc123",
        "size": 1024,
        "version": 1,
    }
    chunks = [
        {
            "id": "chk_1",
            "document_id": source_document["id"],
            "index": 0,
            "page": 1,
            "heading": "Executive Summary",
            "text": "This source describes an event processing workflow with approvals, retries, and audit logging.",
        },
        {
            "id": "chk_2",
            "document_id": source_document["id"],
            "index": 1,
            "page": 2,
            "heading": "Review Questions",
            "text": "Reviewers need to confirm ownership, duplicate handling, and rollback behavior.",
        },
    ]
    return {
        "source_document": source_document,
        "source_segments": [],
        "document_chunks": chunks,
    }


def test_timeout_summary_preserves_source_context_details():
    summary = fallback_source_summary(sample_source_context())

    assert "Timeout Demo.pdf" in summary
    assert "2 source chunks" in summary
    assert "OpenAI request timed out" in summary


def test_timeout_mindmap_is_valid_reviewable_graph():
    graph = fallback_source_mindmap(sample_source_context(), "flow_123", "component_123")

    validated = validate_ai_mindmap_contract(graph)

    assert len(validated["nodes"]) >= 4
    assert any(node["type"] == "dataSource" for node in validated["nodes"])
    assert any(
        node["data"].get("title") == "AI Derivation Timed Out"
        for node in validated["nodes"]
    )
    assert validated["metadata"]["fallback"] is True
    assert graph["source_library"][0]["component_id"] == "component_123"
