from __future__ import annotations

from copy import deepcopy
from typing import Any

from graph.business_ontology import (
    BUSINESS_ENTITY_TYPES,
    BUSINESS_ONTOLOGY_CONTRACT,
    KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES,
)


AI_HELPER_PREVIEW_CONTRACT_VERSION = "1"
AI_ACTION_PREVIEW_CONTRACT_VERSION = "1"
AI_DRAFT_SESSION_CONTRACT_VERSION = "1"
ARTIFACT_REGISTRY_VERSION = "1"
EXECUTIVE_OUTPUT_CONTRACT_VERSION = "1"
AIDRAFT_SCOPE_TYPES = {"workspace", "source", "branch", "node", "nodes"}
AIDRAFT_ACCEPT_MODES = {
    "append",
    "replace",
    "merge",
    "selected",
    "cited_only",
    "notes_only",
}
AI_DRAFT_MODEL_POLICIES = {
    "speed",
    "balanced",
    "deep_review",
    "explicit_model",
}
AI_DRAFT_OUTPUT_SHAPES = {
    "graph_draft",
    "mind_map",
    "knowledge_graph",
    "flow_chart",
    "patch_diff",
    "source_coverage",
    "source_repair",
    "tasks_checklist",
    "tasks",
    "checklist",
    "outline",
    "table",
    "chart",
    "kanban",
    "presentation_sections",
    "review_annotations",
    "sme_questions",
    "missing_info_report",
    "completeness_review",
    "software_overlap_report",
    "team_roadmap",
    "implementation_handoff_package",
    "executive_output",
    "executive_summary",
    "news_article",
    "newsletter",
}

KNOWLEDGE_GRAPH_SOURCE_SIGNALS = {
    "explicit_text",
    "shared_source",
    "semantic_similarity",
    "user_created",
    "ai_inferred",
    "external_ref",
}

SOFTWARE_INVENTORY_ENTITY_TYPES = sorted(
    {
        "application",
        "system",
        "software_vendor",
        "software_license",
        "software_use_case",
        "integration",
        "capability",
        "process",
        "team",
        "business_unit",
        "owner",
        "cost",
    }
    & BUSINESS_ENTITY_TYPES
)


def _artifact_definition(
    artifact_type: str,
    *,
    requires: list[str],
    optional: list[str],
    generated_schema: dict[str, Any],
    projection_requirements: list[str],
    supported_views: list[str],
    preview_component: str,
    accept_behavior: str,
    export_behavior: str,
    validation_rules: list[str],
) -> dict[str, Any]:
    return {
        "artifact_type": artifact_type,
        "requires": requires,
        "optional": optional,
        # Product-facing contract notes, not executable JSON Schema.
        "generated_schema": generated_schema,
        "projection_requirements": projection_requirements,
        "supported_views": supported_views,
        "preview_component": preview_component,
        "accept_behavior": accept_behavior,
        "export_behavior": export_behavior,
        "validation_rules": validation_rules,
    }


SOURCE_REF_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "document_id": {"type": "string"},
        "chunk_id": {"type": ["string", "null"]},
        "page": {"type": ["integer", "number", "string", "null"]},
        "section": {"type": ["string", "null"]},
        "quote_snippet": {"type": ["string", "null"]},
        "confidence": {"type": ["number", "string", "null"]},
    },
    "required": [
        "document_id",
        "chunk_id",
        "page",
        "section",
        "quote_snippet",
        "confidence",
    ],
}

METADATA_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "source": {"type": ["string", "null"]},
        "scope": {"type": ["string", "null"]},
        "artifact_type": {"type": ["string", "null"]},
        "layout_hint": {"type": ["string", "null"]},
        "rationale": {"type": ["string", "null"]},
        "review_reason": {"type": ["string", "null"]},
        "source_signal": {"type": ["string", "null"]},
    },
    "required": [
        "source",
        "scope",
        "artifact_type",
        "layout_hint",
        "rationale",
        "review_reason",
        "source_signal",
    ],
}

PROVENANCE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "generated_by": {"type": ["string", "null"]},
        "prompt_profile": {"type": ["string", "null"]},
        "ai_role": {"type": ["string", "null"]},
        "input_scope": {"type": ["string", "null"]},
        "model_provider": {"type": ["string", "null"]},
        "model": {"type": ["string", "null"]},
        "confidence_summary": {"type": ["string", "null"]},
        "input_source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "generated_by",
        "prompt_profile",
        "ai_role",
        "input_scope",
        "model_provider",
        "model",
        "confidence_summary",
        "input_source_refs",
        "assumptions",
    ],
}

VALIDATION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "status": {"type": ["string", "null"]},
        "validation_status": {"type": ["string", "null"]},
        "message": {"type": ["string", "null"]},
        "errors": {"type": "array", "items": {"type": "string"}},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "status",
        "validation_status",
        "message",
        "errors",
        "warnings",
    ],
}

GENERIC_OUTPUT_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "label": {"type": ["string", "null"]},
        "summary": {"type": ["string", "null"]},
        "description": {"type": ["string", "null"]},
        "status": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "title",
        "label",
        "summary",
        "description",
        "status",
        "source_refs",
        "assumptions",
        "metadata",
    ],
}


