import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.schemas import ARTIFACT_REGISTRY, AI_DRAFT_REVISION_OUTPUT_SCHEMA
from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    accept_ai_draft_revision,
    build_ai_draft_session,
    generate_ai_draft_session_with_provider,
    normalize_requested_artifact_types,
    parse_ai_draft_revision_response,
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


def _schema_errors(schema, value, path=()):
    expected_type = schema.get("type")
    allowed_types = expected_type if isinstance(expected_type, list) else [expected_type]
    if "null" in allowed_types and value is None:
        return []
    if "object" in allowed_types:
        if not isinstance(value, dict):
            return [(path, "must be object")]
        errors = []
        properties = schema.get("properties", {})
        for field in schema.get("required", []):
            if field not in value:
                errors.append((path, f"{field!r} is a required property"))
        if schema.get("additionalProperties") is False:
            for field in value:
                if field not in properties:
                    errors.append((path + (field,), "additional properties are not allowed"))
        for field, child_schema in properties.items():
            if field in value:
                errors.extend(_schema_errors(child_schema, value[field], path + (field,)))
        return errors
    if "array" in allowed_types:
        if not isinstance(value, list):
            return [(path, "must be array")]
        errors = []
        item_schema = schema.get("items", {})
        for index, item in enumerate(value):
            errors.extend(_schema_errors(item_schema, item, path + (index,)))
        return errors
    if "string" in allowed_types and isinstance(value, str):
        if "enum" in schema and value not in schema["enum"]:
            return [(path, "must be one of enum values")]
        return []
    if "boolean" in allowed_types and isinstance(value, bool):
        return []
    if "integer" in allowed_types and isinstance(value, int) and not isinstance(value, bool):
        return []
    if "number" in allowed_types and isinstance(value, (int, float)) and not isinstance(value, bool):
        return []
    return [(path, f"must match type {expected_type!r}")]


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
            "edges": [
                {
                    "id": "edge-approve",
                    "source_step_id": "decision-1",
                    "target_step_id": "step-1",
                    "label": "Yes",
                    "relationship_type": "decision_path",
                    "metadata": {"condition": "Approval is granted"},
                }
            ],
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
        "completeness_review": {
            "covered_areas": [{"id": "covered-1", "title": "Template standards"}],
            "missing_areas": [{"id": "missing-1", "title": "Family naming review"}],
            "partial_areas": [],
            "duplicate_conflicting_areas": [],
            "stale_deprecated_candidates": [],
            "recommended_roadmap": ["Confirm expected Revit standards coverage"],
            "sme_questions": ["Which team owns the family naming standard?"],
        },
        "team_roadmap": {
            "context": "The team needs to understand the deployment procedure.",
            "workstreams": [{"id": "workstream-1", "title": "Approval readiness"}],
            "milestones": [{"id": "milestone-1", "title": "Approval gate confirmed"}],
            "dependencies": [],
            "risks": [],
            "required_decisions": ["Confirm approval owner"],
            "recommended_next_actions": ["Create implementation tasks"],
            "source_backed_appendix": [{"id": "appendix-1", "source_refs": [SOURCE_REF]}],
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
        "executive_summary": {
            "title": "Deployment Approval Summary",
            "summary": "Deployment depends on manager approval before rollout.",
            "key_points": [
                {
                    "id": "point-approval",
                    "title": "Approval is required",
                    "description": "Manager approval is required before deployment.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "metadata": {},
                }
            ],
            "recommended_actions": [],
            "risks": [],
            "source_backed_appendix": [
                {
                    "id": "appendix-approval",
                    "title": "Approval evidence",
                    "description": "Approval is required before deployment.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "metadata": {},
                }
            ],
            "source_refs": [SOURCE_REF],
            "assumptions": [],
        },
        "news_article": {
            "headline": "Deployment Process Adds Approval Gate",
            "dek": "Manager review is required before rollout.",
            "lede": "The deployment procedure requires approval before rollout.",
            "body": "Teams must confirm manager approval before deployment begins.",
            "sections": [
                {
                    "id": "section-approval",
                    "title": "Approval gate",
                    "description": "Manager approval is required before deployment.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "metadata": {},
                }
            ],
            "quotes": [],
            "fact_checks": [],
            "source_refs": [SOURCE_REF],
            "assumptions": [],
        },
        "software_overlap_report": {
            "summary": "Two approved tools appear to support the same approval workflow.",
            "inventory_items": [
                {
                    "id": "app-approvals",
                    "name": "Approvals Hub",
                    "entity_type": "application",
                    "node_id": "root",
                    "vendor": "Contoso",
                    "source_refs": [SOURCE_REF],
                },
                {
                    "id": "app-workflow",
                    "name": "Workflow Desk",
                    "entity_type": "application",
                    "node_id": "approval",
                    "vendor": "Fabrikam",
                    "source_refs": [SOURCE_REF],
                },
            ],
            "overlap_candidates": [
                {
                    "id": "overlap-approval-workflow",
                    "title": "Approval workflow overlap",
                    "application_ids": ["app-approvals", "app-workflow"],
                    "overlap_dimensions": ["approval workflow", "manager users"],
                    "score": 0.82,
                    "scoring_factors": [
                        {
                            "factor": "shared_workflow",
                            "weight": 0.6,
                            "evidence": "Both tools support approval routing.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                        }
                    ],
                    "recommendation": "Review standard tool decision with the owner.",
                    "recommended_review_questions": [
                        "Which application is the approved standard for deployment approvals?"
                    ],
                    "confidence": 0.74,
                    "rationale": "Both tools appear in the approval workflow.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "review_state": "reviewed",
                }
            ],
            "rationalization_actions": [
                {
                    "id": "action-standard-review",
                    "title": "Confirm approval workflow standard",
                    "action_type": "owner_review",
                    "target_application_ids": ["app-approvals", "app-workflow"],
                    "owner_id": "",
                    "priority": "medium",
                    "status": "needs_review",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                }
            ],
            "relationship_edges": [
                {
                    "source_node_id": "root",
                    "target_node_id": "approval",
                    "relationship_type": "overlaps_on",
                    "source_signal": "explicit_text",
                    "confidence": 0.74,
                    "rationale": "Both applications support the same approval workflow.",
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "review_state": "reviewed",
                }
            ],
            "source_refs": [SOURCE_REF],
            "assumptions": [],
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
        "completeness_review",
        "software_overlap_report",
        "team_roadmap",
        "source_coverage",
        "source_repair",
        "implementation_handoff_package",
        "executive_summary",
        "news_article",
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


def test_publishable_package_artifacts_are_registered_and_schema_addressable():
    expected = {
        "completeness_review",
        "implementation_handoff_package",
        "team_roadmap",
        "executive_output",
        "executive_summary",
        "news_article",
        "newsletter",
    }

    assert expected <= set(registered_artifact_types())
    assert expected <= set(AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]["output_shape"]["enum"])
    assert {
        "executive_output",
        "executive_summary",
        "news_article",
        "newsletter",
    } <= set(AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"])

    for artifact_type in expected:
        definition = ARTIFACT_REGISTRY[artifact_type]
        assert definition["artifact_type"] == artifact_type
        assert definition["generated_schema"]
        assert definition["projection_requirements"]


def test_ai_draft_revision_output_schema_is_strict_through_nested_package_shapes():
    def assert_strict_object_schema(schema, path):
        schema_type = schema.get("type")
        is_object = schema_type == "object" or (
            isinstance(schema_type, list) and "object" in schema_type
        )
        if is_object:
            properties = schema.get("properties", {})
            assert schema.get("additionalProperties") is False, path
            assert set(schema.get("required", [])) == set(properties), path
            for key, value in properties.items():
                assert_strict_object_schema(value, f"{path}.{key}")
        if schema_type == "array" or (isinstance(schema_type, list) and "array" in schema_type):
            assert_strict_object_schema(schema.get("items", {}), f"{path}[]")
        for combiner in ("anyOf", "oneOf", "allOf"):
            for index, option in enumerate(schema.get(combiner, []) or []):
                assert_strict_object_schema(option, f"{path}.{combiner}.{index}")

    assert_strict_object_schema(AI_DRAFT_REVISION_OUTPUT_SCHEMA, "AI_DRAFT_REVISION_OUTPUT_SCHEMA")


@pytest.mark.parametrize(
    "artifact_type",
    [
        "knowledge_graph",
        "flow_chart",
        "chart",
        "checklist",
        "tasks",
        "source_coverage",
        "completeness_review",
        "software_overlap_report",
        "team_roadmap",
        "implementation_handoff_package",
        "executive_summary",
        "news_article",
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


def test_web_package_artifact_source_refs_accept_urls_only_in_web_mode():
    raw_response = {
        "intent": "draft_news_article",
        "output_shape": "news_article",
        "summary": "Draft current article.",
        "draft_nodes": [],
        "draft_edges": [],
        "draft_annotations": [],
        "draft_items": [],
        "generated_artifacts": [
            {
                "id": "artifact-web-news",
                "artifact_type": "news_article",
                "title": "Current Source Article",
                "status": "draft",
                "data": {
                    "headline": "Current Source Update",
                    "lede": "A current public source supports this update.",
                    "sections": [
                        {
                            "id": "section-web",
                            "title": "Public evidence",
                            "description": "A public source supports this claim.",
                            "source_refs": [
                                {
                                    "document_id": "https://example.com/current-source",
                                    "section": "Public evidence",
                                    "quote_snippet": "Public source text.",
                                }
                            ],
                        }
                    ],
                    "quotes": [],
                    "fact_checks": [],
                    "source_refs": [
                        {
                            "document_id": "https://example.com/current-source",
                            "section": "Public evidence",
                            "quote_snippet": "Public source text.",
                        }
                    ],
                    "assumptions": [],
                },
                "source_refs": [
                    {
                        "document_id": "https://example.com/current-source",
                        "section": "Public evidence",
                        "quote_snippet": "Public source text.",
                    }
                ],
                "assumptions": [],
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
        "source_refs": [
            {
                "document_id": "https://example.com/current-source",
                "section": "Public evidence",
                "quote_snippet": "Public source text.",
            }
        ],
    }

    blocked = parse_ai_draft_revision_response(
        raw_response,
        prompt="Create a current news article.",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "news_article"},
        allow_external_source_refs=False,
    )
    allowed = parse_ai_draft_revision_response(
        raw_response,
        prompt="Create a current news article.",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "news_article"},
        allow_external_source_refs=True,
    )

    assert blocked["source_refs"] == []
    blocked_artifact = blocked["generated_artifacts"][0]
    assert blocked_artifact["source_refs"] == []
    assert blocked_artifact["data"]["source_refs"] == []
    assert blocked_artifact["data"]["sections"][0]["source_refs"] == []
    assert blocked_artifact["data"]["sections"][0]["needs_review"] is True

    allowed_artifact = allowed["generated_artifacts"][0]
    assert allowed["source_refs"][0]["document_id"] == "https://example.com/current-source"
    assert allowed_artifact["source_refs"][0]["document_id"] == "https://example.com/current-source"
    assert allowed_artifact["data"]["sections"][0]["source_backed"] is True


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


def test_news_article_package_marks_unsupported_items_needs_review():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "article-unsupported",
                "artifact_type": "news_article",
                "data": {
                    "headline": "Launch Update",
                    "lede": "The launch is moving through review.",
                    "sections": [
                        {
                            "id": "section-supported",
                            "title": "Supported item",
                            "description": "Approval is required before deployment.",
                            "source_refs": [SOURCE_REF],
                        },
                        {
                            "id": "section-unsupported",
                            "title": "Unsupported item",
                            "description": "The pilot will save 20 hours per week.",
                            "source_refs": [],
                            "assumptions": [],
                        },
                    ],
                    "quotes": [
                        {
                            "id": "quote-unsupported",
                            "title": "Unverified quote",
                            "description": "A named stakeholder quote without evidence.",
                        }
                    ],
                    "fact_checks": [
                        {
                            "id": "claim-unsupported",
                            "title": "Unverified metric",
                            "description": "The ROI improves immediately.",
                            "source_refs": [],
                        }
                    ],
                },
                "source_refs": [SOURCE_REF],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="news_article",
        input_source_refs=[SOURCE_REF],
    )

    supported, unsupported = artifact["data"]["sections"]
    assert supported["source_backed"] is True
    assert supported["needs_review"] is False
    assert unsupported["source_backed"] is False
    assert unsupported["needs_review"] is True
    assert unsupported["status"] == "needs_review"
    assert artifact["data"]["quotes"][0]["needs_review"] is True
    assert artifact["data"]["fact_checks"][0]["needs_review"] is True
    assert artifact["status"] == "needs_review"
    assert artifact["validation"]["status"] == "needs_review"
    assert [
        issue["path"]
        for issue in artifact["validation"]["issues"]
        if issue["code"] == "news_article_item_needs_review"
    ] == [
        "generated_artifacts.0.data.sections.1",
        "generated_artifacts.0.data.quotes.0",
        "generated_artifacts.0.data.fact_checks.0",
    ]


def test_flow_chart_artifact_preserves_branch_labels_and_flags_unlabeled_decisions():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "flow-1",
                "artifact_type": "flow_chart",
                "data": {
                    "steps": [
                        {"id": "intake", "title": "Intake"},
                        {"id": "decision", "title": "Approved?"},
                        {"id": "handoff", "title": "Handoff"},
                    ],
                    "decisions": [{"id": "decision", "title": "Approved?"}],
                    "edges": [
                        {
                            "id": "edge-yes",
                            "source_step_id": "decision",
                            "target_step_id": "handoff",
                            "relationship_type": "decision_path",
                            "metadata": {"branch_label": "Yes", "condition": "Approved"},
                        },
                        {
                            "id": "edge-no",
                            "source_step_id": "decision",
                            "target_step_id": "intake",
                            "relationship_type": "exception",
                        },
                    ],
                },
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="flow_chart",
        input_source_refs=[],
    )

    edges = artifact["data"]["edges"]
    assert edges[0]["label"] == "Yes"
    assert artifact["validation"]["status"] == "needs_review"
    assert "decision and exception paths should include label" in artifact["validation"]["issues"][0]


def test_top_level_executive_summary_projection_becomes_review_artifact_without_nodes():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "draft_executive_summary",
            "output_shape": "executive_summary",
            "summary": "Executive-ready summary.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "generated_artifacts": [],
            "executive_summary": {
                "title": "Deployment approval summary",
                "summary": "Deployment depends on manager approval.",
                "key_points": [
                    {
                        "id": "point-1",
                        "title": "Approval required",
                        "description": "Approval is required before deployment.",
                        "source_refs": [SOURCE_REF],
                        "assumptions": [],
                        "metadata": {},
                    }
                ],
                "recommended_actions": [],
                "risks": [],
                "source_backed_appendix": [],
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            },
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
        },
        prompt="Create an executive summary.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={"output_shape": "executive_summary", "intent": "draft_executive_summary"},
    )

    assert revision["draft_nodes"] == []
    [artifact] = revision["generated_artifacts"]
    assert artifact["artifact_type"] == "executive_summary"
    assert artifact["data"]["summary"] == "Deployment depends on manager approval."
    assert artifact["validation"]["status"] == "valid"
    [draft_item] = revision["draft_items"]
    assert draft_item["item_type"] == "artifact"
    assert draft_item["title"] == "Deployment approval summary"
    assert draft_item["content"] == "Deployment depends on manager approval."
    assert draft_item["metadata"]["artifact_type"] == "executive_summary"


def test_secondary_requested_executive_summary_projection_becomes_review_artifact():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "draft_knowledge_graph",
            "output_shape": "knowledge_graph",
            "summary": "Graph plus executive-ready output.",
            "draft_nodes": [
                {
                    "id": "draft_goal",
                    "title": "Governed AI assistant pilot",
                    "summary": "Pilot the assistant with clear approval gates.",
                    "node_type": "concept",
                    "source_refs": [SOURCE_REF],
                }
            ],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "generated_artifacts": [],
            "executive_summary": {
                "title": "AI assistant pilot summary",
                "summary": "Approve a governed pilot before broad deployment.",
                "key_points": [
                    {
                        "id": "point-1",
                        "title": "Pilot gate",
                        "description": "Approval is required before deployment.",
                        "source_refs": [SOURCE_REF],
                        "assumptions": [],
                        "metadata": {},
                    }
                ],
                "recommended_actions": [],
                "risks": [],
                "source_backed_appendix": [],
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            },
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
        },
        prompt="Create a knowledge graph and include an executive summary.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={
            "output_shape": "knowledge_graph",
            "intent": "draft_knowledge_graph",
            "requested_artifact_types": ["knowledge_graph", "executive_summary"],
        },
    )

    assert revision["output_shape"] == "knowledge_graph"
    [artifact] = revision["generated_artifacts"]
    assert artifact["artifact_type"] == "executive_summary"
    assert artifact["data"]["summary"] == "Approve a governed pilot before broad deployment."


