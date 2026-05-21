import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    accept_ai_draft_revision,
    add_source_to_ai_draft_session,
    build_ai_draft_source_context,
    classify_ai_draft_intent,
    generate_ai_draft_session_with_provider,
    generate_node_info_message_with_provider,
    revise_ai_draft_session_with_provider,
)


def _graph():
    return {
        "workspace": {"id": "workspace-cereal", "title": "Breakfast category map"},
        "nodes": [
            {
                "id": "root",
                "title": "Breakfast cereals",
                "summary": "Workspace root",
                "node_type": "concept",
                "status": "reviewed",
                "source_refs": [],
                "metadata": {},
            }
        ],
        "edges": [],
    }


def _graph_with_source_library():
    graph = _graph()
    graph["source_library"] = {
        "documents": [
            {
                "id": "doc-general-mills",
                "filename": "general-mills.txt",
                "coverage": {"cited_chunks": 0, "total_chunks": 1},
                "chunks": [
                    {
                        "id": "chunk-general-mills",
                        "document_id": "doc-general-mills",
                        "page": 1,
                        "heading": "Manufacturers",
                        "snippet": "General Mills makes Cheerios cereal.",
                        "cited_by_count": 0,
                    }
                ],
            }
        ],
        "failures": [],
    }
    return graph


GENERAL_MILLS_REF = {
    "document_id": "doc-general-mills",
    "chunk_id": "chunk-general-mills",
    "page": 1,
    "section": "Manufacturers",
    "quote_snippet": "General Mills makes Cheerios cereal.",
    "confidence": "high",
}


def _general_mills_chunk():
    return {
        "id": "chunk-general-mills",
        "document_id": "doc-general-mills",
        "page": 1,
        "heading": "Manufacturers",
        "text": "General Mills makes Cheerios cereal.",
        "source_ref": GENERAL_MILLS_REF,
    }


def test_node_info_message_answers_without_draft_contract():
    provider = FixtureDocMapAIProvider(
        response_text="This node is a concise overview of breakfast cereals and its immediate context."
    )

    message = generate_node_info_message_with_provider(
        _graph(),
        prompt="What does this node mean?",
        scope={"type": "node", "node_id": "root"},
        message_history=[
            {
                "prompt": "Summarize this node.",
                "answer": "It frames breakfast cereal categories.",
            }
        ],
        provider=provider,
    )

    assert message["answer"].startswith("This node is a concise overview")
    assert message["scope"] == {"type": "node", "node_id": "root"}
    assert message["selected_model"]
    assert message["metadata"]["history_messages"] == 1
    assert provider.requests[0].response_schema is None
    assert provider.requests[0].metadata["feature"] == "node_info_message"
    assert "Recent node Q&A" in provider.requests[0].input[0]["content"]


