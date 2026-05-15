from __future__ import annotations

from copy import deepcopy
from typing import Any


AI_HELPER_PREVIEW_CONTRACT_VERSION = "1"
AI_ACTION_PREVIEW_CONTRACT_VERSION = "1"
AI_DRAFT_SESSION_CONTRACT_VERSION = "1"
ARTIFACT_REGISTRY_VERSION = "1"
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
    "implementation_handoff_package",
}

KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES = {
    "contains",
    "references",
    "depends_on",
    "duplicates",
    "conflicts_with",
    "similar_to",
    "derived_from",
    "supports",
    "contradicts",
    "implements",
    "owned_by",
    "requires_review_by",
    "related_to",
}

KNOWLEDGE_GRAPH_SOURCE_SIGNALS = {
    "explicit_text",
    "shared_source",
    "semantic_similarity",
    "user_created",
    "ai_inferred",
    "external_ref",
}


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
- Unsupported, inferred, or unsourced items must be marked needs_review.
- Include metadata.artifact_registry_version as "{ARTIFACT_REGISTRY_VERSION}" when returning registry metadata.
"""