def test_top_level_executive_output_projection_becomes_review_artifact_without_nodes():
    item = {
        "id": "finding-approval",
        "title": "Approval gate",
        "description": "Manager approval is required before deployment.",
        "status": "needs_review",
        "priority": "high",
        "owner_id": None,
        "due_date": None,
        "source_refs": [SOURCE_REF],
        "source_backed": True,
        "needs_review": False,
        "metadata": {},
    }
    revision = parse_ai_draft_revision_response(
        {
            "intent": "draft_executive_output",
            "output_shape": "executive_output",
            "summary": "Executive output ready for review.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "generated_artifacts": [],
            "executive_output": {
                "contract_version": "1",
                "title": "Deployment Executive Output",
                "summary": "Approve a controlled deployment pilot after confirming the approval owner.",
                "key_findings": [item],
                "recommended_actions": [item],
                "risks": [],
                "required_decisions": [item],
                "source_backed_appendix": [item],
                "assumptions": [],
                "metadata": {
                    "node_count": 1,
                    "source_backed_node_count": 1,
                    "needs_review_count": 0,
                    "task_count": 0,
                },
            },
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
            "source_refs": [SOURCE_REF],
            "assumptions": [],
        },
        prompt="Create executive output.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={"output_shape": "executive_output", "intent": "draft_executive_output"},
    )

    [artifact] = revision["generated_artifacts"]
    assert artifact["artifact_type"] == "executive_output"
    assert artifact["data"]["summary"].startswith("Approve a controlled deployment pilot")
    assert revision["draft_items"][0]["metadata"]["artifact_type"] == "executive_output"


