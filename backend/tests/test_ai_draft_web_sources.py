import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import json

from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    build_ai_draft_generation_request,
    generate_ai_draft_session_with_provider,
    parse_ai_draft_revision_response,
)


def _graph():
    return {
        "workspace": {"id": "workspace-public-refs", "title": "Public reference review"},
        "nodes": [
            {
                "id": "root",
                "title": "Facility requirements",
                "summary": "Workspace root",
                "node_type": "concept",
                "status": "reviewed",
                "source_refs": [],
                "metadata": {},
            }
        ],
        "edges": [],
    }


def _empty_graph():
    return {
        "workspace": {"id": "workspace-empty-public-refs", "title": "Empty public reference review"},
        "nodes": [],
        "edges": [],
    }


def _revision_response(source_refs=None):
    source_refs = source_refs or []
    return json.dumps(
        {
            "intent": "review_public_reference",
            "output_shape": "graph_draft",
            "summary": "Draft public-reference requirements.",
            "draft_nodes": [
                {
                    "id": "draft_public_reference",
                    "title": "Public reference requirement",
                    "summary": "A cited public-reference claim.",
                    "node_type": "requirement",
                    "parent_id": "root",
                    "status": "ai_generated",
                    "source_refs": source_refs,
                    "metadata": {},
                }
            ],
            "draft_edges": [
                {
                    "id": "draft_edge_root_public_reference",
                    "source_node_id": "root",
                    "target_node_id": "draft_public_reference",
                }
            ],
            "draft_annotations": [],
            "draft_items": [],
            "source_coverage": [],
            "tasks": [],
            "checklist": [],
            "outline": [],
            "table": [],
            "kanban": [],
            "presentation_sections": [],
            "review_annotations": [],
            "assumptions": [],
            "source_refs": source_refs,
        }
    )


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


def test_pasted_url_source_ref_is_durable_when_model_adds_locator_details():
    allowed_ref = {
        "document_id": "https://example.com/source",
        "section": "Pasted URL",
        "quote_snippet": "",
        "confidence": "medium",
        "source_type": "url",
    }
    raw_response = {
        "draft_nodes": [
            {
                "id": "draft-url-correction",
                "title": "Corrected URL-backed item",
                "summary": "Backed by the pasted URL.",
                "node_type": "reference",
                "source_refs": [
                    {
                        "document_id": "https://example.com/source",
                        "section": "Updated evidence",
                        "quote_snippet": "Durable citation details",
                    }
                ],
            }
        ],
        "draft_edges": [],
        "draft_annotations": [],
        "source_refs": [
            {
                "document_id": "https://example.com/source",
                "section": "Updated evidence",
                "quote_snippet": "Durable citation details",
            }
        ],
    }

    parsed = parse_ai_draft_revision_response(
        raw_response,
        prompt="Correct and cite this output item with the pasted URL.",
        scope={"type": "workspace"},
        source_refs=[allowed_ref],
        classification={"output_shape": "source_coverage"},
        allow_external_source_refs=False,
    )

    assert parsed["draft_nodes"][0]["source_refs"][0]["document_id"] == "https://example.com/source"
    assert parsed["draft_nodes"][0]["source_refs"][0]["section"] == "Updated evidence"
    assert parsed["draft_nodes"][0]["source_refs"][0]["quote_snippet"] == "Durable citation details"
    assert parsed["draft_nodes"][0]["source_refs"][0]["source_type"] == "url"
    assert parsed["source_refs"][0]["document_id"] == "https://example.com/source"


def test_public_reference_prompt_infers_web_sources_and_required_citations():
    web_ref = {
        "document_id": "https://example.com/nfpa-70",
        "section": "NFPA 70",
        "quote_snippet": "NFPA 70 current requirement excerpt.",
        "confidence": "high",
    }
    provider = FixtureDocMapAIProvider(response_text=_revision_response([web_ref]))

    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-public-refs",
        prompt="Review NFPA, NEC, IBC, and AHJ requirements for this facility.",
        provider=provider,
    )

    assert provider.requests[0].tools == [{"type": "web_search"}]
    assert session["metadata"]["evidence_mode"] == "web_sources"
    assert session["metadata"]["citation_policy"] == "required"
    assert session["metadata"]["public_reference_policy"] == "current_public_sources_required"
    assert session["source_refs"][0]["document_id"] == "https://example.com/nfpa-70"


def test_public_reference_prompt_prefers_uploaded_sources_when_supplied():
    uploaded_ref = {
        "document_id": "doc-njac",
        "chunk_id": "chunk-njac",
        "page": 12,
        "section": "NJAC 5:23",
        "quote_snippet": "Uploaded NJAC excerpt.",
        "confidence": "high",
    }
    provider = FixtureDocMapAIProvider(response_text=_revision_response([uploaded_ref]))

    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-public-refs",
        prompt="Check the NJAC code requirements against this source.",
        source_chunks=[
            {
                "id": "chunk-njac",
                "document_id": "doc-njac",
                "page": 12,
                "heading": "NJAC 5:23",
                "text": "Uploaded NJAC excerpt.",
                "source_ref": uploaded_ref,
            }
        ],
        provider=provider,
    )

    assert provider.requests[0].tools == []
    assert session["metadata"]["evidence_mode"] == "uploaded_sources"
    assert session["metadata"]["citation_policy"] == "required"
    assert session["metadata"]["public_reference_source_preference"] == "selected_or_uploaded_sources"
    assert session["source_refs"] == [uploaded_ref]


def test_empty_workspace_public_reference_draft_without_sources_stays_reviewable():
    provider = FixtureDocMapAIProvider(response_text=_revision_response([]))

    session = generate_ai_draft_session_with_provider(
        _empty_graph(),
        workspace_id="workspace-empty-public-refs",
        prompt="Create a current public code review package for NFPA 72 and AHJ requirements.",
        provider=provider,
    )

    revision = session["revisions"][0]
    draft_node = revision["draft_nodes"][0]
    issue_codes = [issue["code"] for issue in revision["validation_report"]["issues"]]

    assert provider.requests[0].tools == [{"type": "web_search"}]
    assert session["metadata"]["evidence_mode"] == "web_sources"
    assert session["metadata"]["citation_policy"] == "required"
    assert session["source_refs"] == []
    assert draft_node["source_refs"] == []
    assert draft_node["status"] == "needs_review"
    assert "missing_source_ref" in issue_codes
    assert revision["preview_diff"]["needs_review_repairs"] == 1


def test_pasted_url_prompt_infers_web_current_evidence_repair():
    url_ref = {
        "document_id": "https://example.com/current-code-reference",
        "section": "Public code reference",
        "quote_snippet": "Current public reference excerpt.",
        "confidence": "high",
    }
    provider = FixtureDocMapAIProvider(response_text=_revision_response([url_ref]))

    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-public-refs",
        prompt=(
            "Repair evidence for this row using "
            "https://example.com/current-code-reference and cite the current public source."
        ),
        provider=provider,
    )

    assert provider.requests[0].tools == [{"type": "web_search"}]
    assert session["metadata"]["evidence_mode"] == "web_sources"
    assert session["metadata"]["citation_policy"] == "required"
    assert session["metadata"]["pasted_url_policy"] == "web_current_sources_required"
    assert session["source_refs"][0]["document_id"] == "https://example.com/current-code-reference"