def _cereal_response(request):
    user_content = request.input[0]["content"]
    prompt_text = user_content.lower()
    if "general mills" in prompt_text:
        nodes = [
            {
                "id": "draft_general_mills",
                "title": "General Mills",
                "summary": "Manufacturer branch for General Mills cereals.",
                "node_type": "category",
                "parent_id": "root",
                "status": "ai_generated",
                "source_refs": [],
                "metadata": {},
            },
            {
                "id": "draft_cheerios",
                "title": "Cheerios",
                "summary": "General Mills cereal example for review.",
                "node_type": "concept",
                "parent_id": "draft_general_mills",
                "status": "ai_generated",
                "source_refs": [],
                "metadata": {},
            },
        ]
        edges = [
            {
                "id": "draft_edge_root_general_mills",
                "source_node_id": "root",
                "target_node_id": "draft_general_mills",
            },
            {
                "id": "draft_edge_general_mills_cheerios",
                "source_node_id": "draft_general_mills",
                "target_node_id": "draft_cheerios",
            },
        ]
    else:
        nodes = [
            {
                "id": "draft_cereals_by_manufacturer",
                "title": "Cereals by manufacturer",
                "summary": "A reviewable manufacturer-first cereal map.",
                "node_type": "category",
                "parent_id": "root",
                "status": "ai_generated",
                "source_refs": [],
                "metadata": {},
            },
            {
                "id": "draft_kellogg",
                "title": "Kellogg",
                "summary": "Manufacturer branch for Kellogg cereals.",
                "node_type": "category",
                "parent_id": "draft_cereals_by_manufacturer",
                "status": "ai_generated",
                "source_refs": [],
                "metadata": {},
            },
            {
                "id": "draft_general_mills",
                "title": "General Mills",
                "summary": "Manufacturer branch for General Mills cereals.",
                "node_type": "category",
                "parent_id": "draft_cereals_by_manufacturer",
                "status": "ai_generated",
                "source_refs": [],
                "metadata": {},
            },
        ]
        edges = [
            {
                "id": "draft_edge_root_cereals",
                "source_node_id": "root",
                "target_node_id": "draft_cereals_by_manufacturer",
            },
            {
                "id": "draft_edge_cereals_kellogg",
                "source_node_id": "draft_cereals_by_manufacturer",
                "target_node_id": "draft_kellogg",
            },
            {
                "id": "draft_edge_cereals_general_mills",
                "source_node_id": "draft_cereals_by_manufacturer",
                "target_node_id": "draft_general_mills",
            },
        ]
    return json.dumps(
        {
            "intent": "create_graph_draft",
            "output_shape": "graph_draft",
            "summary": "Draft cereal branches by manufacturer.",
            "draft_nodes": nodes,
            "draft_edges": edges,
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
            "assumptions": ["Manufacturer examples are generated without source citations."],
            "source_refs": [],
        }
    )


def _cited_general_mills_response(request):
    content = request.input[0]["content"]
    ref = GENERAL_MILLS_REF if "doc-general-mills" in content else {}
    return json.dumps(
        {
            "intent": "reconcile_source_context",
            "output_shape": "graph_draft",
            "summary": "Reconciled General Mills against supplied source.",
            "draft_nodes": [
                {
                    "id": "draft_general_mills",
                    "title": "General Mills",
                    "summary": "General Mills is a cereal manufacturer.",
                    "node_type": "category",
                    "parent_id": "root",
                    "status": "ai_generated",
                    "source_refs": [ref] if ref else [],
                    "metadata": {},
                },
                {
                    "id": "draft_cheerios",
                    "title": "Cheerios",
                    "summary": "Cheerios is a cereal made by General Mills.",
                    "node_type": "concept",
                    "parent_id": "draft_general_mills",
                    "status": "ai_generated",
                    "source_refs": [ref] if ref else [],
                    "metadata": {},
                },
                {
                    "id": "draft_unsupported_claim",
                    "title": "Unsupported claim",
                    "summary": "This claim has no supplied citation.",
                    "node_type": "concept",
                    "parent_id": "draft_general_mills",
                    "status": "ai_generated",
                    "source_refs": [],
                    "metadata": {},
                },
            ],
            "draft_edges": [
                {
                    "id": "draft_edge_root_general_mills",
                    "source_node_id": "root",
                    "target_node_id": "draft_general_mills",
                },
                {
                    "id": "draft_edge_general_mills_cheerios",
                    "source_node_id": "draft_general_mills",
                    "target_node_id": "draft_cheerios",
                },
                {
                    "id": "draft_edge_general_mills_unsupported",
                    "source_node_id": "draft_general_mills",
                    "target_node_id": "draft_unsupported_claim",
                },
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
            "assumptions": ["Unsupported claim remains uncited and needs review."],
            "source_refs": [ref] if ref else [],
        }
    )


def test_create_cereal_mind_map_returns_structured_draft_branches():
    provider = FixtureDocMapAIProvider(response_factory=_cereal_response)

    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-cereal",
        prompt="create a mind map for cereals by manufacturer",
        scope={"type": "node", "node_id": "root"},
        provider=provider,
    )

    revision = session["revisions"][0]
    titles = {node["title"] for node in revision["draft_nodes"]}
    assert {"Cereals by manufacturer", "Kellogg", "General Mills"} <= titles
    assert revision["preview_diff"]["added_nodes"] == 3
    assert session["metadata"]["provider"] == "fixture"
    assert session["metadata"]["actual_model"] == provider.requests[0].model
    assert session["metadata"]["model_reason"]