def test_news_article_artifact_marks_unsourced_article_items_needs_review():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "article-1",
                "artifact_type": "news_article",
                "data": {
                    "headline": "Deployment Process Adds Approval Gate",
                    "lede": "Deployment now includes an approval gate.",
                    "sections": [
                        {
                            "id": "section-1",
                            "title": "Approval gate",
                            "description": "The team should confirm the approval owner.",
                            "source_refs": [],
                            "assumptions": ["Owner is inferred from workflow context."],
                        }
                    ],
                    "quotes": [],
                    "fact_checks": [],
                },
                "source_refs": [],
                "assumptions": ["Article includes generated context needing review."],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="news_article",
        input_source_refs=[],
    )

    assert artifact["status"] == "needs_review"
    assert artifact["data"]["sections"][0]["status"] == "needs_review"
    assert artifact["data"]["sections"][0]["source_backed"] is False
    assert artifact["data"]["sections"][0]["needs_review"] is True
    assert artifact["data"]["sections"][0]["review_state"] == "needs_review"
    assert artifact["validation"]["status"] == "needs_review"
    assert artifact["validation"]["issues"][0]["code"] == "news_article_item_needs_review"


def test_news_article_artifact_normalizes_rich_article_item_review_state():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "article-rich",
                "artifact_type": "news_article",
                "data": {
                    "headline": "Deployment Process Adds Approval Gate",
                    "lede": "Deployment now includes an approval gate.",
                    "sections": [
                        {
                            "id": "section-backed",
                            "title": "Approval gate",
                            "description": "Manager approval is required before deployment.",
                            "confidence": 0.91,
                            "source_signal": "explicit_text",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "metadata": {},
                        }
                    ],
                    "quotes": [
                        {
                            "id": "quote-review",
                            "title": "Stakeholder quote",
                            "content": "The approval owner should be confirmed.",
                            "source_refs": [],
                            "assumptions": [],
                            "metadata": {},
                        }
                    ],
                    "fact_checks": [
                        {
                            "id": "fact-backed",
                            "title": "Approval is required",
                            "description": "The procedure requires approval before deployment.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "metadata": {"source_signal": "explicit_text"},
                        }
                    ],
                    "source_backed_appendix": [
                        {
                            "id": "appendix-backed",
                            "title": "Approval evidence",
                            "description": "Approval is required before deployment.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "metadata": {},
                        }
                    ],
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                },
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="news_article",
        input_source_refs=[SOURCE_REF],
    )

    section = artifact["data"]["sections"][0]
    quote = artifact["data"]["quotes"][0]
    fact_check = artifact["data"]["fact_checks"][0]
    appendix = artifact["data"]["source_backed_appendix"][0]
    assert section["source_backed"] is True
    assert section["needs_review"] is False
    assert section["review_state"] == "reviewed"
    assert section["status"] == "reviewed"
    assert fact_check["source_backed"] is True
    assert appendix["source_backed"] is True
    assert quote["source_backed"] is False
    assert quote["needs_review"] is True
    assert quote["assumptions"] == [
        "Source evidence is missing for this news article item."
    ]
    assert quote["metadata"]["review_reason"] == (
        "Source evidence is missing for this news article item."
    )
    assert artifact["status"] == "needs_review"
    assert artifact["validation"]["status"] == "needs_review"


