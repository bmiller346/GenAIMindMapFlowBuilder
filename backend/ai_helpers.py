from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from ai.roles import get_prompt_profile, list_prompt_profiles
from ai.schemas import (
    AI_ACTION_PREVIEW_CONTRACT_VERSION,
    AI_HELPER_PREVIEW_CONTRACT,
    AI_HELPER_PREVIEW_CONTRACT_VERSION,
    json_object_response_format,
)
from ai_model_policy import choose_openai_model
from config import MissingConfigurationError, get_setting
from graph.schemas import GraphSchemaError


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
HELPER_ACTIONS: dict[str, set[str]] = {
    "source_librarian": {"source_repair", "source_coverage"},
    "reviewer": {"missing_information", "sme_questions", "contradictions"},
    "project_planner": {"task_projection", "checklist_projection"},
    "integration_operator": {"handoff_readiness", "sync_issue_review"},
}
SCOPE_TYPES = {"workspace", "branch", "node", "source"}
AI_ACTION_SCOPES = {"workspace", "branch", "node"}
AI_ACTION_RUN_STATUSES = {"previewed", "accepted", "rejected"}
NODE_AI_ACTIONS = {
    "expand_this_node",
    "ask_follow_up",
    "generate_child_nodes",
    "convert_to_checklist",
    "create_sme_questions",
    "find_missing_source_support",
    "interpret_table_data",
    "generate_tasks",
    "custom_prompt",
}
BRANCH_AI_ACTIONS = {
    "summarize_branch",
    "reorganize_branch",
    "split_branch_into_categories",
    "generate_tasks",
    "generate_checklist",
    "find_gaps",
    "create_sme_questions",
    "custom_prompt",
}
WORKSPACE_AI_ACTIONS = {
    "suggest_follow_up_questions",
    "find_unsupported_assumptions",
    "find_duplicate_overlapping_nodes",
    "generate_training_outline",
    "export_branch_as_sop_draft",
}
AI_ACTIONS_BY_SCOPE = {
    "node": NODE_AI_ACTIONS,
    "branch": BRANCH_AI_ACTIONS,
    "workspace": WORKSPACE_AI_ACTIONS,
}