def test_follow_up_revises_same_draft_session():
    provider = FixtureDocMapAIProvider(response_factory=_cereal_response)
    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-cereal",
        prompt="create a mind map for cereals by manufacturer",
        scope={"type": "node", "node_id": "root"},
        provider=provider,
    )

    revised = revise_ai_draft_session_with_provider(
        session,
        _graph(),
        prompt="what about General Mills?",
        provider=provider,
    )

    assert revised["session_id"] == session["session_id"]
    assert len(revised["revisions"]) == 2
    assert revised["prompt_history"][-1]["content"] == "what about General Mills?"
    assert {node["title"] for node in revised["revisions"][-1]["draft_nodes"]} == {
        "General Mills",
        "Cheerios",
    }


def test_explicit_model_selection_wins_for_draft_generation():
    provider = FixtureDocMapAIProvider(response_factory=_cereal_response)

    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-cereal",
        prompt="create a mind map for cereals by manufacturer",
        model="gpt-5.4",
        provider=provider,
    )

    assert provider.requests[0].model == "gpt-5.4"
    assert session["model_policy"]["policy"] == "explicit_model"
    assert session["metadata"]["model_tier"] == "explicit"


def test_intent_classification_maps_output_shapes_and_policy():
    table = classify_ai_draft_intent("turn this into a kanban board")
    coverage = classify_ai_draft_intent("review source coverage and citations")
    plan = classify_ai_draft_intent("create a 30/60/90 day improvement plan")
    package = classify_ai_draft_intent("create a stakeholder review package")
    standards = classify_ai_draft_intent("review this Revit standards folder for completeness")
    roadmap = classify_ai_draft_intent("make this complex issue into a roadmap for my team")
    executive_summary = classify_ai_draft_intent("create an executive summary for leadership")
    news_article = classify_ai_draft_intent("draft a news article from these sources")

    assert table["output_shape"] == "kanban"
    assert table["model_policy"] == "balanced"
    assert coverage["output_shape"] == "source_coverage"
    assert coverage["model_policy"] == "deep_review"
    assert plan["output_shape"] == "tasks"
    assert plan["model_policy"] == "deep_review"
    assert package["output_shape"] == "presentation_sections"
    assert package["model_policy"] == "deep_review"
    assert standards["capability"] == "assess_standards_completeness"
    assert standards["output_shape"] == "completeness_review"
    assert standards["model_policy"] == "deep_review"
    assert roadmap["capability"] == "create_team_roadmap"
    assert roadmap["output_shape"] == "team_roadmap"
    assert executive_summary["capability"] == "draft_executive_summary"
    assert executive_summary["output_shape"] == "executive_summary"
    assert news_article["capability"] == "draft_news_article"
    assert news_article["output_shape"] == "news_article"


def test_intent_classification_honors_connected_package_desired_output():
    package = classify_ai_draft_intent(
        "map fire alarm code dependencies from SD through CA and closeout",
        desired_outputs=["connected_picture_package"],
    )

    assert package["output_shape"] == "connected_picture_package"
    assert package["capability"] == "draft_connected_picture_package"
    assert package["requested_artifact_types"] == ["connected_picture_package"]