def test_top_level_news_article_projection_becomes_reviewable_artifact_item():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "draft_news_article",
            "output_shape": "news_article",
            "summary": "Article draft.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "generated_artifacts": [],
            "news_article": {
                "headline": "Deployment Process Adds Approval Gate",
                "dek": "Manager review is required before rollout.",
                "lede": "The deployment procedure requires approval before rollout.",
                "body": "Teams must confirm manager approval before deployment begins.",
                "sections": [],
                "quotes": [],
                "fact_checks": [],
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            },
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
        },
        prompt="Draft a news article.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={"output_shape": "news_article", "intent": "draft_news_article"},
    )

    [artifact] = revision["generated_artifacts"]
    [draft_item] = revision["draft_items"]
    assert artifact["artifact_type"] == "news_article"
    assert draft_item["title"] == "Deployment Process Adds Approval Gate"
    assert draft_item["content"] == "Manager review is required before rollout."


def test_news_article_artifact_requires_headline_and_article_content():
    with pytest.raises(GraphSchemaError) as exc:
        validate_generated_artifacts(
            [
                {
                    "id": "article-empty",
                    "artifact_type": "news_article",
                    "data": {
                        "headline": "",
                        "lede": "",
                        "body": "",
                        "sections": [],
                        "quotes": [],
                        "fact_checks": [],
                    },
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                }
            ],
            scope={"type": "workspace"},
            model_provider="fixture",
            model="gpt-test",
            ai_role="Ask AI",
            prompt_profile="news_article",
            input_source_refs=[SOURCE_REF],
        )

    assert any("news_article requires a headline" in error for error in exc.value.errors)
    assert any(
        "news_article requires lede, body, or sections" in error
        for error in exc.value.errors
    )


def test_newsletter_artifact_normalizes_visual_blocks_and_review_metadata():
    artifacts = validate_generated_artifacts(
        [
            {
                "id": "newsletter-1",
                "artifact_type": "newsletter",
                "data": {
                    "title": "Deployment Monthly Update",
                    "issue_label": "May 2026",
                    "audience": "Operations leaders",
                    "cadence": "Monthly",
                    "opening_note": "Deployment readiness is moving through approval.",
                    "highlights": [
                        {
                            "id": "highlight-approval",
                            "title": "Approval gate",
                            "description": "Manager approval is required.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "metadata": {},
                        }
                    ],
                    "sections": [],
                    "upcoming": [],
                    "risks": [],
                    "decisions_needed": [],
                    "visual_blocks": [
                        {
                            "id": "visual-flow",
                            "title": "Approval flow",
                            "description": "Insert a flowchart for approval and publish.",
                            "source_refs": [],
                            "assumptions": [],
                            "metadata": {"visual_type": "flowchart"},
                        }
                    ],
                    "source_backed_appendix": [],
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                    "metadata": {},
                },
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Ask AI",
        prompt_profile="newsletter",
        input_source_refs=[SOURCE_REF],
    )

    newsletter = artifacts[0]
    highlight = newsletter["data"]["highlights"][0]
    visual = newsletter["data"]["visual_blocks"][0]
    assert newsletter["artifact_type"] == "newsletter"
    assert highlight["source_backed"] is True
    assert highlight["needs_review"] is False
    assert highlight["review_state"] == "reviewed"
    assert visual["source_backed"] is False
    assert visual["needs_review"] is True
    assert visual["review_state"] == "needs_review"
    assert visual["assumptions"] == ["Source evidence is missing for this newsletter item."]
    assert newsletter["validation"]["status"] == "needs_review"
    assert newsletter["validation"]["issues"][0]["code"] == "newsletter_item_needs_review"


def test_newsletter_artifact_requires_title_and_update_content():
    with pytest.raises(GraphSchemaError) as exc:
        validate_generated_artifacts(
            [
                {
                    "id": "newsletter-empty",
                    "artifact_type": "newsletter",
                    "data": {
                        "title": "",
                        "issue_label": "",
                        "audience": "",
                        "cadence": "",
                        "opening_note": "",
                        "highlights": [],
                        "sections": [],
                        "upcoming": [],
                        "risks": [],
                        "decisions_needed": [],
                        "visual_blocks": [],
                        "source_backed_appendix": [],
                    },
                    "source_refs": [SOURCE_REF],
                    "assumptions": [],
                }
            ],
            scope={"type": "workspace"},
            model_provider="fixture",
            model="gpt-test",
            ai_role="Ask AI",
            prompt_profile="newsletter",
            input_source_refs=[SOURCE_REF],
        )

    assert any("newsletter requires a title" in error for error in exc.value.errors)
    assert any("newsletter requires opening_note" in error for error in exc.value.errors)


def test_secondary_requested_news_article_projection_becomes_generated_artifact():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "draft_knowledge_graph",
            "output_shape": "knowledge_graph",
            "summary": "Knowledge graph plus article draft.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "generated_artifacts": [],
            "knowledge_graph": {
                "relationship_edges": [],
                "clusters": [],
            },
            "news_article": {
                "headline": "Deployment Process Adds Approval Gate",
                "dek": "Manager review is required before rollout.",
                "lede": "The deployment procedure requires approval before rollout.",
                "body": "Teams must confirm manager approval before deployment begins.",
                "sections": [
                    {
                        "id": "section-approval",
                        "title": "Approval gate",
                        "description": "Manager approval is required before deployment.",
                        "source_refs": [SOURCE_REF],
                        "assumptions": [],
                        "metadata": {},
                    }
                ],
                "quotes": [],
                "fact_checks": [],
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            },
            "source_coverage": [],
            "tasks": [],
            "checklist": [],
            "flow_chart": {},
            "chart": {},
            "outline": [],
            "table": [],
            "kanban": [],
            "presentation_sections": [],
            "review_annotations": [],
            "assumptions": [],
            "source_refs": [SOURCE_REF],
        },
        prompt="Create a graph and article.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={
            "output_shape": "knowledge_graph",
            "intent": "draft_knowledge_graph",
            "requested_artifact_types": ["knowledge_graph", "news_article"],
        },
    )

    artifacts = revision["generated_artifacts"]
    assert [artifact["artifact_type"] for artifact in artifacts] == ["news_article"]
    article = artifacts[0]
    assert article["data"]["sections"][0]["source_backed"] is True
    assert article["data"]["sections"][0]["review_state"] == "reviewed"


