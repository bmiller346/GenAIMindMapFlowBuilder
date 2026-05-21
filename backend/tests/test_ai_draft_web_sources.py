import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_helpers import build_ai_draft_generation_request, parse_ai_draft_revision_response


def test_web_source_draft_requests_enable_responses_web_search_tool():
    request = build_ai_draft_generation_request(
        prompt="Find current support evidence.",
        graph={"nodes": [], "edges": []},
        scope={"type": "workspace"},
        role="Research Assistant",
        classification={"intent": "custom_prompt", "output_shape": "source_coverage"},
        model="gpt-test",
        source_refs=[],
        source_chunks=[],
        source_context={
            "draft_preferences": {
                "evidence_mode": "web_sources",
                "citation_policy": "required",
            }
        },
    )

    assert request.tools == [{"type": "web_search"}]


def test_web_source_draft_response_allows_real_url_source_refs_only_in_web_mode():
    raw_response = {
        "draft_nodes": [
            {
                "id": "draft-web",
                "title": "Current public evidence",
                "summary": "Backed by a web result.",
                "node_type": "reference",
                "source_refs": [
                    {
                        "document_id": "https://example.com/source",
                        "section": "Evidence",
                        "quote_snippet": "Public evidence snippet",
                    }
                ],
            }
        ],
        "draft_edges": [],
        "draft_annotations": [],
        "source_refs": [
            {
                "document_id": "https://example.com/source",
                "section": "Evidence",
                "quote_snippet": "Public evidence snippet",
            }
        ],
    }

    blocked = parse_ai_draft_revision_response(
        raw_response,
        prompt="Find current support evidence.",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "source_coverage"},
        allow_external_source_refs=False,
    )
    allowed = parse_ai_draft_revision_response(
        raw_response,
        prompt="Find current support evidence.",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "source_coverage"},
        allow_external_source_refs=True,
    )

    assert blocked["draft_nodes"][0]["source_refs"] == []
    assert blocked["source_refs"] == []
    assert allowed["draft_nodes"][0]["source_refs"][0]["document_id"] == "https://example.com/source"
    assert allowed["source_refs"][0]["document_id"] == "https://example.com/source"
