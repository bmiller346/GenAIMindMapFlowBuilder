import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    classify_ai_draft_intent,
    generate_ai_draft_session_with_provider,
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

    assert table["output_shape"] == "kanban"
    assert table["model_policy"] == "balanced"
    assert coverage["output_shape"] == "source_coverage"
    assert coverage["model_policy"] == "deep_review"