def test_top_level_flow_chart_projection_becomes_tolerant_artifact():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "custom_prompt",
            "output_shape": "flow_chart",
            "summary": "Draft a process flow.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "generated_artifacts": [],
            "flow_chart": {
                "nodes": [
                    {"id": "start", "title": "Start", "kind": "process"},
                    {"id": "approved", "title": "Approved?", "kind": "decision"},
                ],
                "decisions": [{"id": "approved", "title": "Approved?", "kind": "decision"}],
                "edges": [
                    {
                        "id": "edge-yes",
                        "source": "approved",
                        "target": "start",
                        "condition": "Yes",
                        "type": "decision_path",
                    }
                ],
            },
        },
        prompt="Draft a flowchart",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "flow_chart", "intent": "custom_prompt"},
    )

    [artifact] = revision["generated_artifacts"]
    assert artifact["artifact_type"] == "flow_chart"
    assert artifact["data"]["steps"][0]["step_type"] == "process"
    assert artifact["data"]["edges"][0]["source_step_id"] == "approved"
    assert artifact["data"]["edges"][0]["label"] == "Yes"


def test_top_level_flow_chart_projection_repairs_schema_limited_artifact_shell():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "custom_prompt",
            "output_shape": "flow_chart",
            "summary": "Draft a process flow.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "generated_artifacts": [
                {
                    "id": "artifact-flow-chart",
                    "artifact_type": "flow_chart",
                    "title": "Workflow map",
                    "status": "draft",
                    "data": {
                        "summary": "Schema-limited generated artifact shell.",
                        "items": [],
                        "source_refs": [],
                        "assumptions": ["Generated shell."],
                    },
                    "source_refs": [],
                    "assumptions": ["Generated shell."],
                }
            ],
            "flow_chart": {
                "steps": [
                    {"id": "start", "title": "Start", "step_type": "process"},
                    {"id": "review", "title": "Review request", "step_type": "decision"},
                ],
                "decisions": [{"id": "review", "title": "Review request", "step_type": "decision"}],
                "edges": [
                    {
                        "id": "edge-approved",
                        "source_step_id": "review",
                        "target_step_id": "start",
                        "label": "Approved",
                        "relationship_type": "decision_path",
                        "metadata": {},
                    }
                ],
            },
        },
        prompt="Draft a flowchart",
        scope={"type": "workspace"},
        source_refs=[],
        classification={"output_shape": "flow_chart", "intent": "custom_prompt"},
    )

    [artifact] = revision["generated_artifacts"]
    assert artifact["id"] == "artifact-flow-chart"
    assert artifact["data"]["steps"][0]["id"] == "start"
    assert artifact["data"]["edges"][0]["label"] == "Approved"


def test_ai_draft_schema_has_first_class_software_overlap_report_output():
    properties = AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]

    assert "software_overlap_report" in properties
    report_schema = properties["software_overlap_report"]
    assert set(report_schema["properties"]) >= {
        "inventory_items",
        "overlap_candidates",
        "rationalization_actions",
        "relationship_edges",
    }
    entity_enum = report_schema["properties"]["inventory_items"]["items"]["properties"]["entity_type"]["enum"]
    assert "software_license" in entity_enum
    assert "software_use_case" in entity_enum


def test_ai_draft_schema_has_first_class_publishable_outputs():
    properties = AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]

    assert "executive_summary" in properties
    assert {"summary", "key_points", "recommended_actions", "risks"} <= set(
        properties["executive_summary"]["properties"]
    )
    assert "news_article" in properties
    assert {"headline", "lede", "body", "sections", "fact_checks"} <= set(
        properties["news_article"]["properties"]
    )
    assert "newsletter" in properties
    assert {"title", "issue_label", "highlights", "visual_blocks", "source_backed_appendix"} <= set(
        properties["newsletter"]["properties"]
    )


def test_software_overlap_report_validation_marks_inferred_candidates_needs_review():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "software-overlap-1",
                "artifact_type": "software_overlap_report",
                "data": {
                    "inventory_items": [
                        {"id": "app-a", "name": "Tool A", "entity_type": "application"},
                        {"id": "app-b", "name": "Tool B", "entity_type": "application"},
                    ],
                    "overlap_candidates": [
                        {
                            "id": "candidate-1",
                            "title": "Tool A and Tool B",
                            "application_ids": ["app-a", "app-b"],
                            "scoring_factors": [
                                {
                                    "factor": "shared_capability",
                                    "evidence": "Both are tagged as workflow automation.",
                                }
                            ],
                            "assumptions": ["Capability tags were inferred from node titles."],
                            "review_state": "reviewed",
                        }
                    ],
                    "rationalization_actions": [],
                    "relationship_edges": [
                        {
                            "source_node_id": "app-a",
                            "target_node_id": "app-b",
                            "relationship_type": "overlaps_on",
                            "source_signal": "ai_inferred",
                            "confidence": 0.62,
                            "rationale": "Both tools appear to support workflow automation.",
                            "assumptions": ["No source confirms the preferred standard."],
                            "review_state": "reviewed",
                        }
                    ],
                },
                "assumptions": ["Inventory overlap is inferred from draft graph context."],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Enterprise Tool Rationalization",
        prompt_profile="software_overlap_report",
        input_source_refs=[],
    )

    candidate = artifact["data"]["overlap_candidates"][0]
    edge = artifact["data"]["relationship_edges"][0]
    factors = {factor["factor"]: factor for factor in candidate["scoring_factors"]}
    assert candidate["score"] == 0
    assert candidate["confidence"] == "possible"
    assert "shared_capability" in factors
    assert candidate["review_state"] == "needs_review"
    assert edge["review_state"] == "needs_review"
    assert artifact["status"] == "needs_review"
    assert artifact["validation"]["status"] == "needs_review"
    assert artifact["validation"]["issues"][0]["code"] == "software_overlap_candidate_needs_review"


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
    assert result["accepted_item_ids"] == [
        "item_artifact-knowledge-graph_relationship_1_root_approval_depends_on"
    ]


def test_accepting_selected_knowledge_graph_relationship_adds_only_selected_edge():
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
                            "id": "rel-approval",
                            "source_node_id": "root",
                            "target_node_id": "approval",
                            "relationship_type": "depends_on",
                            "source_signal": "explicit_text",
                            "confidence": 0.84,
                            "rationale": "Deployment depends on approval.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "review_state": "reviewed",
                        },
                        {
                            "id": "rel-risk",
                            "source_node_id": "approval",
                            "target_node_id": "root",
                            "relationship_type": "blocks",
                            "source_signal": "ai_inferred",
                            "confidence": 0.42,
                            "rationale": "Approval may block launch.",
                            "source_refs": [],
                            "assumptions": ["Approval is required before launch."],
                            "review_state": "needs_review",
                        },
                    ]
                },
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            }
        ],
    )

    revision = session["revisions"][0]
    relationship_items = [
        item for item in revision["draft_items"] if item["item_type"] == "relationship"
    ]
    assert [item["metadata"]["relationship_edge_id"] for item in relationship_items] == [
        "rel-approval",
        "rel-risk",
    ]

    accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode="selected",
        selected_item_ids=["item_rel-risk"],
    )

    relationship_edges = [
        edge
        for edge in accepted_graph["edges"]
        if edge["relationship_type"] in {"depends_on", "blocks"}
    ]
    assert len(relationship_edges) == 1
    edge = relationship_edges[0]
    assert edge["id"] == "rel-risk"
    assert edge["relationship_type"] == "blocks"
    assert edge["metadata"]["relationship_edge_id"] == "rel-risk"
    assert edge["metadata"]["confidence"] == 0.42
    assert result["accepted_edge_ids"] == ["rel-risk"]
    assert result["accepted_item_ids"] == ["item_rel-risk"]
    assert result["preview_diff"]["relationship_edges"] == 1


