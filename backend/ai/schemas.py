from __future__ import annotations

from copy import deepcopy
from typing import Any


AI_HELPER_PREVIEW_CONTRACT_VERSION = "1"
AI_ACTION_PREVIEW_CONTRACT_VERSION = "1"
AI_DRAFT_SESSION_CONTRACT_VERSION = "1"
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
    "patch_diff",
    "source_coverage",
    "tasks_checklist",
    "outline",
    "table",
    "kanban",
    "presentation_sections",
    "review_annotations",
}


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
                "additionalProperties": True,
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "node_type": {"type": "string"},
                    "parent_id": {"type": ["string", "null"]},
                    "status": {"type": "string"},
                    "source_refs": {"type": "array"},
                    "metadata": {"type": "object"},
                },
                "required": ["id", "title"],
            },
        },
        "draft_edges": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": True,
                "properties": {
                    "id": {"type": "string"},
                    "source_node_id": {"type": "string"},
                    "target_node_id": {"type": "string"},
                    "relationship_type": {"type": "string"},
                    "metadata": {"type": "object"},
                },
                "required": ["id", "source_node_id", "target_node_id"],
            },
        },
        "draft_annotations": {"type": "array", "items": {"type": "object"}},
        "draft_items": {"type": "array", "items": {"type": "object"}},
        "source_coverage": {"type": "array", "items": {"type": "object"}},
        "tasks": {"type": "array", "items": {"type": "object"}},
        "checklist": {"type": "array", "items": {"type": "object"}},
        "outline": {"type": "array", "items": {"type": "object"}},
        "table": {"type": "array", "items": {"type": "object"}},
        "kanban": {"type": "array", "items": {"type": "object"}},
        "presentation_sections": {"type": "array", "items": {"type": "object"}},
        "review_annotations": {"type": "array", "items": {"type": "object"}},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "source_refs": {"type": "array", "items": {"type": "object"}},
    },
    "required": [
        "intent",
        "output_shape",
        "summary",
        "draft_nodes",
        "draft_edges",
        "draft_annotations",
        "draft_items",
        "source_coverage",
        "tasks",
        "checklist",
        "outline",
        "table",
        "kanban",
        "presentation_sections",
        "review_annotations",
        "assumptions",
        "source_refs",
    ],
}


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
            "schema": deepcopy(schema),
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
- Accept modes are append, replace, merge, selected, cited_only, and notes_only.
- Acceptance must produce a preview diff with added_nodes, added_edges, updated_nodes, review_outputs, needs_review_repairs, and accepted_item_ids.
- Accepted graph changes must run canonical graph validation before persistence.
- Accepted generated nodes without source_refs must be persisted as needs_review.
- Include metadata.ai_draft_session_contract_version as "{AI_DRAFT_SESSION_CONTRACT_VERSION}".
"""
