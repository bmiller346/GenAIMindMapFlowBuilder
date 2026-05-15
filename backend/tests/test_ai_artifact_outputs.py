import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.schemas import ARTIFACT_REGISTRY
from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    accept_ai_draft_revision,
    build_ai_draft_session,
    generate_ai_draft_session_with_provider,
    normalize_requested_artifact_types,
    registered_artifact_types,
    validate_generated_artifacts,
)
from graph.schemas import GraphSchemaError


SOURCE_REF = {
    "document_id": "doc-1",
    "page": 3,
    "section": "Procedure",
    "quote_snippet": "Approval is required before deployment.",
    "confidence": 0.9,
}


def _graph(desired_outputs=None):
    return {
        "workspace": {"id": "workspace-artifacts", "title": "Artifact workspace"},
        "workspace_brief": {
            "configured": True,
            "goal": "Make implementation-ready outputs.",
            "desired_outputs": desired_outputs or ["mind_map"],
        },
        "nodes": [
            {
                "id": "root",
                "title": "Deployment procedure",
                "summary": "Approval and rollout process.",
                "node_type": "procedure",
                "status": "reviewed",
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
            {
                "id": "approval",
                "title": "Approval gate",
                "summary": "Manager approval is required.",
                "node_type": "requirement",
                "status": "reviewed",
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
        ],
        "edges": [
            {
                "id": "edge-root-approval",
                "source_node_id": "root",
                "target_node_id": "approval",
                "relationship_type": "contains",
                "metadata": {},
            }
        ],
    }


def _artifact_response(request):
    artifact_type = request.metadata["output_shape"]
    data_by_type = {
        "knowledge_graph": {
            "relationship_edges": [
                {
                    "source_node_id": "root",
                    "target_node_id": "approval",
                    "relationship_type": "depends_on",
                    "source_signal": "explicit_text",
                    "confidence": 0.84,
                    "rationale": "The deployment process depends on the approval gate.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "review_state": "reviewed",
                }
            ],
            "clusters": [{"id": "cluster-approval", "node_ids": ["root", "approval"]}],
        },
        "flow_chart": {
            "steps": [{"id": "step-1", "node_id": "root", "kind": "process"}],
            "decisions": [{"id": "decision-1", "node_id": "approval", "kind": "decision"}],
            "dependencies": [{"source": "step-1", "target": "decision-1", "type": "approval"}],
        },
        "chart": {
            "chart_spec": {"type": "bar", "x": "status", "y": "count"},
            "data_rows": [{"status": "reviewed", "count": 2, "source_refs": [SOURCE_REF]}],
        },
        "checklist": {
            "items": [{"id": "check-1", "label": "Confirm approval", "review_required": False}],
        },
        "tasks": {
            "tasks": [{"id": "task-1", "title": "Schedule approval", "status": "needs_review"}],
        },
        "source_coverage": {
            "coverage_items": [{"id": "coverage-1", "coverage_status": "covered", "node_id": "root"}],
        },
        "implementation_handoff_package": {
            "summary": "Implementation package for deployment procedure.",
            "accepted_nodes": ["root", "approval"],
            "tasks": [{"id": "task-1", "title": "Schedule approval"}],
            "checklist": [{"id": "check-1", "label": "Confirm approval"}],
            "source_refs": [SOURCE_REF],
            "assumptions": [],
            "risks": [],
            "recommended_next_actions": ["Confirm deployment owner"],
        },
    }
    return json.dumps(
        {
            "intent": f"draft_{artifact_type}",
            "output_shape": artifact_type,
            "summary": f"Draft {artifact_type}.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "generated_artifacts": [
                {
                    "id": f"artifact-{artifact_type}",
                    "artifact_type": artifact_type,
                    "title": artifact_type.replace("_", " ").title(),
                    "status": "draft",
                    "data": data_by_type[artifact_type],
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "validation": {"status": "valid", "issues": []},
                }
            ],
            "source_coverage": [],
            "tasks": [],
            "checklist": [],
            "flow_chart": {},
            "knowledge_graph": {},
            "chart": {},
            "outline": [],
            "table": [],
            "kanban": [],
            "presentation_sections": [],
            "review_annotations": [],
            "assumptions": [],
            "source_refs": [SOURCE_REF],
        }
    )


def test_artifact_registry_contains_required_starter_types():
    expected = {
        "mind_map",
        "knowledge_graph",
        "flow_chart",
        "table",
        "chart",
        "tasks",
        "checklist",
        "sme_questions",
        "missing_info_report",
        "source_coverage",
        "source_repair",
        "implementation_handoff_package",
    }

    assert expected <= set(registered_artifact_types())
    for artifact_type in expected:
        definition = ARTIFACT_REGISTRY[artifact_type]
        assert definition["artifact_type"] == artifact_type
        assert definition["requires"]
        assert isinstance(definition["optional"], list)
        assert definition["generated_schema"]
        assert definition["projection_requirements"]
        assert definition["supported_views"]
        assert definition["preview_component"]
        assert definition["accept_behavior"]
        assert definition["export_behavior"]
        assert definition["validation_rules"]


@pytest.mark.parametrize(
    "artifact_type",
    [
        "knowledge_graph",
        "flow_chart",
        "chart",
        "checklist",
        "tasks",
        "source_coverage",
        "implementation_handoff_package",
    ],
)
def test_workspace_brief_desired_outputs_generate_non_mind_map_artifacts(artifact_type):
    provider = FixtureDocMapAIProvider(response_factory=_artifact_response)

    session = generate_ai_draft_session_with_provider(
        _graph([artifact_type]),
        workspace_id="workspace-artifacts",
        prompt="Create the requested workspace output.",
        provider=provider,
    )

    revision = session["revisions"][0]
    artifact = revision["generated_artifacts"][0]
    assert provider.requests[0].metadata["output_shape"] == artifact_type
    assert session["metadata"]["requested_artifact_types"] == [artifact_type]
    assert artifact["artifact_type"] == artifact_type
    assert artifact["provenance"]["input_scope"]["type"] == "workspace"
    assert artifact["provenance"]["input_source_refs"] == [SOURCE_REF]
    assert artifact["validation"]["status"] == "valid"
    assert revision["preview_diff"]["added_artifacts"] == 1


def test_knowledge_graph_relationship_contract_marks_inferred_edges_needs_review():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "kg-1",
                "artifact_type": "knowledge_graph",
                "data": {
                    "relationship_edges": [
                        {
                            "source_node_id": "root",
                            "target_node_id": "approval",
                            "relationship_type": "similar_to",
                            "source_signal": "semantic_similarity",
                            "confidence": 0.51,
                            "rationale": "The wording appears similar.",
                            "assumptions": ["Similarity is AI-inferred."],
                            "review_state": "reviewed",
                        }
                    ]
                },
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="knowledge_graph",
        input_source_refs=[],
    )

    edge = artifact["data"]["relationship_edges"][0]
    assert edge["review_state"] == "needs_review"
    assert artifact["status"] == "needs_review"
    assert artifact["provenance"]["validation_status"] == "needs_review"