def test_intent_classification_maps_enterprise_readiness_findings():
    bottlenecks = classify_ai_draft_intent("find process bottlenecks")
    duplicate_tools = classify_ai_draft_intent("find duplicate tools")
    ownership = classify_ai_draft_intent("find ownership gaps")
    unsupported_systems = classify_ai_draft_intent(
        "find unsupported business-critical systems"
    )

    assert bottlenecks["capability"] == "find_process_bottlenecks"
    assert duplicate_tools["capability"] == "find_duplicate_tools"
    assert duplicate_tools["output_shape"] == "software_overlap_report"
    assert ownership["capability"] == "find_ownership_gaps"
    assert unsupported_systems["capability"] == "find_unsupported_business_critical_systems"
    assert unsupported_systems["output_shape"] == "source_coverage"
    assert {bottlenecks["model_policy"], duplicate_tools["model_policy"], ownership["model_policy"]} == {
        "deep_review"
    }


def test_intent_classification_maps_software_rationalization_to_overlap_report():
    overlap = classify_ai_draft_intent(
        "create a software inventory overlap and license rationalization report"
    )

    assert overlap["capability"] == "find_duplicate_tools"
    assert overlap["output_shape"] == "software_overlap_report"
    assert overlap["model_policy"] == "deep_review"


def test_source_context_includes_scope_library_gaps_chunks_and_draft_state():
    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-cereal",
        prompt="create a mind map for cereals by manufacturer",
        scope={"type": "node", "node_id": "root"},
        provider=FixtureDocMapAIProvider(response_factory=_cereal_response),
    )

    context = build_ai_draft_source_context(
        _graph_with_source_library(),
        scope={"type": "source", "source_id": "doc-general-mills"},
        source_chunks=[_general_mills_chunk()],
        prior_session=session,
    )

    assert context["scope"] == {"type": "source", "source_id": "doc-general-mills"}
    assert context["source_refs"][0]["document_id"] == "doc-general-mills"
    assert context["source_library_gaps"]["documents_with_uncited_chunks"][0]["uncited_chunks"] == 1
    assert context["draft_session_state"]["session_id"] == session["session_id"]
    assert context["draft_session_state"]["latest_revision"]["draft_nodes"]


def test_add_source_mid_session_reconciles_and_preserves_citations_after_accept():
    session = generate_ai_draft_session_with_provider(
        _graph(),
        workspace_id="workspace-cereal",
        prompt="create a mind map for cereals by manufacturer",
        scope={"type": "node", "node_id": "root"},
        provider=FixtureDocMapAIProvider(response_factory=_cereal_response),
    )
    provider = FixtureDocMapAIProvider(response_factory=_cited_general_mills_response)

    reconciled = add_source_to_ai_draft_session(
        session,
        _graph_with_source_library(),
        source_chunks=[_general_mills_chunk()],
        provider=provider,
    )

    latest = reconciled["revisions"][-1]
    cited = {node["id"]: node for node in latest["draft_nodes"]}
    assert cited["draft_general_mills"]["source_refs"] == [GENERAL_MILLS_REF]
    assert cited["draft_cheerios"]["source_refs"] == [GENERAL_MILLS_REF]
    assert cited["draft_unsupported_claim"]["source_refs"] == []
    assert reconciled["metadata"]["last_added_source_refs"] == [GENERAL_MILLS_REF]
    assert "Source context" in provider.requests[0].input[0]["content"]

    accepted_graph, _, _ = accept_ai_draft_revision(
        _graph(),
        reconciled,
        revision_id=latest["revision_id"],
    )

    accepted_by_id = {node["id"]: node for node in accepted_graph["nodes"]}
    assert accepted_by_id["draft_general_mills"]["source_refs"] == [GENERAL_MILLS_REF]
    assert accepted_by_id["draft_cheerios"]["source_refs"] == [GENERAL_MILLS_REF]
    assert accepted_by_id["draft_unsupported_claim"]["status"] == "needs_review"
    assert accepted_by_id["draft_unsupported_claim"]["source_refs"] == []
