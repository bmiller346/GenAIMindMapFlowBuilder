import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph.ai_contract import (
    AI_GRAPH_CONTRACT_VERSION,
    append_ai_graph_prompt_contract,
    parse_ai_mindmap_response,
    validate_ai_mindmap_contract,
)
from graph.schemas import GraphSchemaError


def test_parse_ai_mindmap_accepts_fenced_react_flow_payload():
    payload = {
        "nodes": [
            {
                "id": "source-1",
                "type": "dataSource",
                "data": {"content": "Plan.md"},
            },
            {
                "id": "task-1",
                "type": "response",
                "position": {"x": "240", "y": 0},
                "data": {
                    "title": "Review plan",
                    "data": {
                        "summ": "Review the implementation plan.",
                        "source_refs": [{"document_id": "doc-1"}],
                    },
                },
            },
        ],
        "edges": [{"id": "edge-1", "source": "source-1", "target": "task-1"}],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    parsed = parse_ai_mindmap_response(f"```json\n{json.dumps(payload)}\n```")

    assert parsed["nodes"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert parsed["nodes"][1]["position"] == {"x": 240.0, "y": 0.0}
    assert parsed["edges"] == payload["edges"]
    assert parsed["metadata"]["ai_graph_contract_version"] == AI_GRAPH_CONTRACT_VERSION


def test_parse_ai_mindmap_unwraps_graph_string_payload():
    graph = {
        "nodes": [
            {
                "id": "source-1",
                "type": "dataSource",
                "data": {"content": "Plan.md"},
            }
        ],
        "edges": [],
        "viewport": {},
    }

    parsed = parse_ai_mindmap_response({"graph": json.dumps(graph)})

    assert parsed["nodes"][0] == {
        **graph["nodes"][0],
        "position": {"x": 0.0, "y": 0.0},
    }
    assert parsed["edges"] == []
    assert parsed["viewport"] == {}
    assert parsed["metadata"]["ai_graph_contract_version"] == AI_GRAPH_CONTRACT_VERSION


def test_validate_ai_mindmap_rejects_schema_invalid_output_before_repair():
    payload = {
        "nodes": [
            {
                "id": "",
                "type": "response",
                "data": {"source_refs": "doc-1"},
            }
        ],
        "edges": [{"source": "root"}],
        "viewport": [],
    }

    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_mindmap_contract(payload)

    assert exc.value.errors == [
        "ai_mindmap.viewport: must be an object",
        "ai_mindmap.nodes.0.id: must be a non-empty string",
        "ai_mindmap.nodes.0.data: response nodes require title, question, summ, or summary text",
        "ai_mindmap.nodes.0.data.source_refs: must be a list when provided",
        "ai_mindmap.edges.0.target: must be a non-empty string",
        "ai_mindmap.edges.0.source: must reference an existing node id",
    ]


def test_validate_ai_mindmap_checks_source_ref_item_shape():
    payload = {
        "nodes": [
            {
                "id": "task-1",
                "type": "response",
                "data": {
                    "title": "Review plan",
                    "source_refs": [
                        {
                            "document_id": "",
                            "page": {"bad": "page"},
                            "section": 123,
                            "chunk_id": [],
                            "quote_snippet": False,
                            "confidence": {},
                        }
                    ],
                },
            }
        ],
        "edges": [],
        "viewport": {},
    }

    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_mindmap_contract(payload)

    assert exc.value.errors == [
        "ai_mindmap.nodes.0.data.source_refs.0.document_id: must be a non-empty string",
        "ai_mindmap.nodes.0.data.source_refs.0.page: must be a string, number, or null when provided",
        "ai_mindmap.nodes.0.data.source_refs.0.section: must be a string when provided",
        "ai_mindmap.nodes.0.data.source_refs.0.chunk_id: must be a string when provided",
        "ai_mindmap.nodes.0.data.source_refs.0.quote_snippet: must be a string when provided",
        "ai_mindmap.nodes.0.data.source_refs.0.confidence: must be a string or number when provided",
    ]


def test_parse_ai_mindmap_accepts_multimodal_question_chain_shape():
    payload = {
        "nodes": [
            {
                "id": "image-source",
                "type": "dataSource",
                "data": {"content": "diagram.png", "name": "image"},
            },
            {
                "id": "image-question",
                "type": "question",
                "data": {"question": "What does the diagram show?"},
            },
            {
                "id": "image-response",
                "type": "response",
                "data": {
                    "data": {
                        "question": "What does the diagram show?",
                        "summ": "The diagram shows a review workflow.",
                    }
                },
            },
        ],
        "edges": [
            {"source": "image-source", "target": "image-question"},
            {"source": "image-question", "target": "image-response"},
        ],
    }

    parsed = parse_ai_mindmap_response(json.dumps(payload))

    assert [node["type"] for node in parsed["nodes"]] == [
        "dataSource",
        "question",
        "response",
    ]
    assert parsed["edges"] == [
        {
            "id": "edge-1-image-source-to-image-question",
            "source": "image-source",
            "target": "image-question",
        },
        {
            "id": "edge-2-image-question-to-image-response",
            "source": "image-question",
            "target": "image-response",
        },
    ]
    assert parsed["viewport"] == {}


def test_validate_ai_mindmap_rejects_duplicate_ids_and_broken_edges():
    payload = {
        "nodes": [
            {
                "id": "node-1",
                "type": "response",
                "data": {"title": "First"},
            },
            {
                "id": "node-1",
                "type": "response",
                "data": {"title": "Duplicate"},
            },
            {
                "id": "node-2",
                "type": "response",
                "data": {"title": "Second"},
            },
        ],
        "edges": [
            {"source": "node-1", "target": "missing-node"},
            {"source": "node-2", "target": "node-2"},
        ],
    }

    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_mindmap_contract(payload)

    assert exc.value.errors == [
        "ai_mindmap.nodes.1.id: duplicate node id 'node-1'",
        "ai_mindmap.edges.0.target: must reference an existing node id",
        "ai_mindmap.edges.1: source and target must be different node ids",
    ]


def test_validate_ai_mindmap_rejects_duplicate_edge_ids():
    payload = {
        "nodes": [
            {"id": "node-1", "type": "response", "data": {"title": "First"}},
            {"id": "node-2", "type": "response", "data": {"title": "Second"}},
            {"id": "node-3", "type": "response", "data": {"title": "Third"}},
        ],
        "edges": [
            {"id": "edge-1", "source": "node-1", "target": "node-2"},
            {"id": "edge-1", "source": "node-2", "target": "node-3"},
        ],
    }

    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_mindmap_contract(payload)

    assert exc.value.errors == [
        "ai_mindmap.edges.1.id: duplicate edge id 'edge-1'",
    ]


def test_validate_ai_mindmap_preserves_existing_contract_metadata():
    payload = {
        "nodes": [
            {"id": "node-1", "type": "response", "data": {"title": "First"}},
        ],
        "edges": [],
        "metadata": {"source": "test"},
    }

    parsed = validate_ai_mindmap_contract(payload)

    assert parsed["metadata"] == {
        "source": "test",
        "ai_graph_contract_version": AI_GRAPH_CONTRACT_VERSION,
    }


def test_append_ai_graph_prompt_contract_is_idempotent():
    prompt = "Return a mind map."

    appended = append_ai_graph_prompt_contract(prompt)
    appended_again = append_ai_graph_prompt_contract(appended)

    assert appended == appended_again
    assert "Canonical AI graph contract:" in appended
    assert f'metadata.ai_graph_contract_version as "{AI_GRAPH_CONTRACT_VERSION}"' in appended