def test_accepting_software_overlap_report_adds_relationship_edges():
    graph = _graph(["software_overlap_report"])
    session = build_ai_draft_session(
        workspace_id="workspace-artifacts",
        prompt="Find software overlap.",
        scope={"type": "workspace"},
        role="Enterprise Tool Rationalization",
        intent="find_duplicate_tools",
        draft_nodes=[],
        draft_edges=[],
        draft_annotations=[],
        generated_artifacts=[
            {
                "id": "artifact-software-overlap",
                "artifact_type": "software_overlap_report",
                "title": "Software Overlap Report",
                "status": "draft",
                "data": {
                    "inventory_items": [
                        {
                            "id": "root",
                            "name": "Approvals Hub",
                            "entity_type": "application",
                            "category": "workflow",
                            "business_function": "approval",
                            "workflow": "deployment approval",
                            "license_type": "enterprise",
                            "source_refs": [SOURCE_REF],
                        },
                        {
                            "id": "approval",
                            "name": "Workflow Desk",
                            "entity_type": "application",
                            "category": "workflow",
                            "business_function": "approval",
                            "workflow": "deployment approval",
                            "license_type": "enterprise",
                            "source_refs": [SOURCE_REF],
                        },
                    ],
                    "overlap_candidates": [
                        {
                            "id": "candidate-overlap",
                            "title": "Potential approval workflow overlap",
                            "application_ids": ["root", "approval"],
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "review_state": "reviewed",
                        }
                    ],
                    "rationalization_actions": [],
                    "relationship_edges": [
                        {
                            "source_node_id": "root",
                            "target_node_id": "approval",
                            "relationship_type": "overlaps_on",
                            "source_signal": "explicit_text",
                            "confidence": 0.73,
                            "rationale": "Both applications support deployment approvals.",
                            "source_refs": [SOURCE_REF],
                            "assumptions": [],
                            "review_state": "reviewed",
                        }
                    ],
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
        if edge["relationship_type"] == "overlaps_on"
    ]
    assert len(relationship_edges) == 1
    edge = relationship_edges[0]
    assert edge["source_node_id"] == "root"
    assert edge["target_node_id"] == "approval"
    assert edge["metadata"]["artifact_id"] == "artifact-software-overlap"
    assert edge["metadata"]["source"] == "software_overlap_report_artifact"
    assert result["preview_diff"]["relationship_edges"] == 1


def test_selected_accept_returns_only_selected_review_package_artifacts():
    graph = _graph(["executive_summary", "news_article"])
    session = build_ai_draft_session(
        workspace_id="workspace-artifacts",
        prompt="Create review package options.",
        scope={"type": "workspace"},
        role="Enterprise Readiness Planner",
        intent="create_stakeholder_review_package",
        draft_nodes=[],
        draft_edges=[],
        draft_annotations=[],
        generated_artifacts=[
            {
                "id": "artifact-executive-summary",
                "artifact_type": "executive_summary",
                "data": {
                    "title": "Leadership Brief",
                    "summary": "Approve the controlled pilot.",
                    "key_points": [],
                    "recommended_actions": [],
                    "risks": [],
                    "source_backed_appendix": [],
                    "assumptions": [],
                },
                "source_refs": [SOURCE_REF],
            },
            {
                "id": "artifact-news-article",
                "artifact_type": "news_article",
                "data": {
                    "headline": "Pilot Launch Update",
                    "lede": "The launch plan is ready for review.",
                    "sections": [],
                    "quotes": [],
                    "fact_checks": [],
                    "source_refs": [],
                    "assumptions": ["Publish date still needs confirmation."],
                },
                "source_refs": [],
                "assumptions": ["Publish date still needs confirmation."],
            },
        ],
    )

    _accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode="selected",
        selected_item_ids=["item_artifact-executive-summary"],
    )

    assert result["accepted_item_ids"] == ["item_artifact-executive-summary"]
    assert [artifact["id"] for artifact in result["accepted_artifacts"]] == [
        "artifact-executive-summary"
    ]
    assert result["preview_diff"]["accepted_item_ids"] == ["item_artifact-executive-summary"]


def test_unregistered_artifact_types_are_rejected_and_dropped_from_desired_outputs():
    assert normalize_requested_artifact_types(["knowledge_graph", "mystery_box"]) == [
        "knowledge_graph"
    ]


def test_software_overlap_report_is_registered_artifact_type():
    assert normalize_requested_artifact_types(["software_overlap_report"]) == [
        "software_overlap_report"
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


def _connected_picture_package():
    package_id = "connected-package-1"
    metadata = {
        "source": None,
        "scope": None,
        "artifact_type": "connected_picture_package",
        "layout_hint": None,
        "rationale": None,
        "review_reason": None,
        "source_signal": None,
    }
    source_ref = {
        "document_id": SOURCE_REF["document_id"],
        "chunk_id": "chunk-1",
        "page": SOURCE_REF["page"],
        "section": SOURCE_REF["section"],
        "quote_snippet": SOURCE_REF["quote_snippet"],
        "confidence": SOURCE_REF["confidence"],
    }
    review_item = {
        "id": "task-1",
        "package_id": package_id,
        "package_item_id": "task-1",
        "title": "Confirm approval owner",
        "description": "Confirm who owns the approval gate.",
        "status": "needs_review",
        "review_state": "needs_review",
        "needs_review": True,
        "required_sibling_ids": [],
        "dependency_link_ids": ["link-approval-root"],
        "source_refs": [],
        "assumptions": ["Owner was not present in source evidence."],
        "metadata": metadata,
    }
    return {
        "package_id": package_id,
        "primary_nodes": [
            {
                "id": "primary-root",
                "package_id": package_id,
                "package_item_id": "primary-root",
                "node_id": "root",
                "title": "Deployment procedure",
                "summary": "Approval and rollout process.",
                "node_type": "procedure",
                "status": "reviewed",
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": [],
                "dependency_link_ids": ["link-approval-root"],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            },
            {
                "id": "primary-approval",
                "package_id": package_id,
                "package_item_id": "primary-approval",
                "node_id": "approval",
                "title": "Approval gate",
                "summary": "Approval is required before deployment.",
                "node_type": "requirement",
                "status": "reviewed",
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": [],
                "dependency_link_ids": ["link-approval-root"],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            }
        ],
        "relationship_edges": [
            {
                "id": "edge-root-approval",
                "package_id": package_id,
                "package_item_id": "edge-root-approval",
                "source_node_id": "root",
                "target_node_id": "approval",
                "source_package_item_id": "primary-root",
                "target_package_item_id": "primary-approval",
                "relationship_type": "depends_on",
                "source_signal": "explicit_text",
                "confidence": 0.84,
                "rationale": "Deployment depends on approval.",
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": ["primary-root", "primary-approval"],
                "dependency_link_ids": ["link-approval-root"],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            }
        ],
        "view_lenses": [
            {
                "id": "lens-review",
                "package_id": package_id,
                "package_item_id": "lens-review",
                "lens_type": "review",
                "title": "Review lens",
                "description": "Review package items.",
                "node_ids": ["root"],
                "edge_ids": ["edge-root-approval"],
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": ["primary-root", "edge-root-approval"],
                "dependency_link_ids": ["link-approval-root"],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            }
        ],
        "structured_evidence": [
            {
                "id": "evidence-approval",
                "package_id": package_id,
                "package_item_id": "evidence-approval",
                "title": "Approval evidence",
                "evidence_type": "source_quote",
                "summary": "Approval is required before deployment.",
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": [],
                "dependency_link_ids": [],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            }
        ],
        "evidence_links": [
            {
                "id": "link-approval-root",
                "package_id": package_id,
                "package_item_id": "link-approval-root",
                "source_evidence_id": "evidence-approval",
                "target_type": "primary_node",
                "target_id": "primary-root",
                "target_package_item_id": "primary-root",
                "relationship_type": "supports",
                "rationale": "The evidence supports the primary procedure node.",
                "review_state": "reviewed",
                "needs_review": False,
                "required_sibling_ids": ["evidence-approval", "primary-root"],
                "dependency_link_ids": [],
                "source_refs": [source_ref],
                "assumptions": [],
                "metadata": metadata,
            }
        ],
        "tasks": [review_item],
        "risks": [],
        "decisions": [],
        "repair_targets": [],
        "source_refs": [source_ref],
        "assumptions": [],
        "acceptance_groups": [
            {
                "id": "accept-review",
                "package_id": package_id,
                "title": "Review items",
                "description": "Items safe for preview acceptance.",
                "item_ids": ["primary-root", "primary-approval", "edge-root-approval", "task-1"],
                "required_sibling_ids": ["primary-root", "primary-approval"],
                "dependency_link_ids": ["link-approval-root"],
                "status": "needs_review",
                "review_state": "needs_review",
                "needs_review": True,
                "source_refs": [],
                "assumptions": ["Task owner needs reviewer confirmation."],
                "metadata": metadata,
            }
        ],
    }


def test_connected_picture_package_is_registered_with_strict_fields():
    assert normalize_requested_artifact_types(["connected_picture_package"]) == [
        "connected_picture_package"
    ]

    schema = AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]["connected_picture_package"]
    expected_fields = {
        "package_id",
        "primary_nodes",
        "relationship_edges",
        "view_lenses",
        "structured_evidence",
        "evidence_links",
        "tasks",
        "risks",
        "decisions",
        "repair_targets",
        "source_refs",
        "assumptions",
        "acceptance_groups",
    }

    assert "connected_picture_package" in ARTIFACT_REGISTRY
    assert "connected_picture_package" in AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]["output_shape"]["enum"]
    assert set(schema["properties"]) == expected_fields
    assert set(schema["required"]) == expected_fields
    assert schema["additionalProperties"] is False

    assert _schema_errors(schema, _connected_picture_package()) == []


def test_connected_picture_package_schema_rejects_invalid_refs():
    package = _connected_picture_package()
    package["source_refs"] = [{"chunk_id": "chunk-without-document"}]

    errors = _schema_errors(
        AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]["connected_picture_package"],
        package,
    )

    assert errors
    assert any(path == ("source_refs", 0) for path, _message in errors)