def generate_source_librarian_preview(
    graph: dict[str, Any],
    *,
    action: str = "source_repair",
    scope: dict[str, Any] | None = None,
    use_ai: bool = True,
    allow_deterministic_fallback: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action("source_librarian", action)
    normalized_scope = normalize_helper_scope(scope)
    scoped_graph = _scope_graph(graph, normalized_scope)
    warnings: list[str] = []

    if use_ai:
        try:
            preview = _generate_openai_source_librarian_preview(
                scoped_graph,
                action=action,
                scope=normalized_scope,
                model=model,
            )
            return validate_ai_helper_preview(preview)
        except MissingConfigurationError:
            if not allow_deterministic_fallback:
                raise
            warnings.append(
                "OpenAI API key is not configured; returned deterministic local preview."
            )

    preview = (
        _deterministic_source_coverage_preview(
            scoped_graph,
            scope=normalized_scope,
            warnings=warnings,
        )
        if action == "source_coverage"
        else _deterministic_source_librarian_preview(
            scoped_graph,
            scope=normalized_scope,
            warnings=warnings,
        )
    )
    return validate_ai_helper_preview(preview)


def generate_reviewer_preview(
    graph: dict[str, Any],
    *,
    action: str = "missing_information",
    scope: dict[str, Any] | None = None,
    use_ai: bool = True,
    allow_deterministic_fallback: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action("reviewer", action)
    normalized_scope = normalize_helper_scope(scope)
    scoped_graph = _scope_graph(graph, normalized_scope)
    warnings: list[str] = []

    if use_ai:
        try:
            preview = _generate_openai_reviewer_preview(
                scoped_graph,
                action=action,
                scope=normalized_scope,
                model=model,
            )
            return validate_ai_helper_preview(preview)
        except MissingConfigurationError:
            if not allow_deterministic_fallback:
                raise
            warnings.append(
                "OpenAI API key is not configured; returned deterministic local preview."
            )

    preview = _deterministic_reviewer_preview(
        scoped_graph,
        action=action,
        scope=normalized_scope,
        warnings=warnings,
    )
    return validate_ai_helper_preview(preview)


def generate_project_planner_preview(
    graph: dict[str, Any],
    *,
    action: str = "task_projection",
    scope: dict[str, Any] | None = None,
    use_ai: bool = True,
    allow_deterministic_fallback: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action("project_planner", action)
    normalized_scope = normalize_helper_scope(scope)
    scoped_graph = _scope_graph(graph, normalized_scope)
    warnings: list[str] = []

    if use_ai:
        try:
            preview = _generate_openai_project_planner_preview(
                scoped_graph,
                action=action,
                scope=normalized_scope,
                model=model,
            )
            return validate_ai_helper_preview(preview)
        except MissingConfigurationError:
            if not allow_deterministic_fallback:
                raise
            warnings.append(
                "OpenAI API key is not configured; returned deterministic local preview."
            )

    preview = _deterministic_project_planner_preview(
        scoped_graph,
        action=action,
        scope=normalized_scope,
        warnings=warnings,
    )
    return validate_ai_helper_preview(preview)


def generate_integration_operator_preview(
    graph: dict[str, Any],
    *,
    action: str = "handoff_readiness",
    scope: dict[str, Any] | None = None,
    use_ai: bool = True,
    allow_deterministic_fallback: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action("integration_operator", action)
    normalized_scope = normalize_helper_scope(scope)
    scoped_graph = _scope_graph(graph, normalized_scope)
    warnings: list[str] = []

    if use_ai:
        try:
            preview = _generate_openai_integration_operator_preview(
                scoped_graph,
                action=action,
                scope=normalized_scope,
                model=model,
            )
            return validate_ai_helper_preview(preview)
        except MissingConfigurationError:
            if not allow_deterministic_fallback:
                raise
            warnings.append(
                "OpenAI API key is not configured; returned deterministic local preview."
            )

    preview = _deterministic_integration_operator_preview(
        scoped_graph,
        action=action,
        scope=normalized_scope,
        warnings=warnings,
    )
    return validate_ai_helper_preview(preview)


def generate_helper_preview(
    helper_id: str,
    action: str,
    graph: dict[str, Any],
    *,
    scope: dict[str, Any] | None = None,
    use_ai: bool = True,
    allow_deterministic_fallback: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action(helper_id, action)
    if helper_id == "source_librarian":
        return generate_source_librarian_preview(
            graph,
            action=action,
            scope=scope,
            use_ai=use_ai,
            allow_deterministic_fallback=allow_deterministic_fallback,
            model=model,
        )
    if helper_id == "reviewer":
        return generate_reviewer_preview(
            graph,
            action=action,
            scope=scope,
            use_ai=use_ai,
            allow_deterministic_fallback=allow_deterministic_fallback,
            model=model,
        )
    if helper_id == "project_planner" and action in {
        "task_projection",
        "checklist_projection",
    }:
        return generate_project_planner_preview(
            graph,
            action=action,
            scope=scope,
            use_ai=use_ai,
            allow_deterministic_fallback=allow_deterministic_fallback,
            model=model,
        )
    if helper_id == "integration_operator" and action in {
        "handoff_readiness",
        "sync_issue_review",
    }:
        return generate_integration_operator_preview(
            graph,
            action=action,
            scope=scope,
            use_ai=use_ai,
            allow_deterministic_fallback=allow_deterministic_fallback,
            model=model,
        )

    warnings = [
        f"{helper_id}:{action} is registered but generation is not implemented yet."
    ]
    return build_helper_preview(
        helper_id=helper_id,
        action=action,
        scope=normalize_helper_scope(scope),
        generated_by="not_implemented",
        preview_items=[],
        warnings=warnings,
        metadata={"node_count": len(graph.get("nodes", [])) if isinstance(graph, dict) else 0},
    )


def validate_ai_action_request(
    *,
    role: str,
    action: str,
    scope: dict[str, Any] | None,
    custom_prompt: str | None = None,
) -> dict[str, Any]:
    normalized_scope = normalize_ai_action_scope(scope)
    scope_type = normalized_scope["type"]
    action_id = _action_id(action)
    profile = get_prompt_profile(role)
    errors = []

    if action_id not in AI_ACTIONS_BY_SCOPE[scope_type]:
        errors.append(
            f"ai_action.action: unsupported action '{action}' for {scope_type} scope"
        )
    if action_id not in profile["supported_actions"]:
        errors.append(
            f"ai_action.action: unsupported action '{action}' for role '{profile['label']}'"
        )
    if scope_type not in profile["supported_scopes"]:
        errors.append(
            f"ai_action.scope: unsupported scope '{scope_type}' for role '{profile['label']}'"
        )
    if action_id == "custom_prompt" and not _has_text(custom_prompt):
        errors.append("ai_action.custom_prompt: required for custom_prompt action")

    if errors:
        raise GraphSchemaError(errors)

    return {
        "role_id": profile["role_id"],
        "role_label": profile["label"],
        "action": action_id,
        "scope": normalized_scope,
        "custom_prompt": custom_prompt.strip() if isinstance(custom_prompt, str) and custom_prompt.strip() else None,
        "profile": profile,
    }


def normalize_ai_action_scope(scope: dict[str, Any] | None) -> dict[str, Any]:
    normalized = normalize_helper_scope(scope)
    if normalized["type"] not in AI_ACTION_SCOPES:
        normalized = {"type": "workspace"}
    return normalized


def build_ai_action_run(
    *,
    workspace_id: str,
    scope: dict[str, Any],
    role: str,
    action: str,
    custom_prompt: str | None = None,
    input_source_refs: list[dict[str, Any]] | None = None,
    status: str = "previewed",
    generated_node_ids: list[str] | None = None,
    ai_action_id: str | None = None,
    created_at: str | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    normalized_scope = normalize_ai_action_scope(scope)
    action_run = {
        "ai_action_id": ai_action_id or f"ai_action_{_utc_token()}",
        "workspace_id": str(workspace_id or ""),
        "source_node_id": normalized_scope.get("node_id"),
        "scope": normalized_scope["type"],
        "role": str(role or ""),
        "action": _action_id(action),
        "custom_prompt": custom_prompt if isinstance(custom_prompt, str) else None,
        "input_source_refs": input_source_refs or [],
        "created_at": created_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "created_by": created_by or "user",
        "status": status,
        "generated_node_ids": generated_node_ids or [],
    }
    return validate_ai_action_run(action_run)


def validate_ai_action_run(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_action_run: must be an object"])

    normalized = deepcopy(payload)
    for key in ("ai_action_id", "workspace_id", "scope", "role", "action", "created_at", "created_by", "status"):
        _require_string(normalized, key, "ai_action_run", errors)

    if normalized.get("scope") not in AI_ACTION_SCOPES:
        errors.append("ai_action_run.scope: must be node, branch, or workspace")
    if normalized.get("status") not in AI_ACTION_RUN_STATUSES:
        errors.append("ai_action_run.status: must be previewed, accepted, or rejected")
    if normalized.get("scope") in {"node", "branch"} and not _has_text(normalized.get("source_node_id")):
        errors.append("ai_action_run.source_node_id: required for node and branch scopes")
    if normalized.get("custom_prompt") is not None and not isinstance(normalized.get("custom_prompt"), str):
        errors.append("ai_action_run.custom_prompt: must be a string or null")
    _validate_source_ref_list(normalized.get("input_source_refs", []), "ai_action_run.input_source_refs", errors)
    generated_node_ids = normalized.get("generated_node_ids", [])
    if not isinstance(generated_node_ids, list) or not all(isinstance(node_id, str) for node_id in generated_node_ids):
        errors.append("ai_action_run.generated_node_ids: must be a list of strings")

    if errors:
        raise GraphSchemaError(errors)

    normalized["input_source_refs"] = normalized.get("input_source_refs", [])
    normalized["generated_node_ids"] = generated_node_ids
    return normalized


def generate_ai_action_preview(
    graph: dict[str, Any],
    *,
    workspace_id: str | None = None,
    role: str,
    action: str,
    scope: dict[str, Any] | None = None,
    custom_prompt: str | None = None,
    created_by: str = "user",
    model: str | None = None,
) -> dict[str, Any]:
    request = validate_ai_action_request(
        role=role,
        action=action,
        scope=scope,
        custom_prompt=custom_prompt,
    )
    normalized_scope = request["scope"]
    scoped_graph = _scope_graph(graph, normalized_scope) if normalized_scope["type"] == "branch" else graph
    if normalized_scope["type"] == "node":
        scoped_graph = _scope_node_graph(graph, normalized_scope["node_id"])

    input_source_refs = _collect_source_refs(scoped_graph)
    decision = choose_openai_model(
        requested_model=model,
        task=f"{request['role_label']} {request['action']}",
        content=f"{request['custom_prompt'] or ''}\n{json.dumps(scoped_graph)[:4000]}",
        requires_source_grounding=bool(input_source_refs),
    )
    workspace = graph.get("workspace", {}) if isinstance(graph, dict) else {}
    action_run = build_ai_action_run(
        workspace_id=workspace_id or workspace.get("id") or "",
        scope=normalized_scope,
        role=request["role_label"],
        action=request["action"],
        custom_prompt=request["custom_prompt"],
        input_source_refs=input_source_refs,
        created_by=created_by,
    )
    draft_nodes, draft_edges, draft_annotations, source_refs, assumptions = _deterministic_ai_action_drafts(
        scoped_graph,
        action_run=action_run,
        profile=request["profile"],
    )
    validation_report = validate_ai_action_drafts_for_accept(draft_nodes, draft_edges)
    action_run["generated_node_ids"] = [node["id"] for node in draft_nodes]

    preview = {
        "preview_id": f"preview_{action_run['ai_action_id']}",
        "ai_action_id": action_run["ai_action_id"],
        "scope": normalized_scope["type"],
        "role": request["role_label"],
        "role_id": request["role_id"],
        "action": request["action"],
        "custom_prompt": request["custom_prompt"],
        "draft_nodes": draft_nodes,
        "draft_edges": draft_edges,
        "draft_annotations": draft_annotations,
        "validation_report": validation_report,
        "source_refs": source_refs,
        "assumptions": assumptions,
        "ai_action_run": action_run,
        "metadata": {
            "ai_action_preview_contract_version": AI_ACTION_PREVIEW_CONTRACT_VERSION,
            "prompt_profile": request["profile"],
            "preview_mode": "deterministic_draft",
            "model": decision.model,
            "model_tier": decision.tier,
            "model_reason": decision.reason,
        },
    }
    return validate_ai_action_preview(preview)


def validate_ai_action_drafts_for_accept(
    draft_nodes: list[dict[str, Any]],
    draft_edges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    issues = []
    node_ids = {node.get("id") for node in draft_nodes if isinstance(node, dict)}
    for node in draft_nodes:
        if not isinstance(node, dict):
            continue
        node.setdefault("source_refs", [])
        node.setdefault("metadata", {})
        node.setdefault("external_refs", {})
        if node.get("node_type") != "reference" and not node.get("source_refs"):
            node["status"] = "needs_review"
            issues.append(
                {
                    "code": "missing_source_ref",
                    "severity": "warning",
                    "message": "AI action draft node is missing a source reference and was marked needs_review.",
                    "node_id": str(node.get("id", "")),
                    "repaired": True,
                }
            )

    for edge in draft_edges or []:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if target not in node_ids:
            issues.append(
                {
                    "code": "draft_edge_target_missing",
                    "severity": "error",
                    "message": "AI action draft edge target does not reference a draft node.",
                    "edge_id": str(edge.get("id", "")),
                    "repaired": False,
                }
            )

    return {
        "is_valid": not any(issue["severity"] == "error" for issue in issues),
        "repaired": any(issue["repaired"] for issue in issues),
        "issues": issues,
    }


def validate_ai_action_preview(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_action_preview: must be an object"])

    normalized = deepcopy(payload)
    for key in ("preview_id", "ai_action_id", "scope", "role", "role_id", "action"):
        _require_string(normalized, key, "ai_action_preview", errors)
    if normalized.get("scope") not in AI_ACTION_SCOPES:
        errors.append("ai_action_preview.scope: must be node, branch, or workspace")
    for key in ("draft_nodes", "draft_edges", "draft_annotations", "source_refs", "assumptions"):
        if not isinstance(normalized.get(key), list):
            errors.append(f"ai_action_preview.{key}: must be a list")
    if not isinstance(normalized.get("validation_report"), dict):
        errors.append("ai_action_preview.validation_report: must be an object")
    if not isinstance(normalized.get("metadata"), dict):
        errors.append("ai_action_preview.metadata: must be an object")
    try:
        validate_ai_action_run(normalized.get("ai_action_run", {}))
    except GraphSchemaError as exc:
        errors.extend(exc.errors)

    if errors:
        raise GraphSchemaError(errors)

    normalized["metadata"]["ai_action_preview_contract_version"] = AI_ACTION_PREVIEW_CONTRACT_VERSION
    return normalized


def build_helper_preview(
    *,
    helper_id: str,
    action: str,
    scope: dict[str, Any] | None,
    generated_by: str,
    preview_items: list[dict[str, Any]],
    warnings: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    preview_id: str | None = None,
) -> dict[str, Any]:
    validate_helper_action(helper_id, action)
    preview = {
        "preview_id": preview_id or f"preview_{helper_id}_{action}_{_utc_token()}",
        "helper_id": helper_id,
        "action": action,
        "scope": normalize_helper_scope(scope),
        "generated_by": generated_by,
        "preview_items": preview_items,
        "warnings": warnings or [],
        "metadata": metadata or {},
    }
    return validate_ai_helper_preview(preview)


def normalize_helper_scope(scope: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(scope, dict):
        return {"type": "workspace"}

    scope_type = scope.get("type") or "workspace"
    if scope_type not in SCOPE_TYPES:
        return {"type": "workspace"}

    normalized = {"type": scope_type}
    for key in ("node_id", "source_id"):
        value = scope.get(key)
        if isinstance(value, str) and value.strip():
            normalized[key] = value.strip()
    return normalized


def validate_helper_action(helper_id: str, action: str) -> None:
    actions = HELPER_ACTIONS.get(helper_id)
    if not actions:
        raise GraphSchemaError([f"ai_helper_preview.helper_id: unsupported helper '{helper_id}'"])
    if action not in actions:
        raise GraphSchemaError(
            [f"ai_helper_preview.action: unsupported action '{action}' for helper '{helper_id}'"]
        )


def validate_ai_helper_preview(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_helper_preview: must be an object"])

    normalized = deepcopy(payload)
    for key in ("preview_id", "helper_id", "action", "generated_by"):
        _require_string(normalized, key, "ai_helper_preview", errors)

    scope = normalized.get("scope")
    if not isinstance(scope, dict):
        errors.append("ai_helper_preview.scope: must be an object")
    else:
        _validate_scope(scope, errors)

    helper_id = normalized.get("helper_id")
    action = normalized.get("action")
    if isinstance(helper_id, str) and isinstance(action, str):
        try:
            validate_helper_action(helper_id, action)
        except GraphSchemaError as exc:
            errors.extend(exc.errors)

    items = normalized.get("preview_items")
    if not isinstance(items, list):
        errors.append("ai_helper_preview.preview_items: must be a list")
        items = []

    item_ids: set[str] = set()
    for index, item in enumerate(items):
        _validate_preview_item(item, index, errors)
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
            if item["id"] in item_ids:
                errors.append(
                    f"ai_helper_preview.preview_items.{index}.id: duplicate item id '{item['id']}'"
                )
            item_ids.add(item["id"])

    warnings = normalized.get("warnings", [])
    if not isinstance(warnings, list) or not all(
        isinstance(warning, str) for warning in warnings
    ):
        errors.append("ai_helper_preview.warnings: must be a list of strings")

    metadata = normalized.get("metadata", {})
    if metadata is not None and not isinstance(metadata, dict):
        errors.append("ai_helper_preview.metadata: must be an object")

    if errors:
        raise GraphSchemaError(errors)

    normalized["preview_items"] = items
    normalized["warnings"] = warnings
    normalized["scope"] = normalize_helper_scope(scope)
    metadata = metadata if isinstance(metadata, dict) else {}
    metadata["ai_helper_preview_contract_version"] = AI_HELPER_PREVIEW_CONTRACT_VERSION
    normalized["metadata"] = metadata
    return normalized


def parse_ai_helper_preview_response(raw_response: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw_response, dict):
        return validate_ai_helper_preview(raw_response)

    if not isinstance(raw_response, str):
        raise GraphSchemaError(["ai_helper_preview: response must be a JSON object or string"])

    try:
        parsed = json.loads(_strip_json_fence(raw_response))
    except json.JSONDecodeError as exc:
        raise GraphSchemaError(
            [f"ai_helper_preview: invalid JSON at character {exc.pos}"]
        ) from exc

    return validate_ai_helper_preview(parsed)


def _generate_openai_source_librarian_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    model: str | None = None,
) -> dict[str, Any]:
    return _generate_openai_helper_preview(
        helper_id="source_librarian",
        action=action,
        graph=graph,
        scope=scope,
        system_prompt=(
            "You are DocMap's Source Librarian. Produce reviewable source "
            "repair and coverage previews only. Never mutate the graph directly."
        ),
        task_prompt=_source_librarian_prompt(graph, scope, action),
        model=model,
    )


def _generate_openai_reviewer_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    model: str | None = None,
) -> dict[str, Any]:
    return _generate_openai_helper_preview(
        helper_id="reviewer",
        action=action,
        graph=graph,
        scope=scope,
        system_prompt=(
            "You are DocMap's Reviewer. Produce reviewable gaps, "
            "contradictions, and SME question previews only. Cite source "
            "references or mark explicit assumptions."
        ),
        task_prompt=_reviewer_prompt(graph, scope, action),
        model=model,
    )


def _generate_openai_project_planner_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    model: str | None = None,
) -> dict[str, Any]:
    return _generate_openai_helper_preview(
        helper_id="project_planner",
        action=action,
        graph=graph,
        scope=scope,
        system_prompt=(
            "You are DocMap's Project Planner. Produce reviewable task and "
            "checklist previews only. Never mutate the graph directly."
        ),
        task_prompt=_project_planner_prompt(graph, action, scope),
        model=model,
    )


def _generate_openai_integration_operator_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    model: str | None = None,
) -> dict[str, Any]:
    return _generate_openai_helper_preview(
        helper_id="integration_operator",
        action=action,
        graph=graph,
        scope=scope,
        system_prompt=(
            "You are DocMap's Integration Operator. Produce reviewable handoff "
            "readiness and sync issue previews only. Never push to external systems "
            "and never mutate the graph directly."
        ),
        task_prompt=_integration_operator_prompt(graph, action, scope),
        model=model,
    )


def _generate_openai_helper_preview(
    *,
    helper_id: str,
    action: str,
    graph: dict[str, Any],
    scope: dict[str, Any],
    system_prompt: str,
    task_prompt: str,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action(helper_id, action)
    api_key = get_setting("openai_api_key")
    if not api_key:
        raise MissingConfigurationError(
            "Missing required environment variable(s): openai_api_key."
        )

    payload = build_openai_helper_preview_payload(
        helper_id=helper_id,
        action=action,
        graph=graph,
        scope=scope,
        system_prompt=system_prompt,
        task_prompt=task_prompt,
        model=model,
    )
    data = _post_openai_json(payload, api_key)
    return parse_ai_helper_preview_response(_extract_output_text(data))


def build_openai_helper_preview_payload(
    *,
    helper_id: str,
    action: str,
    graph: dict[str, Any],
    scope: dict[str, Any] | None,
    system_prompt: str,
    task_prompt: str,
    model: str | None = None,
) -> dict[str, Any]:
    validate_helper_action(helper_id, action)
    normalized_scope = normalize_helper_scope(scope)
    decision = choose_openai_model(
        requested_model=model,
        task=f"{helper_id} {action}",
        content=f"{system_prompt}\n{task_prompt}",
        requires_source_grounding=helper_id in {"source_librarian", "reviewer"},
    )
    return {
        "model": decision.model,
        "input": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": (
                    f"Helper: {helper_id}\n"
                    f"Action: {action}\n"
                    f"Scope: {json.dumps(normalized_scope, indent=2)}\n\n"
                    f"{task_prompt.strip()}\n\n"
                    f"{AI_HELPER_PREVIEW_CONTRACT.strip()}"
                ),
            },
        ],
        "text": json_object_response_format(),
        "metadata": {
            "helper_id": helper_id,
            "action": action,
            "scope_type": normalized_scope.get("type", "workspace"),
            "node_count": len(graph.get("nodes", [])) if isinstance(graph, dict) else 0,
            "model_tier": decision.tier,
            "model_reason": decision.reason,
        },
    }


def _source_librarian_prompt(
    graph: dict[str, Any],
    scope: dict[str, Any],
    action: str,
) -> str:
    action_guidance = (
        "Find nodes with missing, incomplete, or weak source references. For each useful "
        "candidate, propose one source repair item. Prefer existing source_refs from "
        "nearby ancestors, children, or siblings. If no source basis exists, mark the "
        "item as a request for reviewer source lookup with source_refs: []."
        if action == "source_repair"
        else "Build source coverage preview items that summarize uncited nodes, incomplete "
        "source refs, and sources that have no citing graph nodes. Use source_refs when "
        "a coverage item is tied to a document; otherwise include explicit assumptions."
    )
    return f"""
Inspect this DocMap workspace graph and produce Source Librarian preview items.

Action: {action}
Scope: {json.dumps(scope, indent=2)}
Workspace graph:
{json.dumps(graph, indent=2)}

{action_guidance}
""".strip()


def _reviewer_prompt(
    graph: dict[str, Any],
    scope: dict[str, Any],
    action: str,
) -> str:
    action_guidance = {
        "missing_information": (
            "Find material gaps that block review: missing sources, missing confidence, "
            "missing summaries, nodes marked needs_review, and task-like nodes without "
            "owner, due date, or priority."
        ),
        "sme_questions": (
            "Draft concise SME questions for nodes that need expert review. Each question "
            "must name the unresolved decision or missing evidence."
        ),
        "contradictions": (
            "Find likely contradictions between node claims, statuses, table values, or "
            "source-backed statements. Only emit a contradiction when the graph text gives "
            "a clear basis; otherwise emit no item."
        ),
    }[action]
    return f"""
Inspect this DocMap workspace graph and produce Reviewer preview items.

Action: {action}
Scope: {json.dumps(scope, indent=2)}
Workspace graph:
{json.dumps(graph, indent=2)}

{action_guidance}

Every preview item must include citations from source_refs when available. If
the graph does not provide a source-backed basis, keep source_refs empty and
state the assumption or SME dependency explicitly.
""".strip()


def _project_planner_prompt(
    graph: dict[str, Any],
    action: str,
    scope: dict[str, Any],
) -> str:
    return f"""
Inspect this DocMap workspace graph and produce Project Planner preview items.

Action: {action}
Scope: {json.dumps(scope, indent=2)}
Workspace graph:
{json.dumps(graph, indent=2)}

For task_projection, propose branch-to-task metadata for useful execution nodes.
Each proposed_mutation must include task_projection plus any suggested node_type,
status, priority, owner_id, and due_date changes. Mark accepted work as
needs_review unless the node is already approved or reviewed.

For checklist_projection, propose checklist labels, notes, order, review flags,
priority, owner, and due date hints. Each proposed_mutation must include
checklist_projection.

Use existing node IDs only. Preserve existing owners, due dates, priorities,
approved, and reviewed statuses unless there is a clear reason to suggest a
missing value. If a suggestion is inferred rather than source-backed, keep
source_refs empty and add an assumption.

{AI_HELPER_PREVIEW_CONTRACT.strip()}
""".strip()


def _integration_operator_prompt(
    graph: dict[str, Any],
    action: str,
    scope: dict[str, Any],
) -> str:
    action_guidance = (
        "For handoff_readiness, inspect task-capable nodes, accepted preview metadata, "
        "monday_selection_input, monday_selection_manifest, and external_refs. Emit "
        "preview items that explain whether each relevant node is ready, staged only, "
        "or blocked for monday/Miro handoff."
        if action == "handoff_readiness"
        else "For sync_issue_review, inspect external_refs and staged monday selection "
        "metadata. Emit preview items for missing board IDs, item IDs, export batches, "
        "push timestamps, staged-but-unpushed items, or stale/conflicting status clues."
    )
    return f"""
Inspect this DocMap workspace graph and produce Integration Operator preview items.

Action: {action}
Scope: {json.dumps(scope, indent=2)}
Workspace graph:
{json.dumps(graph, indent=2)}

{action_guidance}

Each proposed_mutation must include integration_operator_preview with target,
readiness, issues, explanation, and source fields. Use existing source_refs
when a node has them; otherwise keep source_refs empty and state the handoff
assumption explicitly.
""".strip()


def _deterministic_source_librarian_preview(
    graph: dict[str, Any],
    *,
    scope: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges", []) if isinstance(graph.get("edges"), list) else []
    node_lookup = {node.get("id"): node for node in nodes if isinstance(node, dict)}
    parent_by_child = {
        edge.get("target_node_id"): edge.get("source_node_id")
        for edge in edges
        if isinstance(edge, dict)
    }
    children_by_parent: dict[str, list[str]] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source and target:
            children_by_parent.setdefault(source, []).append(target)

    items = []
    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue
        issues = _source_issues(node)
        if not issues:
            continue
        suggestion = _nearest_source_ref(
            node,
            node_lookup=node_lookup,
            parent_by_child=parent_by_child,
            children_by_parent=children_by_parent,
        )
        source_refs = [suggestion["source_ref"]] if suggestion else []
        assumptions = [] if suggestion else ["Reviewer must identify a supporting source."]
        items.append(
            {
                "id": f"source_repair_{_token(node.get('id', 'node'))}",
                "preview_type": "source_repair",
                "node_id": node.get("id", ""),
                "title": f"Repair source reference for {node.get('title') or node.get('id')}",
                "rationale": (
                    f"{', '.join(issues)}. "
                    + (
                        f"Suggested from {suggestion['relationship']} node '{suggestion['title']}'."
                        if suggestion
                        else "No nearby cited node was found."
                    )
                ),
                "confidence": "low" if suggestion else "needs_review",
                "source_refs": source_refs,
                "assumptions": assumptions,
                "proposed_mutation": {
                    "source_refs": source_refs,
                    "source_ref_repair": {
                        "repair_type": "suggest_source_ref"
                        if suggestion
                        else "request_source_ref",
                        "issues": issues,
                        "suggested_from_node_id": suggestion.get("node_id", "")
                        if suggestion
                        else "",
                    },
                },
            }
        )

    return build_helper_preview(
        helper_id="source_librarian",
        action="source_repair",
        scope=scope,
        generated_by="deterministic_fallback",
        preview_items=items,
        warnings=warnings or [],
        metadata={
            "node_count": len(nodes),
            "ai_helper_preview_contract_version": AI_HELPER_PREVIEW_CONTRACT_VERSION,
        },
    )


def _deterministic_source_coverage_preview(
    graph: dict[str, Any],
    *,
    scope: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    source_library = (
        graph.get("source_library", {}) if isinstance(graph.get("source_library"), dict) else {}
    )
    sources = (
        graph.get("sources", [])
        if isinstance(graph.get("sources"), list)
        else source_library.get("documents", [])
        if isinstance(source_library.get("documents"), list)
        else []
    )
    cited_source_ids: set[str] = set()
    items: list[dict[str, Any]] = []

    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue
        refs = _node_source_refs(node)
        for ref in refs:
            if ref.get("document_id"):
                cited_source_ids.add(str(ref["document_id"]))
        issues = _source_issues(node)
        if not issues:
            continue
        cited_refs = [ref for ref in refs if ref.get("document_id")]
        items.append(
            {
                "id": f"source_coverage_{_token(node.get('id', 'node'))}",
                "preview_type": "source_coverage",
                "node_id": node.get("id", ""),
                "title": f"Source coverage gap for {node.get('title') or node.get('id')}",
                "rationale": ", ".join(issues),
                "confidence": "medium" if cited_refs else "needs_review",
                "source_refs": cited_refs[:1],
                "assumptions": []
                if cited_refs
                else ["Reviewer must identify a supporting source."],
                "proposed_mutation": {
                    "source_coverage": {
                        "coverage_status": "incomplete",
                        "issues": issues,
                    }
                },
            }
        )

    for source in sources:
        if not isinstance(source, dict):
            continue
        source_id = (
            source.get("id")
            or source.get("document_id")
            or source.get("source_document_id")
        )
        if not source_id or str(source_id) in cited_source_ids:
            continue
        source_node_ids = source.get("source_node_ids") if isinstance(source.get("source_node_ids"), list) else []
        node_id = str(source_node_ids[0]) if source_node_ids else f"source:{source_id}"
        items.append(
            {
                "id": f"unused_source_{_token(source_id)}",
                "preview_type": "source_coverage",
                "node_id": node_id,
                "title": f"Unused source: {source.get('filename') or source.get('title') or source_id}",
                "rationale": "Source exists in the library but no graph node cites it.",
                "confidence": "medium",
                "source_refs": [{"document_id": str(source_id)}],
                "assumptions": [],
                "proposed_mutation": {
                    "source_coverage": {
                        "coverage_status": "uncited_source",
                        "source_id": str(source_id),
                    }
                },
            }
        )

    return build_helper_preview(
        helper_id="source_librarian",
        action="source_coverage",
        scope=scope,
        generated_by="deterministic_fallback",
        preview_items=items,
        warnings=warnings or [],
        metadata={"node_count": len(nodes), "cited_source_count": len(cited_source_ids)},
    )


def _deterministic_reviewer_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    if action == "contradictions":
        items = _deterministic_contradiction_items(nodes)
    else:
        items = []
        for node in nodes:
            if not isinstance(node, dict) or node.get("node_type") == "reference":
                continue
            reasons = _review_gap_reasons(node)
            if not reasons:
                continue
            source_refs = _node_source_refs(node)
            if action == "missing_information":
                items.append(_missing_information_item(node, reasons, source_refs))
            elif action == "sme_questions":
                items.extend(_sme_question_items(node, reasons, source_refs))

    return build_helper_preview(
        helper_id="reviewer",
        action=action,
        scope=scope,
        generated_by="deterministic_fallback",
        preview_items=items,
        warnings=warnings or [],
        metadata={"node_count": len(nodes)},
    )


def _missing_information_item(
    node: dict[str, Any],
    reasons: list[str],
    source_refs: list[dict[str, Any]],
) -> dict[str, Any]:
    severity = (
        "high"
        if any("source" in reason.lower() or "review" in reason.lower() for reason in reasons)
        else "medium"
        if len(reasons) >= 3
        else "low"
    )
    return {
        "id": f"missing_information_{_token(node.get('id', 'node'))}",
        "preview_type": "missing_information",
        "node_id": node.get("id", ""),
        "title": f"Resolve missing information for {node.get('title') or node.get('id')}",
        "rationale": ", ".join(reasons),
        "confidence": severity,
        "source_refs": source_refs[:1],
        "assumptions": []
        if source_refs
        else ["Reviewer must validate this finding without a source citation."],
        "proposed_mutation": {
            "missing_info_review": {
                "severity": severity,
                "reasons": reasons,
            }
        },
    }


def _sme_question_items(
    node: dict[str, Any],
    reasons: list[str],
    source_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "id": f"sme_question_{_token(node.get('id', 'node'))}_{index + 1}",
            "preview_type": "sme_question",
            "node_id": node.get("id", ""),
            "title": f"SME question for {node.get('title') or node.get('id')}",
            "rationale": reason,
            "confidence": "medium" if source_refs else "needs_review",
            "source_refs": source_refs[:1],
            "assumptions": []
            if source_refs
            else ["Question is based on graph metadata rather than a source citation."],
            "proposed_mutation": {
                "sme_review_question": {
                    "reason": reason,
                    "question": _question_for_reason(node, reason),
                }
            },
        }
        for index, reason in enumerate(reasons)
    ]


def _deterministic_contradiction_items(nodes: list[Any]) -> list[dict[str, Any]]:
    by_title: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        title = str(node.get("title") or "").strip().lower()
        if title:
            by_title.setdefault(title, []).append(node)

    items: list[dict[str, Any]] = []
    for title, matching_nodes in by_title.items():
        if len(matching_nodes) < 2:
            continue
        statuses = {str(node.get("status") or "").strip() for node in matching_nodes}
        summaries = {str(node.get("summary") or "").strip() for node in matching_nodes}
        if len(statuses - {""}) <= 1 and len(summaries - {""}) <= 1:
            continue
        source_refs = [
            ref
            for node in matching_nodes
            for ref in _node_source_refs(node)
            if ref.get("document_id")
        ][:2]
        first_node = matching_nodes[0]
        items.append(
            {
                "id": f"contradiction_{_token(title)}",
                "preview_type": "contradiction",
                "node_id": first_node.get("id", ""),
                "title": f"Review possible contradiction: {first_node.get('title')}",
                "rationale": (
                    "Multiple nodes share this title but differ in status or summary."
                ),
                "confidence": "low",
                "source_refs": source_refs,
                "assumptions": []
                if source_refs
                else ["Contradiction is inferred from graph text without source citations."],
                "proposed_mutation": {
                    "contradiction_review": {
                        "node_ids": [node.get("id", "") for node in matching_nodes],
                        "statuses": sorted(statuses - {""}),
                    }
                },
            }
        )
    return items


def _deterministic_project_planner_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges", []) if isinstance(graph.get("edges"), list) else []
    child_count_by_node: dict[str, int] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        if source:
            child_count_by_node[source] = child_count_by_node.get(source, 0) + 1

    preview_items = []
    order = 0
    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue

        order += 1
        if action == "task_projection":
            preview_items.append(_project_task_preview_item(node, order))
        else:
            preview_items.append(
                _project_checklist_preview_item(
                    node,
                    order,
                    has_children=child_count_by_node.get(node.get("id", ""), 0) > 0,
                )
            )

    return build_helper_preview(
        helper_id="project_planner",
        action=action,
        scope=scope,
        generated_by="deterministic_fallback",
        preview_items=preview_items,
        warnings=warnings or [],
        metadata={
            "node_count": len(nodes),
            "planner_item_count": len(preview_items),
            "ai_helper_preview_contract_version": AI_HELPER_PREVIEW_CONTRACT_VERSION,
        },
    )


def _project_task_preview_item(node: dict[str, Any], order: int) -> dict[str, Any]:
    node_id = node.get("id", "")
    current_status = node.get("status", "")
    preview_status = _review_status_after_accept(current_status)
    priority = node.get("priority") or _suggest_priority(node, order)
    owner_id = node.get("owner_id") or ""
    due_date = node.get("due_date") or ""
    task_projection = {
        "accepted": False,
        "preview_type": node.get("node_type") if _is_task_capable(node) else "task",
        "preview_status": preview_status,
        "priority": priority,
        "owner_id": owner_id,
        "due_date": due_date,
        "source": "generated_project_planner_preview",
    }
    assumptions = _planner_assumptions(node, priority, owner_id, due_date)

    return {
        "id": f"task_projection_{_token(node_id)}",
        "preview_type": "task_projection",
        "node_id": node_id,
        "title": f"Plan task for {node.get('title') or node_id}",
        "rationale": "Projected this graph node into a reviewable task candidate.",
        "confidence": "medium" if node.get("source_refs") else "low",
        "source_refs": _source_refs_for_preview(node),
        "assumptions": assumptions,
        "proposed_mutation": {
            "node_type": node.get("node_type") if _is_task_capable(node) else "task",
            "status": preview_status,
            "priority": priority,
            "owner_id": owner_id,
            "due_date": due_date,
            "task_projection": task_projection,
        },
    }


def _project_checklist_preview_item(
    node: dict[str, Any],
    order: int,
    *,
    has_children: bool,
) -> dict[str, Any]:
    node_id = node.get("id", "")
    review_required = (
        node.get("status") == "needs_review"
        or node.get("node_type") == "needs_review"
        or not node.get("source_refs")
        or not _node_confidence(node)
    )
    checklist_projection = {
        "accepted": False,
        "order": order,
        "label": node.get("title") or node_id,
        "note": node.get("summary")
        or (
            "Parent item with nested follow-up work."
            if has_children
            else "Leaf item ready for checklist review."
        ),
        "review_required": review_required,
        "priority": node.get("priority") or _suggest_priority(node, order),
        "owner_id": node.get("owner_id") or "",
        "due_date": node.get("due_date") or "",
        "source": "generated_project_planner_preview",
    }

    return {
        "id": f"checklist_projection_{_token(node_id)}",
        "preview_type": "checklist_projection",
        "node_id": node_id,
        "title": f"Plan checklist item for {node.get('title') or node_id}",
        "rationale": "Projected this graph node into a reviewable checklist item.",
        "confidence": "medium" if _node_confidence(node) else "low",
        "source_refs": _source_refs_for_preview(node),
        "assumptions": _planner_assumptions(
            node,
            checklist_projection["priority"],
            checklist_projection["owner_id"],
            checklist_projection["due_date"],
        ),
        "proposed_mutation": {
            "status": _review_status_after_accept(node.get("status", "")),
            "checklist_projection": checklist_projection,
        },
    }


def _deterministic_integration_operator_preview(
    graph: dict[str, Any],
    *,
    action: str,
    scope: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    preview_items = []
    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue

        if action == "handoff_readiness":
            item = _handoff_readiness_item(node)
            if item:
                preview_items.append(item)
        else:
            item = _sync_issue_review_item(node)
            if item:
                preview_items.append(item)

    return build_helper_preview(
        helper_id="integration_operator",
        action=action,
        scope=scope,
        generated_by="deterministic_fallback",
        preview_items=preview_items,
        warnings=warnings or [],
        metadata={
            "node_count": len(nodes),
            "integration_operator_item_count": len(preview_items),
            "ai_helper_preview_contract_version": AI_HELPER_PREVIEW_CONTRACT_VERSION,
        },
    )


def _handoff_readiness_item(node: dict[str, Any]) -> dict[str, Any] | None:
    if not _is_integration_candidate(node):
        return None

    readiness = _integration_readiness(node)
    node_id = node.get("id", "")
    title = node.get("title") or node_id
    explanation = _handoff_explanation(readiness["readiness"], readiness["issues"])
    assumptions = _integration_assumptions(node, readiness["issues"])

    return {
        "id": f"handoff_readiness_{_token(node_id)}",
        "preview_type": "handoff_readiness",
        "node_id": node_id,
        "title": f"Review handoff readiness for {title}",
        "rationale": explanation,
        "confidence": "medium" if readiness["readiness"] == "ready" else "low",
        "source_refs": _source_refs_for_preview(node),
        "assumptions": assumptions,
        "proposed_mutation": {
            "integration_operator_preview": {
                "target": "monday",
                "readiness": readiness["readiness"],
                "issues": readiness["issues"],
                "explanation": explanation,
                "source": "generated_integration_operator_preview",
            }
        },
    }


def _sync_issue_review_item(node: dict[str, Any]) -> dict[str, Any] | None:
    readiness = _integration_readiness(node)
    issues = readiness["issues"]
    if not issues:
        return None

    node_id = node.get("id", "")
    title = node.get("title") or node_id
    explanation = f"Found {len(issues)} sync issue{'s' if len(issues) != 1 else ''}: {', '.join(issues)}."

    return {
        "id": f"sync_issue_review_{_token(node_id)}",
        "preview_type": "sync_issue_review",
        "node_id": node_id,
        "title": f"Explain sync issues for {title}",
        "rationale": explanation,
        "confidence": "medium" if _external_refs(node) else "low",
        "source_refs": _source_refs_for_preview(node),
        "assumptions": _integration_assumptions(node, issues),
        "proposed_mutation": {
            "integration_operator_preview": {
                "target": "monday",
                "readiness": readiness["readiness"],
                "issues": issues,
                "explanation": explanation,
                "source": "generated_integration_operator_preview",
            }
        },
    }


def _is_integration_candidate(node: dict[str, Any]) -> bool:
    return (
        _is_task_capable(node)
        or bool(_external_refs(node))
        or bool(node.get("monday_selection_input"))
        or bool(node.get("local_preview_acceptances"))
        or bool(node.get("task_projection"))
        or bool(node.get("checklist_projection"))
    )


def _integration_readiness(node: dict[str, Any]) -> dict[str, Any]:
    external_refs = _external_refs(node)
    monday_ref = external_refs.get("monday", {}) if isinstance(external_refs, dict) else {}
    has_staged_selection = bool(node.get("monday_selection_input"))
    issues = []

    if not monday_ref.get("board_id"):
        issues.append("Missing monday board")
    if not monday_ref.get("item_id"):
        issues.append("Missing monday item")
    if monday_ref and not monday_ref.get("export_batch_id"):
        issues.append("Missing export batch")
    if monday_ref and not monday_ref.get("last_pushed_at"):
        issues.append("Missing push timestamp")
    if not has_staged_selection and not monday_ref.get("item_id"):
        issues.append("No staged monday selection")

    if monday_ref.get("board_id") and monday_ref.get("item_id"):
        readiness = "ready"
    elif has_staged_selection:
        readiness = "staged_not_pushed"
    else:
        readiness = "not_ready"

    return {"readiness": readiness, "issues": issues}


def _handoff_explanation(readiness: str, issues: list[str]) -> str:
    if readiness == "ready":
        return "External monday references are present enough for status pull or handoff review."
    if readiness == "staged_not_pushed":
        return "The node has staged monday input, but it has not been pushed and linked yet."
    if issues:
        return f"Handoff is blocked until these gaps are resolved: {', '.join(issues)}."
    return "Handoff readiness could not be established from current graph metadata."


def _integration_assumptions(node: dict[str, Any], issues: list[str]) -> list[str]:
    assumptions = []
    if not _source_refs_for_preview(node):
        assumptions.append("Handoff review is based on graph metadata rather than source evidence.")
    if "No staged monday selection" in issues:
        assumptions.append("A user must stage monday input before this node can be pushed.")
    if "Missing monday item" in issues:
        assumptions.append("No external monday item mapping is available on this node.")
    return assumptions


def _external_refs(node: dict[str, Any]) -> dict[str, Any]:
    refs = node.get("external_refs")
    return refs if isinstance(refs, dict) else {}


def _scope_graph(graph: dict[str, Any], scope: dict[str, Any]) -> dict[str, Any]:
    if scope.get("type") != "branch" or not scope.get("node_id"):
        return graph

    root_id = scope["node_id"]
    edges = graph.get("edges", []) if isinstance(graph.get("edges"), list) else []
    children_by_parent: dict[str, list[str]] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source and target:
            children_by_parent.setdefault(source, []).append(target)

    selected_ids = {root_id}
    stack = list(children_by_parent.get(root_id, []))
    while stack:
        current = stack.pop()
        if current in selected_ids:
            continue
        selected_ids.add(current)
        stack.extend(children_by_parent.get(current, []))

    scoped = deepcopy(graph)
    scoped["nodes"] = [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("id") in selected_ids
    ]
    scoped["edges"] = [
        edge
        for edge in edges
        if edge.get("source_node_id") in selected_ids
        and edge.get("target_node_id") in selected_ids
    ]
    scoped["tasks"] = [
        task
        for task in graph.get("tasks", [])
        if isinstance(task, dict) and task.get("node_id") in selected_ids
    ]
    return scoped


def _is_task_capable(node: dict[str, Any]) -> bool:
    return node.get("node_type") in {"task", "procedure", "workflow", "needs_review", "requirement"}


def _review_status_after_accept(status: str) -> str:
    return status if status in {"approved", "reviewed"} else "needs_review"


def _suggest_priority(node: dict[str, Any], order: int) -> str:
    node_type = node.get("node_type", "")
    status = node.get("status", "")
    if status == "needs_review" or node_type in {"needs_review", "requirement"}:
        return "high"
    if node_type in {"task", "workflow", "procedure"}:
        return "medium"
    return "medium" if order <= 3 else "low"


def _node_confidence(node: dict[str, Any]) -> Any:
    if node.get("confidence"):
        return node.get("confidence")
    refs = _source_refs_for_preview(node)
    first_ref = refs[0] if refs and isinstance(refs[0], dict) else {}
    return first_ref.get("confidence")


def _planner_assumptions(
    node: dict[str, Any],
    priority: str,
    owner_id: str,
    due_date: str,
) -> list[str]:
    assumptions = []
    if not node.get("source_refs"):
        assumptions.append("Planner suggestion is not source-backed.")
    if priority and not node.get("priority"):
        assumptions.append(f"Priority '{priority}' was inferred from node type and review state.")
    if not owner_id:
        assumptions.append("Owner is unspecified and should be assigned by a reviewer.")
    if not due_date:
        assumptions.append("Due date is unspecified and should be assigned by a reviewer.")
    return assumptions


def _source_refs_for_preview(node: dict[str, Any]) -> list[dict[str, Any]]:
    refs = node.get("source_refs") if isinstance(node.get("source_refs"), list) else []
    return refs


def _node_source_refs(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        ref
        for ref in _source_refs_for_preview(node)
        if isinstance(ref, dict)
    ]


def _review_gap_reasons(node: dict[str, Any]) -> list[str]:
    reasons = []
    if not _node_source_refs(node) or not _node_source_refs(node)[0].get("document_id"):
        reasons.append("Missing source document")
    if not node.get("confidence"):
        first_ref = _node_source_refs(node)[0] if _node_source_refs(node) else {}
        if not first_ref.get("confidence"):
            reasons.append("Missing confidence")
    if not node.get("summary") and node.get("node_type") != "reference":
        reasons.append("Missing summary")
    if node.get("status") == "needs_review" or node.get("node_type") == "needs_review":
        reasons.append("Marked for review")
    if _is_task_capable(node) and not node.get("owner_id"):
        reasons.append("Missing owner")
    if _is_task_capable(node) and not node.get("due_date"):
        reasons.append("Missing due date")
    if _is_task_capable(node) and not node.get("priority"):
        reasons.append("Missing priority")
    return reasons


def _question_for_reason(node: dict[str, Any], reason: str) -> str:
    title = node.get("title") or node.get("id") or "this node"
    if reason == "Missing source document":
        return f'Which source document, page, or section verifies "{title}"?'
    if reason == "Missing confidence":
        return f'How confident should reviewers be in "{title}", and why?'
    if reason == "Missing summary":
        return f'What is the concise business meaning or requirement behind "{title}"?'
    if reason == "Marked for review":
        return f'What decision is needed before "{title}" can be approved?'
    if reason == "Missing owner":
        return f'Who should own follow-up for "{title}"?'
    if reason == "Missing due date":
        return f'When should "{title}" be completed or reviewed?'
    if reason == "Missing priority":
        return f'What priority should "{title}" have for execution?'
    return f'What information is needed to finalize "{title}"?'


def _source_issues(node: dict[str, Any]) -> list[str]:
    refs = node.get("source_refs") if isinstance(node.get("source_refs"), list) else []
    first_ref = refs[0] if refs and isinstance(refs[0], dict) else {}
    issues = []
    if not first_ref.get("document_id"):
        issues.append("Missing source document")
        return issues
    if not first_ref.get("page") and not first_ref.get("section"):
        issues.append("Missing source location")
    if not first_ref.get("quote_snippet"):
        issues.append("Missing source quote")
    if not first_ref.get("confidence"):
        issues.append("Missing source confidence")
    return issues


def _nearest_source_ref(
    node: dict[str, Any],
    *,
    node_lookup: dict[str, dict[str, Any]],
    parent_by_child: dict[str, str],
    children_by_parent: dict[str, list[str]],
) -> dict[str, Any] | None:
    current_id = parent_by_child.get(node.get("id", ""))
    while current_id:
        candidate = node_lookup.get(current_id)
        source_ref = _first_completeish_source_ref(candidate)
        if source_ref:
            return _source_suggestion(candidate, source_ref, "ancestor")
        current_id = parent_by_child.get(current_id)

    for child_id in children_by_parent.get(node.get("id", ""), []):
        candidate = node_lookup.get(child_id)
        source_ref = _first_completeish_source_ref(candidate)
        if source_ref:
            return _source_suggestion(candidate, source_ref, "child")

    parent_id = parent_by_child.get(node.get("id", ""))
    for sibling_id in children_by_parent.get(parent_id, []):
        if sibling_id == node.get("id"):
            continue
        candidate = node_lookup.get(sibling_id)
        source_ref = _first_completeish_source_ref(candidate)
        if source_ref:
            return _source_suggestion(candidate, source_ref, "sibling")

    return None


def _first_completeish_source_ref(node: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(node, dict):
        return None
    refs = node.get("source_refs") if isinstance(node.get("source_refs"), list) else []
    first_ref = refs[0] if refs and isinstance(refs[0], dict) else {}
    if not first_ref.get("document_id"):
        return None
    return first_ref


def _source_suggestion(
    node: dict[str, Any] | None,
    source_ref: dict[str, Any],
    relationship: str,
) -> dict[str, Any]:
    return {
        "node_id": node.get("id", "") if isinstance(node, dict) else "",
        "title": node.get("title", "") if isinstance(node, dict) else "",
        "source_ref": source_ref,
        "relationship": relationship,
    }


def _scope_node_graph(graph: dict[str, Any], node_id: str) -> dict[str, Any]:
    scoped = deepcopy(graph)
    scoped["nodes"] = [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("id") == node_id
    ]
    scoped["edges"] = []
    scoped["tasks"] = [
        task
        for task in graph.get("tasks", [])
        if isinstance(task, dict) and task.get("node_id") == node_id
    ]
    return scoped


def _collect_source_refs(graph: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in graph.get("nodes", []) if isinstance(graph, dict) else []:
        if not isinstance(node, dict):
            continue
        for ref in _source_refs_for_preview(node):
            if not isinstance(ref, dict):
                continue
            key = json.dumps(ref, sort_keys=True)
            if key in seen:
                continue
            refs.append(deepcopy(ref))
            seen.add(key)
    return refs


def _deterministic_ai_action_drafts(
    graph: dict[str, Any],
    *,
    action_run: dict[str, Any],
    profile: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    source_node = _source_node_for_action(graph, action_run.get("source_node_id"))
    source_node_id = source_node.get("id") if source_node else action_run.get("source_node_id")
    source_title = source_node.get("title") if source_node else "workspace"
    source_refs = _collect_source_refs(graph)
    action = action_run["action"]
    role = action_run["role"]
    draft_nodes: list[dict[str, Any]] = []
    draft_edges: list[dict[str, Any]] = []
    draft_annotations: list[dict[str, Any]] = []
    assumptions = [] if source_refs else ["Generated action preview is not source-backed and requires review."]

    if action in {
        "expand_this_node",
        "generate_child_nodes",
        "generate_tasks",
        "convert_to_checklist",
        "generate_checklist",
        "generate_training_outline",
        "export_branch_as_sop_draft",
        "custom_prompt",
    }:
        for order, item in enumerate(
            _draft_plan_for_action(
                action=action,
                source_title=source_title,
                custom_prompt=action_run.get("custom_prompt"),
            ),
            start=1,
        ):
            draft_node = _draft_node(
                action_run=action_run,
                order=order,
                title=item["title"],
                summary=item["summary"],
                parent_id=source_node_id,
                node_type=item["node_type"],
                source_refs=source_refs[:1],
                profile=profile,
            )
            draft_nodes.append(draft_node)
            if source_node_id:
                draft_edges.append(
                    {
                        "id": f"draft_edge_{action_run['ai_action_id']}_{order}",
                        "source_node_id": source_node_id,
                        "target_node_id": draft_node["id"],
                        "relationship_type": "contains",
                        "metadata": {"source": "ai_action_preview", "ai_action_id": action_run["ai_action_id"]},
                    }
                )

    if action in {
        "ask_follow_up",
        "create_sme_questions",
        "suggest_follow_up_questions",
        "find_missing_source_support",
        "find_gaps",
        "find_unsupported_assumptions",
        "find_duplicate_overlapping_nodes",
        "interpret_table_data",
        "summarize_branch",
        "reorganize_branch",
        "split_branch_into_categories",
    }:
        draft_annotations.append(
            {
                "id": f"draft_annotation_{action_run['ai_action_id']}_1",
                "type": _annotation_type(action),
                "node_id": source_node_id,
                "title": _annotation_title(action, source_title),
                "body": _annotation_body(action, source_title, role, action_run.get("custom_prompt")),
                "source_refs": source_refs[:1],
                "assumptions": assumptions,
                "metadata": {"source": "ai_action_preview", "ai_action_id": action_run["ai_action_id"]},
            }
        )

    return draft_nodes, draft_edges, draft_annotations, source_refs, assumptions


def _source_node_for_action(graph: dict[str, Any], node_id: str | None) -> dict[str, Any] | None:
    nodes = [node for node in graph.get("nodes", []) if isinstance(node, dict)]
    if node_id:
        for node in nodes:
            if node.get("id") == node_id:
                return node
    return nodes[0] if nodes else None


def _draft_node(
    *,
    action_run: dict[str, Any],
    order: int,
    title: str,
    summary: str,
    parent_id: str | None,
    node_type: str,
    source_refs: list[dict[str, Any]],
    profile: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": f"draft_node_{action_run['ai_action_id']}_{order}",
        "title": title,
        "parent_id": parent_id,
        "summary": summary,
        "node_type": node_type,
        "status": "ai_generated",
        "priority": "medium" if node_type == "task" else "",
        "owner_id": "",
        "due_date": "",
        "confidence": source_refs[0].get("confidence") if source_refs else None,
        "source_refs": deepcopy(source_refs),
        "external_refs": {},
        "metadata": {
            "source": "ai_action_preview",
            "ai_action_id": action_run["ai_action_id"],
            "prompt_profile_id": profile["role_id"],
        },
    }


def _draft_plan_for_action(
    *,
    action: str,
    source_title: str,
    custom_prompt: str | None,
) -> list[dict[str, str]]:
    target = source_title or "workspace"
    prompt = (custom_prompt or "").strip()
    if action == "custom_prompt" and prompt:
        return [
            {
                "title": prompt[:80],
                "summary": f"Main draft branch for the instruction: {prompt[:180]}",
                "node_type": "concept",
            },
            {
                "title": "Supporting branches",
                "summary": "Add child branches that make the requested structure easier to edit and refine.",
                "node_type": "category",
            },
            {
                "title": "Review questions",
                "summary": "List follow-up questions or assumptions before accepting this draft into the graph.",
                "node_type": "question",
            },
        ]

    plans: dict[str, list[tuple[str, str, str]]] = {
        "expand_this_node": [
            ("Key details", f"Add the most important details that clarify {target}.", "concept"),
            ("Related considerations", f"Capture adjacent ideas, risks, or decisions connected to {target}.", "concept"),
        ],
        "generate_child_nodes": [
            ("Main branches", f"Create editable child branches under {target}.", "category"),
            ("Definitions and references", f"Separate definitions, references, or examples related to {target}.", "reference"),
            ("Open questions", f"Flag unresolved questions that need user or SME review for {target}.", "question"),
        ],
        "generate_tasks": [
            ("Prepare task breakdown", f"Turn {target} into accountable work items.", "task"),
            ("Assign review owner", "Identify who should validate or complete this work.", "task"),
            ("Confirm acceptance criteria", "Define what done means before the branch is accepted.", "task"),
        ],
        "convert_to_checklist": [
            ("Checklist setup", f"Convert {target} into a scannable checklist structure.", "task"),
            ("Verification step", "Add a check for evidence, owner, and completion status.", "task"),
            ("Exception handling", "Capture what to do when a checklist item cannot be verified.", "task"),
        ],
        "generate_checklist": [
            ("Checklist setup", f"Create checklist items for {target}.", "task"),
            ("Evidence check", "Confirm source support or mark the item for review.", "task"),
            ("Completion check", "Add a clear done/not-done review step.", "task"),
        ],
        "generate_training_outline": [
            ("Learning goals and audience", f"Define who the training is for and what {target} should teach.", "concept"),
            ("Module sequence", "Draft the section/module flow the learner should follow.", "workflow"),
            ("Practice and assessment", "Add exercises, checks for understanding, and review prompts.", "task"),
        ],
        "export_branch_as_sop_draft": [
            ("Purpose and scope", f"Describe when the SOP for {target} applies.", "concept"),
            ("Procedure steps", "Draft ordered steps, decisions, and handoffs.", "workflow"),
            ("Controls and evidence", "List review checkpoints, source evidence, and exception handling.", "requirement"),
        ],
    }
    return [
        {"title": f"{title} for {target}", "summary": summary, "node_type": node_type}
        for title, summary, node_type in plans.get(
            action,
            [("AI draft", f"Create a reviewable draft for {target}.", "concept")],
        )
    ]


def _annotation_type(action: str) -> str:
    if "question" in action or action == "ask_follow_up":
        return "sme_question"
    if "source" in action or "unsupported" in action:
        return "source_gap"
    if "duplicate" in action:
        return "overlap_review"
    if "table" in action:
        return "table_interpretation"
    return "ai_note"


def _annotation_title(action: str, source_title: str) -> str:
    labels = {
        "ask_follow_up": "Follow-up question",
        "create_sme_questions": "SME question",
        "suggest_follow_up_questions": "Suggested follow-up",
        "find_missing_source_support": "Missing source support",
        "find_gaps": "Gap finding",
        "find_unsupported_assumptions": "Unsupported assumption",
        "find_duplicate_overlapping_nodes": "Potential overlap",
        "interpret_table_data": "Table interpretation",
        "summarize_branch": "Branch summary",
        "reorganize_branch": "Branch reorganization note",
        "split_branch_into_categories": "Branch category split",
    }
    return f"{labels.get(action, 'AI note')} for {source_title}"


def _annotation_body(action: str, source_title: str, role: str, custom_prompt: str | None) -> str:
    if action == "custom_prompt" and custom_prompt:
        return custom_prompt.strip()
    if "question" in action or action == "ask_follow_up":
        return f"What decision or source evidence is needed to finalize {source_title}?"
    if "source" in action or "unsupported" in action:
        return f"{role} should verify source support before accepting generated content for {source_title}."
    if "duplicate" in action:
        return f"{role} should compare nearby nodes for overlapping meaning before merging or accepting changes."
    if "table" in action:
        return f"{role} should review table-derived claims and mark inferred conclusions for review."
    return f"{role} generated a preview note for {source_title}."


def _profile_id(role: str) -> str:
    return _token(str(role or "").lower()).replace("-", "_")


def _action_id(action: str) -> str:
    return _token(str(action or "").lower()).replace("-", "_")


def _validate_source_ref_list(value: Any, path: str, errors: list[str]) -> None:
    if not isinstance(value, list):
        errors.append(f"{path}: must be a list")
        return
    for index, source_ref in enumerate(value):
        _validate_source_ref(source_ref, f"{path}.{index}", errors)


def _validate_preview_item(item: Any, index: int, errors: list[str]) -> None:
    path = f"ai_helper_preview.preview_items.{index}"
    if not isinstance(item, dict):
        errors.append(f"{path}: must be an object")
        return

    for key in ("id", "preview_type", "node_id", "title", "rationale", "confidence"):
        _require_string(item, key, path, errors)

    source_refs = item.get("source_refs")
    if not isinstance(source_refs, list):
        errors.append(f"{path}.source_refs: must be a list")
    else:
        for source_index, source_ref in enumerate(source_refs):
            _validate_source_ref(
                source_ref,
                f"{path}.source_refs.{source_index}",
                errors,
            )

    assumptions = item.get("assumptions")
    if not isinstance(assumptions, list) or not all(
        isinstance(assumption, str) for assumption in assumptions
    ):
        errors.append(f"{path}.assumptions: must be a list of strings")

    proposed_mutation = item.get("proposed_mutation")
    if not isinstance(proposed_mutation, dict):
        errors.append(f"{path}.proposed_mutation: must be an object")


def _validate_scope(scope: dict[str, Any], errors: list[str]) -> None:
    scope_type = scope.get("type")
    if scope_type not in SCOPE_TYPES:
        errors.append(
            f"ai_helper_preview.scope.type: must be one of {', '.join(sorted(SCOPE_TYPES))}"
        )
        return
    if scope_type in {"branch", "node"} and not _has_text(scope.get("node_id")):
        errors.append(f"ai_helper_preview.scope.node_id: required for {scope_type} scope")
    if scope_type == "source" and not _has_text(scope.get("source_id")):
        errors.append("ai_helper_preview.scope.source_id: required for source scope")


def _validate_source_ref(source_ref: Any, path: str, errors: list[str]) -> None:
    if not isinstance(source_ref, dict):
        errors.append(f"{path}: must be an object")
        return
    _require_string(source_ref, "document_id", path, errors)

    page = source_ref.get("page")
    if page is not None and not isinstance(page, (int, str)):
        errors.append(f"{path}.page: must be a string, number, or null when provided")
    for key in ("section", "chunk_id", "quote_snippet"):
        value = source_ref.get(key)
        if value is not None and not isinstance(value, str):
            errors.append(f"{path}.{key}: must be a string when provided")
    confidence = source_ref.get("confidence")
    if confidence is not None and not isinstance(confidence, (int, float, str)):
        errors.append(f"{path}.confidence: must be a string or number when provided")


def _require_string(
    payload: dict[str, Any],
    key: str,
    path: str,
    errors: list[str],
) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}.{key}: must be a non-empty string")


def _has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _post_openai_json(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI helper preview failed: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI helper preview failed: {exc.reason}") from exc


def _extract_output_text(data: dict[str, Any]) -> str:
    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    parts = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    if parts:
        return "\n".join(parts)

    raise RuntimeError("OpenAI helper preview response did not include text output.")


def _strip_json_fence(value: str) -> str:
    stripped = value.strip()
    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped


def _token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value).strip())
    return token.strip("-") or "item"


def _utc_token() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