def strict_openai_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Return a Responses strict-mode compatible JSON schema.

    Strict Responses schemas require every object property to be required. Callers
    should use [] for irrelevant lists and null for irrelevant nullable objects.
    """
    normalized = deepcopy(schema)

    def visit(node: Any) -> None:
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        is_object = node_type == "object" or (
            isinstance(node_type, list) and "object" in node_type
        )
        if is_object:
            properties = node.get("properties")
            if not isinstance(properties, dict):
                properties = {}
                node["properties"] = properties
            node["additionalProperties"] = False
            node["required"] = list(properties.keys())
            for child in properties.values():
                visit(child)
        is_array = node_type == "array" or (
            isinstance(node_type, list) and "array" in node_type
        )
        if is_array:
            visit(node.get("items"))
        for combiner in ("anyOf", "oneOf", "allOf"):
            options = node.get(combiner)
            if isinstance(options, list):
                for option in options:
                    visit(option)

    visit(normalized)
    return normalized


ARTIFACT_DATA_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": ["string", "null"]},
        "items": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "summary",
        "items",
        "source_refs",
        "assumptions",
    ],
}

GENERIC_ARTIFACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "artifact_type": {"type": "string"},
        "title": {"type": ["string", "null"]},
        "status": {"type": "string"},
        "data": ARTIFACT_DATA_SCHEMA,
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "provenance": PROVENANCE_OUTPUT_SCHEMA,
        "validation": VALIDATION_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "artifact_type",
        "title",
        "status",
        "data",
        "source_refs",
        "assumptions",
        "provenance",
        "validation",
    ],
}


KNOWLEDGE_GRAPH_EDGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "source_node_id": {"type": "string"},
        "target_node_id": {"type": "string"},
        "relationship_type": {
            "type": "string",
            "enum": sorted(KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES),
        },
        "source_signal": {
            "type": "string",
            "enum": sorted(KNOWLEDGE_GRAPH_SOURCE_SIGNALS),
        },
        "confidence": {"type": ["number", "string", "null"]},
        "rationale": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "review_state": {"type": ["string", "null"]},
    },
    "required": [
        "id",
        "source_node_id",
        "target_node_id",
        "relationship_type",
        "source_signal",
        "confidence",
        "rationale",
        "source_refs",
        "assumptions",
        "review_state",
    ],
}

KNOWLEDGE_GRAPH_CLUSTER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "node_ids": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "id",
        "title",
        "node_ids",
        "rationale",
        "source_refs",
        "assumptions",
    ],
}

KNOWLEDGE_GRAPH_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "relationship_edges": {"type": "array", "items": KNOWLEDGE_GRAPH_EDGE_SCHEMA},
        "clusters": {"type": "array", "items": KNOWLEDGE_GRAPH_CLUSTER_SCHEMA},
    },
    "required": ["relationship_edges", "clusters"],
}

FLOW_CHART_STEP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "summary": {"type": ["string", "null"]},
        "step_type": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "title",
        "summary",
        "step_type",
        "source_refs",
        "assumptions",
        "metadata",
    ],
}

FLOW_CHART_EDGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "source_step_id": {"type": "string"},
        "target_step_id": {"type": "string"},
        "label": {"type": ["string", "null"]},
        "relationship_type": {"type": ["string", "null"]},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "source_step_id",
        "target_step_id",
        "label",
        "relationship_type",
        "metadata",
    ],
}

FLOW_CHART_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "steps": {"type": "array", "items": FLOW_CHART_STEP_SCHEMA},
        "edges": {"type": "array", "items": FLOW_CHART_EDGE_SCHEMA},
        "decisions": {"type": "array", "items": FLOW_CHART_STEP_SCHEMA},
    },
    "required": ["steps", "edges", "decisions"],
}

CHART_DATA_ROW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "category": {"type": ["string", "null"]},
        "value": {"type": ["number", "string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "id",
        "label",
        "category",
        "value",
        "source_refs",
        "assumptions",
    ],
}

CHART_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "chart_type": {"type": ["string", "null"]},
        "title": {"type": ["string", "null"]},
        "summary": {"type": ["string", "null"]},
        "x_field": {"type": ["string", "null"]},
        "y_field": {"type": ["string", "null"]},
        "data_rows": {"type": "array", "items": CHART_DATA_ROW_SCHEMA},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "chart_type",
        "title",
        "summary",
        "x_field",
        "y_field",
        "data_rows",
        "source_refs",
        "assumptions",
    ],
}

SOFTWARE_INVENTORY_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "node_id": {"type": ["string", "null"]},
        "entity_type": {"type": "string", "enum": SOFTWARE_INVENTORY_ENTITY_TYPES},
        "vendor": {"type": ["string", "null"]},
        "owner_id": {"type": ["string", "null"]},
        "business_unit_id": {"type": ["string", "null"]},
        "license_type": {"type": ["string", "null"]},
        "annual_cost": {"type": ["number", "string", "null"]},
        "user_count": {"type": ["integer", "number", "string", "null"]},
        "status": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "id",
        "name",
        "node_id",
        "entity_type",
        "vendor",
        "owner_id",
        "business_unit_id",
        "license_type",
        "annual_cost",
        "user_count",
        "status",
        "source_refs",
        "assumptions",
    ],
}

SOFTWARE_OVERLAP_SCORE_FACTOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "factor": {"type": "string"},
        "weight": {"type": ["number", "string", "null"]},
        "evidence": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["factor", "weight", "evidence", "source_refs", "assumptions"],
}

SOFTWARE_OVERLAP_CANDIDATE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "application_ids": {"type": "array", "items": {"type": "string"}},
        "overlap_dimensions": {"type": "array", "items": {"type": "string"}},
        "score": {"type": ["number", "string", "null"]},
        "scoring_factors": {
            "type": "array",
            "items": SOFTWARE_OVERLAP_SCORE_FACTOR_SCHEMA,
        },
        "recommendation": {"type": ["string", "null"]},
        "recommended_review_questions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "confidence": {"type": ["number", "string", "null"]},
        "rationale": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "review_state": {"type": ["string", "null"]},
    },
    "required": [
        "id",
        "title",
        "application_ids",
        "overlap_dimensions",
        "score",
        "scoring_factors",
        "recommendation",
        "recommended_review_questions",
        "confidence",
        "rationale",
        "source_refs",
        "assumptions",
        "review_state",
    ],
}

SOFTWARE_RATIONALIZATION_ACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "action_type": {"type": ["string", "null"]},
        "target_application_ids": {"type": "array", "items": {"type": "string"}},
        "owner_id": {"type": ["string", "null"]},
        "priority": {"type": ["string", "null"]},
        "status": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "id",
        "title",
        "action_type",
        "target_application_ids",
        "owner_id",
        "priority",
        "status",
        "source_refs",
        "assumptions",
    ],
}

SOFTWARE_OVERLAP_REPORT_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "summary": {"type": ["string", "null"]},
        "inventory_items": {"type": "array", "items": SOFTWARE_INVENTORY_ITEM_SCHEMA},
        "overlap_candidates": {
            "type": "array",
            "items": SOFTWARE_OVERLAP_CANDIDATE_SCHEMA,
        },
        "rationalization_actions": {
            "type": "array",
            "items": SOFTWARE_RATIONALIZATION_ACTION_SCHEMA,
        },
        "relationship_edges": {"type": "array", "items": KNOWLEDGE_GRAPH_EDGE_SCHEMA},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "summary",
        "inventory_items",
        "overlap_candidates",
        "rationalization_actions",
        "relationship_edges",
        "source_refs",
        "assumptions",
    ],
}

EXECUTIVE_OUTPUT_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": ["string", "null"]},
        "status": {"type": ["string", "null"]},
        "priority": {"type": ["string", "null"]},
        "owner_id": {"type": ["string", "null"]},
        "due_date": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "source_backed": {"type": "boolean"},
        "needs_review": {"type": "boolean"},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "title",
        "description",
        "status",
        "priority",
        "owner_id",
        "due_date",
        "source_refs",
        "source_backed",
        "needs_review",
        "metadata",
    ],
}

EXECUTIVE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "contract_version": {"type": "string"},
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "key_findings": {"type": "array", "items": EXECUTIVE_OUTPUT_ITEM_SCHEMA},
        "recommended_actions": {"type": "array", "items": EXECUTIVE_OUTPUT_ITEM_SCHEMA},
        "risks": {"type": "array", "items": EXECUTIVE_OUTPUT_ITEM_SCHEMA},
        "required_decisions": {"type": "array", "items": EXECUTIVE_OUTPUT_ITEM_SCHEMA},
        "source_backed_appendix": {"type": "array", "items": EXECUTIVE_OUTPUT_ITEM_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "node_count": {"type": "integer"},
                "source_backed_node_count": {"type": "integer"},
                "needs_review_count": {"type": "integer"},
                "task_count": {"type": "integer"},
            },
            "required": [
                "node_count",
                "source_backed_node_count",
                "needs_review_count",
                "task_count",
            ],
        },
    },
    "required": [
        "contract_version",
        "title",
        "summary",
        "key_findings",
        "recommended_actions",
        "risks",
        "required_decisions",
        "source_backed_appendix",
        "assumptions",
        "metadata",
    ],
}

EXECUTIVE_SUMMARY_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "title": {"type": ["string", "null"]},
        "summary": {"type": ["string", "null"]},
        "key_points": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "recommended_actions": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "risks": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "source_backed_appendix": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "title",
        "summary",
        "key_points",
        "recommended_actions",
        "risks",
        "source_backed_appendix",
        "source_refs",
        "assumptions",
    ],
}

NEWS_ARTICLE_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": ["string", "null"]},
        "content": {"type": ["string", "null"]},
        "status": {"type": ["string", "null"]},
        "confidence": {"type": ["number", "string", "null"]},
        "review_state": {"type": ["string", "null"]},
        "source_backed": {"type": "boolean"},
        "needs_review": {"type": "boolean"},
        "rationale": {"type": ["string", "null"]},
        "source_signal": {"type": ["string", "null"]},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "id",
        "title",
        "description",
        "content",
        "status",
        "confidence",
        "review_state",
        "source_backed",
        "needs_review",
        "rationale",
        "source_signal",
        "source_refs",
        "assumptions",
        "metadata",
    ],
}

NEWS_ARTICLE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "headline": {"type": ["string", "null"]},
        "dek": {"type": ["string", "null"]},
        "lede": {"type": ["string", "null"]},
        "body": {"type": ["string", "null"]},
        "sections": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "quotes": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "fact_checks": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "source_backed_appendix": {
            "type": "array",
            "items": NEWS_ARTICLE_ITEM_SCHEMA,
        },
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "headline",
        "dek",
        "lede",
        "body",
        "sections",
        "quotes",
        "fact_checks",
        "source_backed_appendix",
        "source_refs",
        "assumptions",
        "metadata",
    ],
}

NEWSLETTER_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": ["object", "null"],
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "issue_label": {"type": ["string", "null"]},
        "audience": {"type": ["string", "null"]},
        "cadence": {"type": ["string", "null"]},
        "opening_note": {"type": ["string", "null"]},
        "highlights": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "sections": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "upcoming": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "risks": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "decisions_needed": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "visual_blocks": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "source_backed_appendix": {"type": "array", "items": NEWS_ARTICLE_ITEM_SCHEMA},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "metadata": METADATA_OUTPUT_SCHEMA,
    },
    "required": [
        "title",
        "issue_label",
        "audience",
        "cadence",
        "opening_note",
        "highlights",
        "sections",
        "upcoming",
        "risks",
        "decisions_needed",
        "visual_blocks",
        "source_backed_appendix",
        "source_refs",
        "assumptions",
        "metadata",
    ],
}


ARTIFACT_REGISTRY: dict[str, dict[str, Any]] = {
    "mind_map": _artifact_definition(
        "mind_map",
        requires=["nodes"],
        optional=["edges", "source_refs", "workspace_brief"],
        generated_schema={"nodes": "React Flow draft nodes", "edges": "hierarchical draft edges"},
        projection_requirements=["nodes have ids and titles"],
        supported_views=["map", "outline"],
        preview_component="MindMapPreview",
        accept_behavior="append_or_merge_nodes_and_edges_after_preview_acceptance",
        export_behavior="react_flow_json, mermaid, opml, markdown",
        validation_rules=["draft_nodes_valid", "unsourced_nodes_marked_needs_review"],
    ),
    "knowledge_graph": _artifact_definition(
        "knowledge_graph",
        requires=["nodes"],
        optional=["source_refs", "entities", "tags", "explicit_edges", "semantic_similarity"],
        generated_schema={
            "relationship_edges": {
                "required": [
                    "source_node_id",
                    "target_node_id",
                    "relationship_type",
                    "source_signal",
                    "confidence",
                    "rationale",
                    "review_state",
                ],
                "requires_one_of": ["source_refs", "assumptions"],
            },
            "clusters": "optional grouped node ids with rationale",
        },
        projection_requirements=["relationship_edges are typed and source-signal backed"],
        supported_views=["knowledge_graph", "connections"],
        preview_component="KnowledgeGraphPreview",
        accept_behavior="append_relationship_edges_and_metadata_after_preview_acceptance",
        export_behavior="graph_json, markdown_relationship_report",
        validation_rules=[
            "relationship_edge_contract",
            "edge_has_source_refs_or_assumptions",
            "inferred_edges_marked_needs_review",
        ],
    ),
    "flow_chart": _artifact_definition(
        "flow_chart",
        requires=["nodes"],
        optional=["sequence_edges", "decision_points", "dependencies", "handoffs", "source_refs"],
        generated_schema={"steps": "process nodes", "decisions": "decision nodes", "dependencies": "typed edges"},
        projection_requirements=["process, decision, dependency, or handoff structure exists"],
        supported_views=["flow_chart"],
        preview_component="FlowChartPreview",
        accept_behavior="append_workflow_nodes_edges_or_attach_artifact_after_preview_acceptance",
        export_behavior="mermaid_flowchart, markdown",
        validation_rules=["flow_steps_have_ids", "decisions_identify_paths", "inferred_steps_marked_needs_review"],
    ),
    "table": _artifact_definition(
        "table",
        requires=["nodes"],
        optional=["columns", "source_refs", "extracted_rows"],
        generated_schema={"columns": "column definitions", "rows": "source-backed values"},
        projection_requirements=["columns are defined and rows reference nodes or sources"],
        supported_views=["table"],
        preview_component="TableArtifactPreview",
        accept_behavior="attach_table_artifact_after_preview_acceptance",
        export_behavior="csv, markdown_table, xlsx",
        validation_rules=["columns_have_keys", "rows_match_columns", "unsourced_cells_marked_needs_review"],
    ),
    "chart": _artifact_definition(
        "chart",
        requires=["structured_or_extracted_data"],
        optional=["nodes", "source_refs", "chart_goal"],
        generated_schema={"chart_spec": "chart type, encodings, labels", "data_rows": "source-backed chart data"},
        projection_requirements=["chart_spec and source/extracted data rows are present"],
        supported_views=["chart"],
        preview_component="ChartArtifactPreview",
        accept_behavior="attach_chart_artifact_after_extracted_data_preview_acceptance",
        export_behavior="png, svg, csv_data, markdown_summary",
        validation_rules=["chart_spec_present", "data_rows_present", "chart_data_has_source_or_needs_review"],
    ),
    "data_table": _artifact_definition(
        "data_table",
        requires=["rows", "columns"],
        optional=["source_refs", "query_id", "table_name", "result_hash"],
        generated_schema={
            "rows": "source-backed result rows or extracted structured records",
            "columns": "stable column keys from the underlying table or query result",
            "query_id": "optional saved query/extraction identifier",
        },
        projection_requirements=["rows and columns are retained outside the graph node label"],
        supported_views=["table", "map", "knowledge_graph"],
        preview_component="StructuredDataTablePreview",
        accept_behavior="attach_data_table_artifact_node_with_source_refs",
        export_behavior="csv, xlsx, markdown_table",
        validation_rules=["table_rows_present", "columns_present", "source_or_query_ref_present"],
    ),
    "sql_query": _artifact_definition(
        "sql_query",
        requires=["sql"],
        optional=["source_refs", "query_id", "database_id", "table_name", "result_hash"],
        generated_schema={
            "sql": "query text used to produce a structured evidence result",
            "query_id": "stable identifier for reusing or auditing the query",
            "result_hash": "hash of the result payload tied to this query",
        },
        projection_requirements=["query text and result provenance are stored with the artifact"],
        supported_views=["table", "source_evidence"],
        preview_component="SqlQueryArtifactPreview",
        accept_behavior="attach_query_artifact_as_structured_evidence",
        export_behavior="sql, markdown_audit_note",
        validation_rules=["query_text_present", "query_result_hash_present_when_available"],
    ),
    "data_summary": _artifact_definition(
        "data_summary",
        requires=["summary"],
        optional=["source_refs", "query_id", "table_name", "assumptions"],
        generated_schema={
            "summary": "plain-language explanation of a query/table result",
            "question": "user question that produced the result",
            "source_refs": "table/query refs supporting the summary",
        },
        projection_requirements=["summary is linked to the query/table artifact that supports it"],
        supported_views=["map", "review", "source_evidence"],
        preview_component="DataSummaryArtifactPreview",
        accept_behavior="attach_summary_as_artifact_node_or_review_finding",
        export_behavior="markdown, evidence_report",
        validation_rules=["summary_present", "source_backed_or_needs_review"],
    ),
    "data_insight": _artifact_definition(
        "data_insight",
        requires=["finding"],
        optional=["source_refs", "query_id", "confidence", "recommended_actions"],
        generated_schema={
            "finding": "reviewable claim inferred from structured data",
            "confidence": "confidence or review state tied to data evidence",
            "recommended_actions": "optional task candidates or next reviews",
        },
        projection_requirements=["insight remains traceable to table/query evidence"],
        supported_views=["knowledge_graph", "review", "tasks"],
        preview_component="DataInsightPreview",
        accept_behavior="accept_as_source_backed_finding_or_task_candidate",
        export_behavior="markdown_report, task_candidates",
        validation_rules=["finding_present", "source_refs_or_assumptions_present"],
    ),
    "tasks": _artifact_definition(
        "tasks",
        requires=["nodes"],
        optional=["owners", "due_dates", "priority", "source_refs"],
        generated_schema={"tasks": "task candidates with owner/status/priority fields"},
        projection_requirements=["task-like nodes or task candidates exist"],
        supported_views=["tasks", "table"],
        preview_component="TasksPreview",
        accept_behavior="append_or_update_task_nodes_after_preview_acceptance",
        export_behavior="csv_tasks, monday_payload, markdown",
        validation_rules=["task_has_title", "missing_owner_due_date_marked_needs_review"],
    ),
    "checklist": _artifact_definition(
        "checklist",
        requires=["nodes"],
        optional=["order", "owners", "due_dates", "source_refs"],
        generated_schema={"items": "ordered checklist items with review flags"},
        projection_requirements=["ordered checklist item labels exist"],
        supported_views=["checklist"],
        preview_component="ChecklistPreview",
        accept_behavior="attach_checklist_projection_or_task_nodes_after_preview_acceptance",
        export_behavior="markdown_checklist, csv",
        validation_rules=["checklist_items_have_labels", "review_required_when_unsourced"],
    ),
    "sme_questions": _artifact_definition(
        "sme_questions",
        requires=["nodes"],
        optional=["source_refs", "review_rules", "domain_context"],
        generated_schema={"questions": "SME questions tied to nodes or sources"},
        projection_requirements=["unresolved review reasons exist"],
        supported_views=["sme_questions", "review"],
        preview_component="SmeQuestionsPreview",
        accept_behavior="attach_review_artifact_after_preview_acceptance",
        export_behavior="markdown, csv",
        validation_rules=["question_has_review_target", "unsourced_questions_marked_needs_review"],
    ),
    "missing_info_report": _artifact_definition(
        "missing_info_report",
        requires=["nodes"],
        optional=["source_refs", "tasks", "review_policy"],
        generated_schema={"gaps": "missing source, metadata, task, or decision gaps"},
        projection_requirements=["review gaps can be tied to nodes or sources"],
        supported_views=["gaps", "review"],
        preview_component="MissingInfoReportPreview",
        accept_behavior="attach_review_artifact_after_preview_acceptance",
        export_behavior="markdown_report, csv",
        validation_rules=["gap_has_reason", "gap_has_target_or_assumption"],
    ),
    "completeness_review": _artifact_definition(
        "completeness_review",
        requires=["source_library"],
        optional=["nodes", "source_refs", "domain_profile", "expected_coverage", "folder_inventory"],
        generated_schema={
            "covered_areas": "source-backed areas with sufficient coverage",
            "missing_areas": "expected areas not found in sources",
            "partial_areas": "areas with incomplete or weak coverage",
            "duplicate_conflicting_areas": "overlap, version, or guidance conflicts",
            "stale_deprecated_candidates": "older or superseded guidance needing review",
            "recommended_roadmap": "ordered completion path",
            "sme_questions": "review questions tied to source gaps or assumptions",
        },
        projection_requirements=["source set or workspace graph exists"],
        supported_views=["completeness_review", "missing_info_report", "roadmap", "tasks"],
        preview_component="CompletenessReviewPreview",
        accept_behavior="attach_review_artifact_and_optionally_generate_tasks_after_preview_acceptance",
        export_behavior="markdown_report, csv, roadmap_tasks",
        validation_rules=[
            "domain_expectations_visible",
            "missing_items_have_assumption_rationale",
            "source_backed_findings_include_source_refs",
            "unsupported_items_marked_needs_review",
        ],
    ),
    "software_overlap_report": _artifact_definition(
        "software_overlap_report",
        requires=["nodes"],
        optional=[
            "relationship_edges",
            "source_refs",
            "software_inventory",
            "license_data",
            "usage_data",
            "service_desk_signals",
        ],
        generated_schema={
            "inventory_items": "software inventory entities using registered business ontology types such as application, system, software_license, software_use_case, software_vendor, and integration",
            "overlap_candidates": "pairs or groups of applications with shared capabilities, users, workflows, integrations, licensing, score, confidence, rationale, source refs or assumptions, and review state",
            "rationalization_actions": "reviewable standardize, consolidate, retire, license-rightsize, owner-review, and exception-review action candidates",
            "relationship_edges": "optional knowledge-graph edges using overlaps_on, duplicates, approved_for, has_license_type, integrates_with, replaces, replaced_by, used_by, owns, or supports",
        },
        projection_requirements=[
            "application, system, or tool nodes exist",
            "candidate overlaps include evidence, confidence, assumptions, and recommended owner review",
        ],
        supported_views=["review", "connections", "tasks", "table"],
        preview_component="SoftwareOverlapReportPreview",
        accept_behavior="attach_review_artifact_and_optionally_generate_tasks_after_preview_acceptance",
        export_behavior="markdown_report, csv, task_candidates",
        validation_rules=[
            "overlap_candidates_have_applications",
            "score_factors_visible",
            "source_backed_findings_include_source_refs",
            "inferred_candidates_marked_needs_review",
        ],
    ),
    "team_roadmap": _artifact_definition(
        "team_roadmap",
        requires=["source_context"],
        optional=["nodes", "tasks", "source_refs", "decisions", "risks", "milestones"],
        generated_schema={
            "context": "plain-language explanation of the complex issue",
            "workstreams": "team-facing streams of work",
            "milestones": "sequenced checkpoints or phases",
            "dependencies": "prerequisites and blocked work",
            "risks": "roadmap risks and mitigation notes",
            "required_decisions": "choices needing stakeholder input",
            "recommended_next_actions": "ordered action path",
            "source_backed_appendix": "source refs supporting the roadmap",
        },
        projection_requirements=["source context or accepted graph exists"],
        supported_views=["outline", "tasks", "presentation_sections", "executive_summary"],
        preview_component="TeamRoadmapPreview",
        accept_behavior="attach_roadmap_artifact_and_optionally_generate_tasks_after_preview_acceptance",
        export_behavior="markdown_roadmap, task_candidates, presentation_sections",
        validation_rules=[
            "roadmap_separates_facts_from_assumptions",
            "required_decisions_visible",
            "source_backed_items_include_source_refs",
            "unsupported_items_marked_needs_review",
        ],
    ),
    "source_coverage": _artifact_definition(
        "source_coverage",
        requires=["nodes"],
        optional=["source_library", "source_refs"],
        generated_schema={"coverage_items": "covered, incomplete, and uncited source findings"},
        projection_requirements=["source refs or source library entries are available"],
        supported_views=["source_coverage", "sources"],
        preview_component="SourceCoveragePreview",
        accept_behavior="attach_source_review_artifact_after_preview_acceptance",
        export_behavior="markdown_report, csv",
        validation_rules=["coverage_item_has_status", "source_gap_has_document_or_assumption"],
    ),
    "source_repair": _artifact_definition(
        "source_repair",
        requires=["nodes"],
        optional=["source_library", "source_refs", "nearby_citations"],
        generated_schema={"repairs": "suggested source refs or source lookup requests"},
        projection_requirements=["source gaps are present"],
        supported_views=["source_repair", "sources"],
        preview_component="SourceRepairPreview",
        accept_behavior="apply_source_ref_repairs_after_preview_acceptance",
        export_behavior="markdown_report",
        validation_rules=["repair_has_target_node", "suggested_source_ref_or_lookup_assumption"],
    ),
    "implementation_handoff_package": _artifact_definition(
        "implementation_handoff_package",
        requires=["accepted_nodes"],
        optional=["tasks", "checklist", "source_refs", "sme_questions", "risks", "monday_candidates", "miro_candidates"],
        generated_schema={
            "summary": "implementation-ready summary",
            "tasks": "execution tasks",
            "checklist": "review checklist",
            "risks": "open risks",
            "recommended_next_actions": "ordered action list",
        },
        projection_requirements=["accepted structure exists with review status and provenance"],
        supported_views=["handoff", "tasks", "checklist"],
        preview_component="ImplementationHandoffPackagePreview",
        accept_behavior="attach_handoff_artifact_after_preview_acceptance",
        export_behavior="markdown_package, monday_payload_candidates, miro_payload_candidates",
        validation_rules=["handoff_preserves_scope", "handoff_lists_assumptions", "handoff_references_sources"],
    ),
    "executive_output": _artifact_definition(
        "executive_output",
        requires=["accepted_nodes"],
        optional=["tasks", "source_refs", "relationship_edges", "review_status"],
        generated_schema={
            "summary": "decision-memo narrative with recommendation, why now, scope, value, governance, investment, metrics, and decision gate",
            "key_findings": "source-backed or review-marked findings tied to business need, operational impact, governance, or investment assumptions",
            "recommended_actions": "ordered action candidates, including pilot next steps, ownership asks, and phase gates when relevant",
            "risks": "open risks, blockers, caveats, and mitigation controls such as approval gates, auditability, credential control, or scoped rollout",
            "required_decisions": "decision points needing executive input, including approve/defer/limited-validation options when relevant",
            "source_backed_appendix": "evidence rows tied to source refs for claims, costs, timelines, metrics, and decision drivers",
        },
        projection_requirements=[
            "accepted workspace graph exists",
            "executive output states the recommendation or leadership decision requested in the opening",
            "unsourced costs, ROI, timeline, or adoption claims are marked needs_review with assumptions",
        ],
        supported_views=["executive_summary", "markdown_export"],
        preview_component="ExecutiveOutputPreview",
        accept_behavior="preview_only_export_projection",
        export_behavior="markdown_executive_package",
        validation_rules=[
            "executive_sections_present",
            "appendix_items_include_source_refs",
            "unsourced_items_marked_needs_review",
        ],
    ),
    "executive_summary": _artifact_definition(
        "executive_summary",
        requires=["source_context"],
        optional=["nodes", "source_refs", "risks", "recommended_actions"],
        generated_schema={
            "summary": "concise leadership decision memo: recommendation, why now, proposed scope, value, governance, investment assumptions, metrics, and decision gate",
            "key_points": "source-backed or review-marked business case points such as strategic need, expected value, governance controls, pilot scope, success metrics, and decision requested",
            "recommended_actions": "pilot or review actions with owner/phase-gate cues when available",
            "risks": "risks, caveats, missing baselines, and mitigation controls",
            "source_backed_appendix": "evidence rows tied to source refs for factual claims, costs, timelines, metrics, and source-backed decision drivers",
        },
        projection_requirements=[
            "summary or key points exist",
            "opening frames the leadership decision or recommendation",
            "business value is connected to operational impact rather than generic benefits",
            "unsourced costs, timelines, ROI, or current-state metrics are assumptions or needs_review",
        ],
        supported_views=["executive_summary", "review", "markdown_export"],
        preview_component="ExecutiveSummaryPreview",
        accept_behavior="attach_review_artifact_after_preview_acceptance",
        export_behavior="markdown_executive_summary",
        validation_rules=[
            "executive_summary_has_summary_or_key_points",
            "source_backed_items_include_source_refs",
            "unsupported_items_marked_needs_review",
        ],
    ),
    "news_article": _artifact_definition(
        "news_article",
        requires=["source_context"],
        optional=["nodes", "source_refs", "quotes", "fact_checks"],
        generated_schema={
            "headline": "article headline",
            "dek": "short subhead",
            "lede": "opening paragraph",
            "body": "article body or narrative draft",
            "sections": "optional section blocks",
            "quotes": "optional source-backed quotations",
            "fact_checks": "reviewable factual claims with source-backed status or explicit assumptions",
            "source_backed_appendix": "source-backed evidence rows for article claims, quotes, and fact checks",
        },
        projection_requirements=[
            "headline plus lede, body, or sections exist",
            "verified facts are separated from assumptions",
            "quotes, costs, dates, and named stakeholders require source refs or needs_review",
        ],
        supported_views=["article", "review", "markdown_export"],
        preview_component="NewsArticlePreview",
        accept_behavior="attach_review_artifact_after_preview_acceptance",
        export_behavior="markdown_article",
        validation_rules=[
            "article_has_headline_and_body_content",
            "quotes_include_source_refs_or_are_marked_needs_review",
            "unsupported_claims_marked_needs_review",
        ],
    ),
    "newsletter": _artifact_definition(
        "newsletter",
        requires=["source_context"],
        optional=["nodes", "source_refs", "visual_blocks", "cadence", "audience"],
        generated_schema={
            "title": "newsletter title",
            "issue_label": "issue, date, or cadence label",
            "opening_note": "short editor note or intro",
            "highlights": "top update bullets with source-backed status",
            "sections": "reader-friendly update sections",
            "upcoming": "near-term dates, work, or next steps",
            "risks": "blockers or watch items",
            "decisions_needed": "approval or input requests",
            "visual_blocks": "optional map, flowchart, table, status, or relationship visual insert descriptions",
            "source_backed_appendix": "source-backed evidence rows for issue claims",
        },
        projection_requirements=[
            "title plus opening note, highlights, or sections exist",
            "visual blocks reference existing workspace views or clearly state they need review",
            "unsupported claims, dates, owners, or metrics are marked needs_review with assumptions",
        ],
        supported_views=["newsletter", "article", "review", "markdown_export"],
        preview_component="NewsletterPreview",
        accept_behavior="attach_review_artifact_after_preview_acceptance",
        export_behavior="markdown_newsletter, future_docx_newsletter",
        validation_rules=[
            "newsletter_has_title_and_update_content",
            "visual_blocks_are_described_or_marked_needs_review",
            "unsupported_claims_marked_needs_review",
        ],
    ),
}

REGISTERED_ARTIFACT_TYPES = set(ARTIFACT_REGISTRY)


AI_DRAFT_REVISION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "intent": {"type": "string"},
        "output_shape": {"type": "string", "enum": sorted(AI_DRAFT_OUTPUT_SHAPES)},
        "summary": {"type": "string"},
        "draft_nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "node_type": {"type": "string"},
                    "parent_id": {"type": ["string", "null"]},
                    "status": {"type": "string"},
                    "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
                    "assumptions": {"type": "array", "items": {"type": "string"}},
                    "metadata": METADATA_OUTPUT_SCHEMA,
                },
                "required": [
                    "id",
                    "title",
                    "summary",
                    "node_type",
                    "parent_id",
                    "status",
                    "source_refs",
                    "assumptions",
                    "metadata",
                ],
            },
        },
        "draft_edges": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "source_node_id": {"type": "string"},
                    "target_node_id": {"type": "string"},
                    "relationship_type": {"type": "string"},
                    "metadata": METADATA_OUTPUT_SCHEMA,
                },
                "required": [
                    "id",
                    "source_node_id",
                    "target_node_id",
                    "relationship_type",
                    "metadata",
                ],
            },
        },
        "draft_annotations": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "draft_items": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "generated_artifacts": {"type": "array", "items": GENERIC_ARTIFACT_SCHEMA},
        "source_coverage": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "tasks": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "checklist": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "flow_chart": FLOW_CHART_OUTPUT_SCHEMA,
        "knowledge_graph": KNOWLEDGE_GRAPH_OUTPUT_SCHEMA,
        "chart": CHART_OUTPUT_SCHEMA,
        "software_overlap_report": SOFTWARE_OVERLAP_REPORT_OUTPUT_SCHEMA,
        "executive_output": EXECUTIVE_OUTPUT_SCHEMA,
        "executive_summary": EXECUTIVE_SUMMARY_OUTPUT_SCHEMA,
        "news_article": NEWS_ARTICLE_OUTPUT_SCHEMA,
        "newsletter": NEWSLETTER_OUTPUT_SCHEMA,
        "outline": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "table": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "kanban": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "presentation_sections": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "review_annotations": {"type": "array", "items": GENERIC_OUTPUT_ITEM_SCHEMA},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "source_refs": {"type": "array", "items": SOURCE_REF_OUTPUT_SCHEMA},
    },
    "required": [
        "intent",
        "output_shape",
        "summary",
        "draft_nodes",
        "draft_edges",
        "draft_annotations",
        "draft_items",
        "generated_artifacts",
        "source_coverage",
        "tasks",
        "checklist",
        "flow_chart",
        "knowledge_graph",
        "chart",
        "software_overlap_report",
        "executive_output",
        "executive_summary",
        "news_article",
        "newsletter",
        "outline",
        "table",
        "kanban",
        "presentation_sections",
        "review_annotations",
        "assumptions",
        "source_refs",
    ],
}

AI_DRAFT_REVISION_OUTPUT_SCHEMA = strict_openai_schema(AI_DRAFT_REVISION_OUTPUT_SCHEMA)


def json_object_response_format() -> dict[str, Any]:
    return {"format": {"type": "json_object"}}


def json_schema_response_format(
    *,
    name: str,
    schema: dict[str, Any],
    strict: bool = True,
) -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": name,
            "strict": strict,
            "schema": strict_openai_schema(schema) if strict else deepcopy(schema),
        }
    }


AI_HELPER_PREVIEW_CONTRACT = f"""
Canonical AI helper preview contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- Top-level fields: preview_id, helper_id, action, scope, generated_by, preview_items, warnings, metadata.
- preview_items must be an array. Each item must include id, preview_type, node_id, title, rationale, confidence, source_refs, assumptions, and proposed_mutation.
- source_refs must be an array. If a proposed item is not source-backed, return source_refs: [] and add a plain-language assumption.
- proposed_mutation must be an object describing changes only. Do not rewrite the entire graph.
- Include metadata.ai_helper_preview_contract_version as "{AI_HELPER_PREVIEW_CONTRACT_VERSION}".
"""


AIDRAFT_SESSION_CONTRACT = f"""
Canonical Ask AI draft-session contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- Top-level session fields: session_id, workspace_id, scope, role, intent, prompt_history, model_policy, selected_model, model_reason, revisions, source_refs, validation_reports, accept_history, status, metadata.
- scope.type must be workspace, source, branch, node, or nodes. branch/node scopes require node_id; nodes scope requires node_ids; source scope requires source_id.
- revisions is an ordered list of AIDraftRevision objects. Each revision includes revision_id, session_id, prompt, draft_items, draft_nodes, draft_edges, draft_annotations, preview_diff, validation_report, created_at, model, and metadata.
- draft_items is a normalized selection surface. Each item includes id, item_type, title, content, source_refs, assumptions, status, selected, and metadata.
- draft_nodes and draft_edges are proposal state only. They must not be treated as canonical graph state until explicit accept.
- generated_artifacts is a preview-only array of registered artifact records. artifact_type must be in the Artifact Registry.
- Each generated artifact must include provenance with generated_by, prompt_profile, ai_role, input_scope, input_source_refs, generated_at, model_provider, model, confidence_summary, assumptions, and validation_status.
- Accept modes are append, replace, merge, selected, cited_only, and notes_only.
- Acceptance must produce a preview diff with added_nodes, added_edges, updated_nodes, review_outputs, needs_review_repairs, and accepted_item_ids.
- Accepted graph changes must run canonical graph validation before persistence.
- Accepted generated nodes without source_refs must be persisted as needs_review.
- Include metadata.ai_draft_session_contract_version as "{AI_DRAFT_SESSION_CONTRACT_VERSION}".
"""


ARTIFACT_REGISTRY_CONTRACT = f"""
Canonical TraceSpace Artifact Registry contract:
- Registered artifact types are: {", ".join(sorted(REGISTERED_ARTIFACT_TYPES))}.
- Do not emit unregistered artifact_type values.
- Every artifact type declares required inputs, optional inputs, generated schema, projection requirements, supported views, preview component, accept behavior, export behavior, and validation rules.
- Visual artifacts must reference canonical nodes, relationship edges, source chunks, or accepted artifact data unless explicitly marked draft or export_only.
- Charts require chart_spec and source-backed or extracted data rows before rendering.
- Relationship edges for knowledge_graph artifacts must include source_node_id, target_node_id, relationship_type, source_signal, confidence, rationale, source_refs or assumptions, and review_state.
- Software overlap reports must include inventory_items, overlap_candidates, rationalization_actions, and optional relationship_edges; every candidate needs at least two applications plus source_refs or assumptions.
- Enterprise business maps should use the canonical business ontology entity and relationship types when applicable.
- Unsupported, inferred, or unsourced items must be marked needs_review.
- Include metadata.artifact_registry_version as "{ARTIFACT_REGISTRY_VERSION}" when returning registry metadata.

{BUSINESS_ONTOLOGY_CONTRACT.strip()}
"""


EXECUTIVE_OUTPUT_CONTRACT = f"""
Canonical TraceSpace executive output contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- Top-level fields: contract_version, title, summary, key_findings, recommended_actions, risks, required_decisions, source_backed_appendix, assumptions, metadata.
- Each section item must include id, title, description, status, priority, owner_id, due_date, source_refs, source_backed, needs_review, and metadata.
- key_findings, recommended_actions, risks, and required_decisions may include unsourced items only when source_backed is false and needs_review is true.
- source_backed_appendix must include only items with at least one source_ref.document_id.
- Include contract_version as "{EXECUTIVE_OUTPUT_CONTRACT_VERSION}".
"""