def test_connected_picture_package_schema_requires_needs_review_fallback():
    package = _connected_picture_package()
    package["tasks"][0].pop("needs_review")

    errors = _schema_errors(
        AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]["connected_picture_package"],
        package,
    )

    assert errors
    assert any(path == ("tasks", 0) and "needs_review" in message for path, message in errors)


def test_selected_connected_picture_package_accept_filters_accepted_artifact_without_dangling_links():
    package = _connected_picture_package()
    metadata = package["tasks"][0]["metadata"]
    package["decisions"] = [
        {
            "id": "decision-unselected",
            "package_id": package["package_id"],
            "package_item_id": "decision-unselected",
            "title": "Approve rollout",
            "description": "Confirm whether rollout should proceed.",
            "status": "needs_review",
            "review_state": "needs_review",
            "needs_review": True,
            "required_sibling_ids": [],
            "dependency_link_ids": [],
            "source_refs": [],
            "assumptions": ["Decision owner is not yet confirmed."],
            "metadata": metadata,
        }
    ]
    session = build_ai_draft_session(
        workspace_id="workspace-artifacts",
        prompt="Create a connected package.",
        scope={"type": "workspace"},
        role="Enterprise Readiness Planner",
        intent="connected_picture_package",
        draft_nodes=[],
        draft_edges=[],
        draft_annotations=[],
        generated_artifacts=[
            {
                "id": "artifact-connected-package",
                "artifact_type": "connected_picture_package",
                "title": "Connected Package",
                "status": "draft",
                "data": package,
                "source_refs": package["source_refs"],
                "assumptions": [],
            }
        ],
    )

    _accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        _graph(["connected_picture_package"]),
        session,
        accept_mode="selected",
        selected_item_ids=["accept-review"],
    )

    [accepted_artifact] = result["accepted_artifacts"]
    accepted_package = accepted_artifact["data"]
    assert [item["id"] for item in accepted_package["primary_nodes"]] == [
        "primary-root",
        "primary-approval",
    ]
    assert [item["id"] for item in accepted_package["relationship_edges"]] == [
        "edge-root-approval"
    ]
    assert [item["id"] for item in accepted_package["tasks"]] == ["task-1"]
    assert accepted_package["decisions"] == []
    assert accepted_package["evidence_links"][0]["target_package_item_id"] == "primary-root"


def _connected_picture_package_session(package):
    return build_ai_draft_session(
        workspace_id="workspace-artifacts",
        prompt="Create a connected package.",
        scope={"type": "workspace"},
        role="Enterprise Readiness Planner",
        intent="connected_picture_package",
        draft_nodes=[],
        draft_edges=[],
        draft_annotations=[],
        generated_artifacts=[
            {
                "id": "artifact-connected-package",
                "artifact_type": "connected_picture_package",
                "title": "Connected Package",
                "status": "draft",
                "data": package,
                "source_refs": package["source_refs"],
                "assumptions": [],
            }
        ],
    )


def test_selected_connected_picture_graph_only_accepts_resolved_edges_without_package_fragments():
    package = _connected_picture_package()
    package["relationship_edges"][0].pop("source_package_item_id")
    package["relationship_edges"][0].pop("target_package_item_id")
    package["relationship_edges"][0]["required_sibling_ids"] = []
    package["relationship_edges"][0]["dependency_link_ids"] = []
    session = _connected_picture_package_session(package)

    accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        _graph(["connected_picture_package"]),
        session,
        accept_mode="selected",
        selected_item_ids=["item_edge-root-approval"],
    )

    assert any(edge["relationship_type"] == "depends_on" for edge in accepted_graph["edges"])
    assert result["accepted_item_ids"] == ["item_edge-root-approval"]
    accepted_package = result["accepted_artifacts"][0]["data"]
    assert [edge["id"] for edge in accepted_package["relationship_edges"]] == ["edge-root-approval"]
    assert accepted_package["structured_evidence"] == []
    assert accepted_package["tasks"] == []
    assert accepted_package["evidence_links"] == []


