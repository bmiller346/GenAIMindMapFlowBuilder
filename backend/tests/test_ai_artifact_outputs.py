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
    assert artifact["validation"]["status"] == "needs_review"
    assert artifact["validation"]["issues"][0]["code"] == "artifact_item_needs_review"


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


def test_ai_draft_schema_has_first_class_executive_summary_and_news_article_outputs():
    properties = AI_DRAFT_REVISION_OUTPUT_SCHEMA["properties"]

    assert "executive_summary" in properties
    assert {"summary", "key_points", "recommended_actions", "risks"} <= set(
        properties["executive_summary"]["properties"]
    )
    assert "news_article" in properties
    assert {"headline", "lede", "body", "sections", "fact_checks"} <= set(
        properties["news_article"]["properties"]
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