def test_accepting_knowledge_graph_artifact_adds_relationship_edges():
    graph = _graph(["knowledge_graph"])
    session = build_ai_draft_session(
        workspace_id="workspace-artifacts",
        prompt="Find connection candidates.",
        scope={"type": "workspace"},
        role="Gap Analyst",
        intent="draft_knowledge_graph",
        draft_nodes=[],
        draft_edges=[],
        draft_annotations=[],
        generated_artifacts=[
            {
                "id": "artifact-knowledge-graph",
                "artifact_type": "knowledge_graph",
                "title": "Knowledge Graph",
                "status": "draft",
                "data": {
                    "relationship_edges": [
                        {
                            "source_node_id": "root",
                            "target_node_id": "approval",
                            "relationship_type": "depends_on",
                            "source_signal": "explicit_text",
                            "confidence": 0.84,
                            "rationale": "Deployment depends on approval.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "review_state": "reviewed",
                        }
                    ]
                },
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            }
        ],
    )

    accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode="append",
    )

    relationship_edges = [
        edge
        for edge in accepted_graph["edges"]
        if edge["relationship_type"] == "depends_on"
    ]
    assert len(relationship_edges) == 1
    edge = relationship_edges[0]
    assert edge["source_node_id"] == "root"
    assert edge["target_node_id"] == "approval"
    assert edge["metadata"]["artifact_id"] == "artifact-knowledge-graph"
    assert edge["metadata"]["confidence"] == 0.84
    assert edge["metadata"]["review_state"] == "reviewed"
    assert edge["source_refs"] == [SOURCE_REF]
    assert result["preview_diff"]["added_edges"] == 1
    assert result["preview_diff"]["relationship_edges"] == 1
    assert "item_artifact-knowledge-graph" in result["accepted_item_ids"]


def test_unregistered_artifact_types_are_rejected_and_dropped_from_desired_outputs():
    assert normalize_requested_artifact_types(["knowledge_graph", "mystery_box"]) == [
        "knowledge_graph"
    ]

    with pytest.raises(GraphSchemaError) as exc:
        validate_generated_artifacts(
            [{"id": "bad", "artifact_type": "mystery_box", "data": {}}],
            scope={"type": "workspace"},
            model_provider="fixture",
            model="gpt-test",
            ai_role="Ask AI",
            prompt_profile="bad",
            input_source_refs=[],
        )

    assert "generated_artifacts.0.artifact_type: unsupported artifact type 'mystery_box'" in exc.value.errors