def test_selected_connected_picture_evidence_only_drops_dangling_links():
    package = _connected_picture_package()
    session = _connected_picture_package_session(package)

    accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        _graph(["connected_picture_package"]),
        session,
        accept_mode="selected",
        selected_item_ids=["item_evidence-approval"],
    )

    assert result["accepted_edge_ids"] == []
    assert len(accepted_graph["edges"]) == 1
    accepted_package = result["accepted_artifacts"][0]["data"]
    assert [item["id"] for item in accepted_package["structured_evidence"]] == ["evidence-approval"]
    assert accepted_package["relationship_edges"] == []
    assert accepted_package["evidence_links"] == []


def test_selected_connected_picture_task_accept_expands_required_sibling_evidence():
    package = _connected_picture_package()
    package["tasks"][0]["metadata"] = {
        **package["tasks"][0]["metadata"],
        "required_sibling_ids": ["evidence-approval"],
    }
    session = _connected_picture_package_session(package)

    _accepted_graph, _accepted_session, result = accept_ai_draft_revision(
        _graph(["connected_picture_package"]),
        session,
        accept_mode="selected",
        selected_item_ids=["item_task-1"],
    )

    accepted_package = result["accepted_artifacts"][0]["data"]
    assert [item["id"] for item in accepted_package["tasks"]] == ["task-1"]
    assert [item["id"] for item in accepted_package["structured_evidence"]] == ["evidence-approval"]
    assert accepted_package["relationship_edges"] == []


def test_source_repair_artifact_standardizes_repairable_evidence_targets():
    [artifact] = validate_generated_artifacts(
        [
            {
                "id": "artifact-source-repair",
                "artifact_type": "source_repair",
                "data": {
                    "rows": [
                        {
                            "row_id": "row-cost-1",
                            "source": "CRM",
                            "target": "Reporting",
                            "rowIndexes": ["0", 2],
                            "source_refs": [SOURCE_REF],
                            "review_state": "source_backed",
                        }
                    ],
                    "paths": [{"id": "path-approval", "artifact_id": "chart-1"}],
                    "edges": [{"edge_id": "edge-root-approval", "source_refs": [SOURCE_REF]}],
                    "findings": [{"id": "finding-gap", "source_refs": []}],
                    "tasks": [{"task_id": "task-review", "artifact_ids": ["tasks-1"]}],
                },
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            }
        ],
        scope={"type": "workspace"},
        model_provider="fixture",
        model="gpt-test",
        ai_role="Source Librarian",
        prompt_profile="source_repair",
        input_source_refs=[SOURCE_REF],
    )

    row = artifact["data"]["rows"][0]
    path = artifact["data"]["paths"][0]
    edge = artifact["data"]["edges"][0]
    finding = artifact["data"]["findings"][0]
    task = artifact["data"]["tasks"][0]

    assert row["evidence_item_id"] == "row-cost-1"
    assert row["row_id"] == "row-cost-1"
    assert row["represented_row_indexes"] == [0, 2]
    assert row["artifact_ids"] == ["artifact-source-repair"]
    assert row["source_refs"] == [SOURCE_REF]
    assert row["review_state"] == "source_backed"
    assert path["evidence_item_id"] == "path-approval"
    assert path["artifact_ids"] == ["artifact-source-repair", "chart-1"]
    assert edge["evidence_item_id"] == "edge-root-approval"
    assert finding["review_state"] == "needs_review"
    assert task["evidence_item_id"] == "task-review"
    assert task["artifact_ids"] == ["artifact-source-repair", "tasks-1"]
    assert artifact["status"] == "needs_review"
    assert artifact["validation"]["status"] == "needs_review"


def test_top_level_source_repair_projection_becomes_artifact_with_target_ids():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "repair_sankey_row",
            "output_shape": "source_repair",
            "summary": "Repair one row.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "generated_artifacts": [],
            "source_repair": {
                "summary": "Row citation repair.",
                "rows": [
                    {
                        "source": "Policy",
                        "target": "Finding",
                        "represented_row_indexes": [4],
                        "source_refs": [SOURCE_REF],
                    }
                ],
                "paths": [],
                "edges": [],
                "findings": [],
                "tasks": [],
                "source_refs": [SOURCE_REF],
                "assumptions": [],
            },
        },
        prompt="Repair this one row citation.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={"output_shape": "source_repair", "intent": "repair_sankey_row"},
    )

    [artifact] = revision["generated_artifacts"]
    [row] = artifact["data"]["rows"]
    assert artifact["artifact_type"] == "source_repair"
    assert row["evidence_item_id"] == "artifact-source-repair_row_1"
    assert row["row_id"] == "artifact-source-repair_row_1"
    assert row["represented_row_indexes"] == [4]
    assert row["artifact_ids"] == ["artifact-source-repair"]
    assert row["review_state"] == "source_backed"


def test_source_repair_draft_items_preserve_evidence_target_fields():
    revision = parse_ai_draft_revision_response(
        {
            "intent": "repair_one_finding",
            "output_shape": "source_repair",
            "summary": "Repair one finding.",
            "draft_nodes": [],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [
                {
                    "id": "repair-finding-1",
                    "item_type": "finding",
                    "title": "Unsupported metric",
                    "content": "Metric needs citation.",
                    "evidence_item_id": "finding-1",
                    "artifact_id": "artifact-summary",
                    "representedRowIndexes": [1],
                    "source_refs": [SOURCE_REF],
                    "review_state": "source_backed",
                }
            ],
            "generated_artifacts": [],
        },
        prompt="Repair this one finding.",
        scope={"type": "workspace"},
        source_refs=[SOURCE_REF],
        classification={"output_shape": "source_repair", "intent": "repair_one_finding"},
    )

    [item] = revision["draft_items"]
    assert item["evidence_item_id"] == "finding-1"
    assert item["represented_row_indexes"] == [1]
    assert item["artifact_ids"] == ["artifact-summary"]
    assert item["source_refs"] == [SOURCE_REF]
    assert item["review_state"] == "source_backed"


def test_intent_artifacts_require_minimum_structured_data():
    with pytest.raises(GraphSchemaError) as exc:
        validate_generated_artifacts(
            [{"id": "empty-completeness", "artifact_type": "completeness_review", "data": {}}],
            scope={"type": "workspace"},
            model_provider="fixture",
            model="gpt-test",
            ai_role="Ask AI",
            prompt_profile="completeness_review",
            input_source_refs=[SOURCE_REF],
        )

    assert "completeness_review requires at least one populated review area" in exc.value.errors[0]

    with pytest.raises(GraphSchemaError) as exc:
        validate_generated_artifacts(
            [{"id": "empty-roadmap", "artifact_type": "team_roadmap", "data": {"context": ""}}],
            scope={"type": "workspace"},
            model_provider="fixture",
            model="gpt-test",
            ai_role="Ask AI",
            prompt_profile="team_roadmap",
            input_source_refs=[SOURCE_REF],
        )

    assert any("team_roadmap requires plain-language context" in error for error in exc.value.errors)
