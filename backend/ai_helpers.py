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
    ARTIFACT_REGISTRY,
    ARTIFACT_REGISTRY_CONTRACT,
    ARTIFACT_REGISTRY_VERSION,
    AIDRAFT_ACCEPT_MODES,
    AIDRAFT_SCOPE_TYPES,
    AI_DRAFT_SESSION_CONTRACT_VERSION,
    AI_DRAFT_OUTPUT_SHAPES,
    AI_DRAFT_REVISION_OUTPUT_SCHEMA,
    AI_HELPER_PREVIEW_CONTRACT,
    AI_HELPER_PREVIEW_CONTRACT_VERSION,
    SOFTWARE_INVENTORY_ENTITY_TYPES,
    json_object_response_format,
)
from ai.providers import DocMapAIProvider, DocMapGenerationRequest
from ai.responses_client import OpenAIResponsesDocMapProvider
from ai_model_policy import choose_openai_model, normalize_model_policy
from config import MissingConfigurationError, get_setting
from graph.ai_contract import validate_knowledge_graph_relationship_edge
from graph.software_overlap_scoring import enrich_software_overlap_report
from graph.schemas import GraphSchemaError
from graph.validation import validate_and_repair_graph


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
    "assess_standards_completeness",
    "interpret_table_data",
    "generate_tasks",
    "custom_prompt",
}
BRANCH_AI_ACTIONS = {
    "summarize_branch",
    "reorganize_branch",
    "split_branch_into_categories",
    "assess_standards_completeness",
    "create_team_roadmap",
    "find_process_bottlenecks",
    "find_duplicate_tools",
    "find_ownership_gaps",
    "find_unsupported_business_critical_systems",
    "generate_tasks",
    "generate_checklist",
    "create_30_60_90_day_improvement_plan",
    "create_stakeholder_review_package",
    "generate_training_outline",
    "export_branch_as_sop_draft",
    "find_gaps",
    "create_sme_questions",
    "custom_prompt",
}
WORKSPACE_AI_ACTIONS = {
    "suggest_follow_up_questions",
    "find_missing_source_support",
    "find_unsupported_assumptions",
    "find_duplicate_overlapping_nodes",
    "assess_standards_completeness",
    "create_team_roadmap",
    "find_process_bottlenecks",
    "find_duplicate_tools",
    "find_ownership_gaps",
    "find_unsupported_business_critical_systems",
    "create_30_60_90_day_improvement_plan",
    "create_stakeholder_review_package",
    "create_sme_questions",
    "generate_tasks",
    "generate_checklist",
    "interpret_table_data",
    "generate_training_outline",
    "export_branch_as_sop_draft",
    "custom_prompt",
}
AI_ACTIONS_BY_SCOPE = {
    "node": NODE_AI_ACTIONS,
    "branch": BRANCH_AI_ACTIONS,
    "workspace": WORKSPACE_AI_ACTIONS,
}
AI_DRAFT_SOURCE_CONTEXT_MAX_CHUNKS = 12
AI_DRAFT_SOURCE_CONTEXT_MAX_REFS = 36


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


def generate_source_reconciliation_preview(
    graph: dict[str, Any],
    *,
    source_id: str,
    scope: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_scope = normalize_helper_scope(
        scope or {"type": "source", "source_id": source_id}
    )
    document = _source_library_document(graph, source_id)
    if not document:
        raise GraphSchemaError([f"source_reconciliation.source_id: source '{source_id}' not found"])

    source_refs_by_node = _source_reconciliation_refs_by_node(graph, document)
    items: list[dict[str, Any]] = []
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        existing_refs = _node_source_refs(node)
        has_selected_source = any(
            str(ref.get("document_id") or "") == str(source_id)
            for ref in existing_refs
            if isinstance(ref, dict)
        )
        suggested_ref = source_refs_by_node.get(node_id)
        if has_selected_source and not _source_issues(node):
            continue
        if not suggested_ref:
            continue
        issues = _source_issues(node)
        if not issues:
            issues = ["Selected source may strengthen this node"]
        items.append(
            {
                "id": f"source_reconcile_{_token(source_id)}_{_token(node_id)}",
                "preview_type": "source_repair",
                "node_id": node_id,
                "title": f"Reconcile source support for {node.get('title') or node_id}",
                "rationale": (
                    "Selected source contains overlapping language for this graph node. "
                    "Review before applying the citation."
                ),
                "confidence": suggested_ref.get("confidence") or "medium",
                "source_refs": [suggested_ref],
                "assumptions": [],
                "proposed_mutation": {
                    "source_refs": [suggested_ref],
                    "source_ref_repair": {
                        "repair_type": "reconcile_uploaded_source",
                        "issues": issues,
                        "source_id": str(source_id),
                        "suggested_from_node_id": "",
                        "suggested_from_title": document.get("filename")
                        or document.get("title")
                        or str(source_id),
                        "suggestion_relationship": "source_overlap",
                    },
                },
            }
        )

    matched_node_ids = set(source_refs_by_node)
    matched_chunk_ids = {
        str(source_ref.get("chunk_id") or "")
        for source_ref in source_refs_by_node.values()
        if isinstance(source_ref, dict) and source_ref.get("chunk_id")
    }
    uncited_chunks = [
        chunk
        for chunk in document.get("chunks", [])
        if isinstance(chunk, dict) and int(chunk.get("cited_by_count") or 0) == 0
        and str(chunk.get("id") or chunk.get("chunk_id") or "") not in matched_chunk_ids
    ]
    source_only_chunks = [
        {
            "source_id": str(source_id),
            "chunk_id": str(chunk.get("id") or chunk.get("chunk_id") or ""),
            "page": chunk.get("page"),
            "section": chunk.get("heading") or chunk.get("section") or "",
            "snippet": str(chunk.get("snippet") or chunk.get("text") or "")[:360],
        }
        for chunk in uncited_chunks[:8]
        if isinstance(chunk, dict)
    ]
    warnings = []
    if source_only_chunks:
        warnings.append(
            f"{len(source_only_chunks)} source chunk(s) are not cited by accepted graph nodes yet. Use supplement, replace branch, or keep both as comparison after review."
        )

    return build_helper_preview(
        helper_id="source_librarian",
        action="source_repair",
        scope=normalized_scope,
        generated_by="deterministic_reconciliation",
        preview_items=items,
        warnings=warnings,
        metadata={
            "source_id": str(source_id),
            "source_title": document.get("filename") or document.get("title") or str(source_id),
            "matched_node_count": len(matched_node_ids),
            "source_only_chunk_count": len(uncited_chunks),
            "source_only_chunks": source_only_chunks,
            "recommended_modes": [
                "supplement_graph",
                "update_matching_nodes",
                "replace_branch",
                "keep_both_for_comparison",
            ],
        },
    )


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


def normalize_ai_draft_scope(scope: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(scope, dict):
        return {"type": "workspace"}

    scope_type = scope.get("type") or "workspace"
    if scope_type not in AIDRAFT_SCOPE_TYPES:
        return {"type": "workspace"}

    normalized: dict[str, Any] = {"type": scope_type}
    for key in ("node_id", "source_id"):
        value = scope.get(key)
        if isinstance(value, str) and value.strip():
            normalized[key] = value.strip()
    if scope_type == "nodes":
        node_ids = scope.get("node_ids")
        normalized["node_ids"] = [
            node_id.strip()
            for node_id in node_ids
            if isinstance(node_id, str) and node_id.strip()
        ] if isinstance(node_ids, list) else []
    return normalized


def build_ai_draft_session(
    *,
    workspace_id: str,
    prompt: str,
    scope: dict[str, Any] | None = None,
    role: str = "",
    intent: str = "",
    draft_nodes: list[dict[str, Any]] | None = None,
    draft_edges: list[dict[str, Any]] | None = None,
    draft_items: list[dict[str, Any]] | None = None,
    draft_annotations: list[dict[str, Any]] | None = None,
    generated_artifacts: list[dict[str, Any]] | None = None,
    model_policy: dict[str, Any] | str | None = None,
    selected_model: str = "",
    model_reason: str = "",
    source_refs: list[dict[str, Any]] | None = None,
    revisions: list[dict[str, Any]] | None = None,
    ai_action_run: dict[str, Any] | None = None,
    created_by: str = "user",
    session_id: str | None = None,
    revision_id: str | None = None,
    created_at: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    created_at = created_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    normalized_model_policy = (
        model_policy
        if isinstance(model_policy, dict)
        else {"policy": str(model_policy or "balanced")}
    )
    session = {
        "session_id": session_id or f"ai_draft_session_{_utc_token()}",
        "workspace_id": str(workspace_id or ""),
        "scope": normalize_ai_draft_scope(scope),
        "role": str(role or ""),
        "intent": str(intent or ""),
        "prompt_history": [
            {
                "prompt": str(prompt or ""),
                "content": str(prompt or ""),
                "role": "user",
                "created_at": created_at,
                "created_by": created_by or "user",
            }
        ] if _has_text(prompt) else [],
        "model_policy": normalized_model_policy,
        "selected_model": str(selected_model or ""),
        "model_reason": str(model_reason or ""),
        "revisions": revisions or [],
        "source_refs": source_refs or [],
        "validation_reports": [],
        "accept_history": [],
        "status": "drafting",
        "ai_action_run": ai_action_run,
        "created_at": created_at,
        "updated_at": created_at,
        "created_by": created_by or "user",
        "metadata": {
            **(metadata or {}),
            "canonical": False,
        },
    }
    if revisions is None and (
        draft_nodes is not None
        or draft_edges is not None
        or draft_items is not None
        or draft_annotations is not None
    ):
        revision = build_ai_draft_revision(
            session=session,
            prompt=prompt,
            draft_nodes=draft_nodes or [],
            draft_edges=draft_edges or [],
            draft_annotations=draft_annotations or [],
            draft_items=draft_items,
            generated_artifacts=generated_artifacts or [],
            model=selected_model,
            revision_id=revision_id,
            created_at=created_at,
        )
        session["revisions"] = [revision]
        session["validation_reports"] = [revision["validation_report"]]
        session["source_refs"] = source_refs or _source_refs_from_revision(revision)
    return validate_ai_draft_session(session)


def build_ai_draft_revision(
    *,
    session: dict[str, Any],
    prompt: str,
    draft_nodes: list[dict[str, Any]] | None = None,
    draft_edges: list[dict[str, Any]] | None = None,
    draft_annotations: list[dict[str, Any]] | None = None,
    draft_items: list[dict[str, Any]] | None = None,
    generated_artifacts: list[dict[str, Any]] | None = None,
    model: str = "",
    validation_report: dict[str, Any] | None = None,
    preview_diff: dict[str, Any] | None = None,
    revision_id: str | None = None,
    created_at: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    nodes = deepcopy(draft_nodes or [])
    edges = deepcopy(draft_edges or [])
    annotations = deepcopy(draft_annotations or [])
    artifacts = validate_generated_artifacts(
        generated_artifacts or [],
        scope=session.get("scope", {}),
        model_provider="",
        model=model,
        ai_role=session.get("role", ""),
        prompt_profile=session.get("metadata", {}).get("prompt_profile", "") if isinstance(session.get("metadata"), dict) else "",
        input_source_refs=session.get("source_refs", []),
    )
    report = validation_report or validate_ai_action_drafts_for_accept(nodes, edges, artifacts)
    revision = {
        "revision_id": revision_id or f"ai_draft_revision_{_utc_token()}_{len(session.get('revisions', [])) + 1}",
        "session_id": session.get("session_id", ""),
        "prompt": str(prompt or ""),
        "draft_items": draft_items if draft_items is not None else _draft_items_from_revision_parts(nodes, edges, annotations, artifacts),
        "draft_nodes": nodes,
        "draft_edges": edges,
        "draft_annotations": annotations,
        "generated_artifacts": artifacts,
        "preview_diff": preview_diff or build_ai_draft_preview_diff(nodes, edges, annotations, report, [], artifacts),
        "validation_report": report,
        "created_at": created_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "model": str(model or ""),
        "metadata": {
            **(metadata or {}),
            "canonical": False,
            "ai_draft_session_contract_version": AI_DRAFT_SESSION_CONTRACT_VERSION,
        },
    }
    return validate_ai_draft_revision(revision)


def append_ai_draft_revision(
    session: dict[str, Any],
    revision: dict[str, Any],
    *,
    prompt: str | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    updated = validate_ai_draft_session(session)
    normalized_revision = validate_ai_draft_revision(revision)
    updated["revisions"].append(normalized_revision)
    if _has_text(prompt):
        updated["prompt_history"].append(
            {
                "prompt": str(prompt).strip(),
                "content": str(prompt).strip(),
                "created_at": normalized_revision["created_at"],
                "created_by": created_by or "user",
                "revision_id": normalized_revision["revision_id"],
            }
        )
    updated["validation_reports"].append(normalized_revision["validation_report"])
    updated["updated_at"] = normalized_revision["created_at"]
    return validate_ai_draft_session(updated)


def revise_ai_draft_session(
    session: dict[str, Any],
    *,
    prompt: str,
    draft_nodes: list[dict[str, Any]] | None = None,
    draft_edges: list[dict[str, Any]] | None = None,
    draft_items: list[dict[str, Any]] | None = None,
    draft_annotations: list[dict[str, Any]] | None = None,
    model: str = "",
    created_at: str | None = None,
) -> dict[str, Any]:
    normalized_session = validate_ai_draft_session(session)
    revision = build_ai_draft_revision(
        session=normalized_session,
        prompt=prompt,
        draft_nodes=draft_nodes or [],
        draft_edges=draft_edges or [],
        draft_annotations=draft_annotations or [],
        draft_items=draft_items,
        generated_artifacts=generated_artifacts or [],
        model=model or normalized_session.get("selected_model", ""),
        created_at=created_at,
    )
    updated = append_ai_draft_revision(
        normalized_session,
        revision,
        prompt=prompt,
        created_by=normalized_session.get("created_by", "user"),
    )
    if updated.get("prompt_history"):
        updated["prompt_history"][-1]["content"] = str(prompt or "")
        updated["prompt_history"][-1]["role"] = "user"
    updated["source_refs"] = _merge_source_refs(
        updated.get("source_refs", []),
        _source_refs_from_revision(revision),
    )
    return validate_ai_draft_session(updated)


def latest_ai_draft_revision(session: dict[str, Any], revision_id: str | None = None) -> dict[str, Any]:
    revisions = session.get("revisions", []) if isinstance(session, dict) else []
    if revision_id:
        for revision in revisions:
            if isinstance(revision, dict) and revision.get("revision_id") == revision_id:
                return validate_ai_draft_revision(revision)
        raise GraphSchemaError([f"ai_draft_session.revision_id: unknown revision '{revision_id}'"])
    if not revisions:
        raise GraphSchemaError(["ai_draft_session.revisions: at least one revision is required"])
    return validate_ai_draft_revision(revisions[-1])


def build_ai_draft_preview_diff(
    draft_nodes: list[dict[str, Any]] | dict[str, Any],
    draft_edges: list[dict[str, Any]] | None = None,
    draft_annotations: list[dict[str, Any]] | None = None,
    validation_report: dict[str, Any] | None = None,
    accepted_item_ids: list[str] | None = None,
    generated_artifacts: list[dict[str, Any]] | None = None,
    *,
    mode: str = "append",
    selected_item_ids: list[str] | None = None,
) -> dict[str, Any]:
    if isinstance(draft_nodes, dict):
        session = draft_nodes
        revision = latest_ai_draft_revision(session)
        selected_ids = {
            item_id
            for item_id in (selected_item_ids or [])
            if isinstance(item_id, str) and item_id.strip()
        }
        selected_nodes = _selected_draft_nodes(revision, mode, selected_ids)
        selected_edges = _selected_draft_edges(revision, selected_nodes, mode)
        selected_annotations = deepcopy(revision.get("draft_annotations", [])) if mode == "notes_only" else []
        report = validate_ai_action_drafts_for_accept(
            deepcopy(selected_nodes),
            deepcopy(selected_edges),
            revision.get("generated_artifacts", []),
        )
        ids = _accepted_item_ids(revision, selected_nodes, selected_edges, selected_annotations, selected_ids)
        return _draft_preview_diff_payload(
            selected_nodes,
            selected_edges,
            selected_annotations,
            report,
            ids,
            revision.get("generated_artifacts", []),
        )

    draft_edges = draft_edges or []
    draft_annotations = draft_annotations or []
    validation_report = validation_report or {}
    accepted_item_ids = accepted_item_ids or []
    return _draft_preview_diff_payload(
        draft_nodes,
        draft_edges,
        draft_annotations,
        validation_report,
        accepted_item_ids,
        generated_artifacts or [],
    )


def _draft_preview_diff_payload(
    draft_nodes: list[dict[str, Any]],
    draft_edges: list[dict[str, Any]],
    draft_annotations: list[dict[str, Any]],
    validation_report: dict[str, Any],
    accepted_item_ids: list[str],
    generated_artifacts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    added_node_ids = [node.get("id", "") for node in draft_nodes if isinstance(node, dict)]
    added_edge_ids = [edge.get("id", "") for edge in draft_edges if isinstance(edge, dict)]
    updated_node_ids: list[str] = []
    needs_review_repairs = [
        issue
        for issue in validation_report.get("issues", [])
        if isinstance(issue, dict) and issue.get("code") in {"missing_source_ref", "uncited_ai_node"}
    ] if isinstance(validation_report, dict) else []
    return {
        "added_nodes": len(added_node_ids),
        "added_edges": len(added_edge_ids),
        "added_artifacts": len([artifact for artifact in generated_artifacts or [] if isinstance(artifact, dict)]),
        "relationship_edges": len(
            [
                edge
                for edge in draft_edges
                if isinstance(edge, dict)
                and str(edge.get("relationship_type") or "contains") != "contains"
            ]
        )
        or sum(
            len(artifact.get("data", {}).get("relationship_edges", []))
            for artifact in generated_artifacts or []
            if isinstance(artifact, dict) and isinstance(artifact.get("data"), dict)
        ),
        "updated_nodes": len(updated_node_ids),
        "review_outputs": len([item for item in draft_annotations if isinstance(item, dict)]),
        "needs_review_repairs": len(needs_review_repairs),
        "added_node_ids": added_node_ids,
        "added_edge_ids": added_edge_ids,
        "updated_node_ids": updated_node_ids,
        "review_output_ids": [item.get("id", "") for item in draft_annotations if isinstance(item, dict)],
        "artifact_ids": [artifact.get("id", "") for artifact in generated_artifacts or [] if isinstance(artifact, dict)],
        "needs_review_repair_issues": needs_review_repairs,
        "accepted_item_ids": accepted_item_ids,
        "summary": _preview_diff_summary(
            added_nodes=len(added_node_ids),
            added_edges=len(added_edge_ids),
            updated_nodes=len(updated_node_ids),
            needs_review_repairs=len(needs_review_repairs),
        ),
    }


def accept_ai_draft_revision(
    graph: dict[str, Any],
    session: dict[str, Any],
    *,
    revision_id: str | None = None,
    accept_mode: str = "append",
    selected_item_ids: list[str] | None = None,
    accepted_by: str = "user",
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if accept_mode not in AIDRAFT_ACCEPT_MODES:
        raise GraphSchemaError([f"ai_draft_accept.mode: unsupported mode '{accept_mode}'"])

    original_graph = deepcopy(graph)
    revision = latest_ai_draft_revision(session, revision_id)
    selected_ids = {
        item_id
        for item_id in (selected_item_ids or [])
        if isinstance(item_id, str) and item_id.strip()
    }
    candidate_graph = deepcopy(graph)
    candidate_graph.setdefault("workspace", {})
    candidate_graph.setdefault("nodes", [])
    candidate_graph.setdefault("edges", [])
    candidate_graph.setdefault("tasks", [])

    accepted_nodes, accepted_edges, review_outputs, patch_operations = _build_ai_draft_graph_patch(
        candidate_graph,
        session,
        revision,
        accept_mode=accept_mode,
        selected_ids=selected_ids,
        accepted_by=accepted_by,
    )

    if accept_mode != "notes_only":
        candidate_graph["nodes"] = candidate_graph.get("nodes", []) + accepted_nodes
        candidate_graph["edges"] = candidate_graph.get("edges", []) + accepted_edges
    if review_outputs or accept_mode == "notes_only":
        _attach_ai_draft_revision_notes(
            candidate_graph,
            session,
            revision,
            review_outputs=review_outputs,
            accepted_by=accepted_by,
            patch_operations=patch_operations,
        )

    repaired_graph = validate_and_repair_graph(candidate_graph)
    accepted_item_ids = _accepted_item_ids(revision, accepted_nodes, accepted_edges, review_outputs, selected_ids)
    preview_diff = build_ai_draft_preview_diff(
        accepted_nodes,
        accepted_edges,
        review_outputs,
        repaired_graph.get("validation_report", {}),
        accepted_item_ids,
        revision.get("generated_artifacts", []),
    )
    accepted_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    result = {
        "accept_id": f"ai_draft_accept_{_utc_token()}",
        "session_id": session.get("session_id", ""),
        "revision_id": revision.get("revision_id", ""),
        "workspace_id": session.get("workspace_id", ""),
        "mode": accept_mode,
        "accepted_item_ids": accepted_item_ids,
        "accepted_node_ids": [node.get("id", "") for node in accepted_nodes],
        "accepted_edge_ids": [edge.get("id", "") for edge in accepted_edges],
        "review_outputs": review_outputs,
        "accepted_artifacts": deepcopy(revision.get("generated_artifacts", [])),
        "preview_diff": preview_diff,
        "patch_operations": patch_operations,
        "validation_report": repaired_graph.get("validation_report", {}),
        "graph_revision_id": f"graph_revision_{_utc_token()}",
        "undo": {
            "kind": "full_graph_snapshot",
            "before_graph": original_graph,
        },
        "accepted_at": accepted_at,
        "accepted_by": accepted_by or "user",
        "metadata": {
            "ai_draft_session_contract_version": AI_DRAFT_SESSION_CONTRACT_VERSION,
        },
    }
    updated_session = validate_ai_draft_session(session)
    updated_session["status"] = "accepted"
    updated_session["updated_at"] = accepted_at
    updated_session["accept_history"].append(result)
    if isinstance(updated_session.get("ai_action_run"), dict):
        updated_session["ai_action_run"]["status"] = "accepted"
        updated_session["ai_action_run"]["generated_node_ids"] = result["accepted_node_ids"]
    return repaired_graph, validate_ai_draft_session(updated_session), result


def accept_ai_draft_session(
    graph: dict[str, Any],
    session: dict[str, Any],
    *,
    mode: str = "append",
    selected_item_ids: list[str] | None = None,
    accepted_by: str = "user",
    accepted_at: str | None = None,
) -> dict[str, Any]:
    accepted_graph, accepted_session, accept_result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode=mode,
        selected_item_ids=selected_item_ids,
        accepted_by=accepted_by,
    )
    if accepted_at:
        accept_result["accepted_at"] = accepted_at
        if accepted_session.get("accept_history"):
            accepted_session["accept_history"][-1]["accepted_at"] = accepted_at
    return {
        "graph": accepted_graph,
        "session": accepted_session,
        "accept_result": {
            **accept_result,
            "canonical_graph_mutated": mode != "notes_only",
        },
    }


def discard_ai_draft_session(
    session: dict[str, Any],
    *,
    discarded_by: str = "user",
) -> dict[str, Any]:
    updated = validate_ai_draft_session(session)
    discarded_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated["status"] = "discarded"
    updated["updated_at"] = discarded_at
    updated.setdefault("metadata", {})["discarded_by"] = discarded_by or "user"
    updated["metadata"]["discarded_at"] = discarded_at
    if isinstance(updated.get("ai_action_run"), dict):
        updated["ai_action_run"]["status"] = "rejected"
    return validate_ai_draft_session(updated)


def validate_ai_draft_session(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_draft_session: must be an object"])

    normalized = deepcopy(payload)
    for key in ("session_id", "workspace_id", "status"):
        _require_string(normalized, key, "ai_draft_session", errors)
    scope = normalized.get("scope")
    if not isinstance(scope, dict):
        errors.append("ai_draft_session.scope: must be an object")
    else:
        normalized["scope"] = normalize_ai_draft_scope(scope)
        _validate_ai_draft_scope(normalized["scope"], errors)

    for key in ("prompt_history", "revisions", "source_refs", "validation_reports", "accept_history"):
        if not isinstance(normalized.get(key, []), list):
            errors.append(f"ai_draft_session.{key}: must be a list")
            normalized[key] = []
    if normalized.get("status") not in {"draft", "drafting", "accepted", "discarded"}:
        errors.append("ai_draft_session.status: must be draft, drafting, accepted, or discarded")
    if normalized.get("model_policy") is not None and not isinstance(normalized.get("model_policy"), dict):
        errors.append("ai_draft_session.model_policy: must be an object")
    if normalized.get("metadata") is not None and not isinstance(normalized.get("metadata"), dict):
        errors.append("ai_draft_session.metadata: must be an object")
    for index, revision in enumerate(normalized.get("revisions", [])):
        try:
            normalized["revisions"][index] = validate_ai_draft_revision(revision)
        except GraphSchemaError as exc:
            errors.extend(exc.errors)
    if isinstance(normalized.get("ai_action_run"), dict):
        try:
            normalized["ai_action_run"] = validate_ai_action_run(normalized["ai_action_run"])
        except GraphSchemaError as exc:
            errors.extend(exc.errors)

    if errors:
        raise GraphSchemaError(errors)

    normalized.setdefault("role", "")
    normalized.setdefault("intent", "")
    normalized.setdefault("model_policy", {})
    normalized.setdefault("selected_model", "")
    normalized.setdefault("model_reason", "")
    normalized.setdefault("created_at", "")
    normalized.setdefault("updated_at", "")
    normalized.setdefault("created_by", "user")
    metadata = normalized.get("metadata") if isinstance(normalized.get("metadata"), dict) else {}
    metadata["ai_draft_session_contract_version"] = AI_DRAFT_SESSION_CONTRACT_VERSION
    metadata["canonical"] = False
    normalized["metadata"] = metadata
    return normalized


def validate_ai_draft_revision(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_draft_revision: must be an object"])

    normalized = deepcopy(payload)
    for key in ("revision_id", "session_id", "created_at"):
        _require_string(normalized, key, "ai_draft_revision", errors)
    for key in ("draft_items", "draft_nodes", "draft_edges", "draft_annotations", "generated_artifacts"):
        if not isinstance(normalized.get(key, []), list):
            errors.append(f"ai_draft_revision.{key}: must be a list")
            normalized[key] = []
    if not isinstance(normalized.get("preview_diff", {}), dict):
        errors.append("ai_draft_revision.preview_diff: must be an object")
    if not isinstance(normalized.get("validation_report", {}), dict):
        errors.append("ai_draft_revision.validation_report: must be an object")
    if not isinstance(normalized.get("metadata", {}), dict):
        errors.append("ai_draft_revision.metadata: must be an object")

    if errors:
        raise GraphSchemaError(errors)

    normalized.setdefault("prompt", "")
    normalized.setdefault("model", "")
    normalized.setdefault("preview_diff", {})
    normalized.setdefault("validation_report", {})
    normalized["generated_artifacts"] = validate_generated_artifacts(
        normalized.get("generated_artifacts", []),
        scope={},
        model_provider="",
        model=normalized.get("model", ""),
        ai_role="",
        prompt_profile="",
        input_source_refs=[],
    )
    normalized.setdefault("metadata", {})
    normalized["metadata"]["ai_draft_session_contract_version"] = AI_DRAFT_SESSION_CONTRACT_VERSION
    normalized["metadata"]["canonical"] = False
    return normalized


def _draft_items_from_revision_parts(
    draft_nodes: list[dict[str, Any]],
    draft_edges: list[dict[str, Any]],
    draft_annotations: list[dict[str, Any]],
    generated_artifacts: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for node in draft_nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id", ""))
        items.append(
            {
                "id": f"item_{node_id}",
                "item_type": "node",
                "title": str(node.get("title") or node_id or "Draft node"),
                "content": str(node.get("summary") or ""),
                "source_refs": deepcopy(node.get("source_refs", [])) if isinstance(node.get("source_refs"), list) else [],
                "assumptions": [],
                "status": "draft",
                "selected": True,
                "metadata": {"node_id": node_id},
            }
        )
    for edge in draft_edges:
        if not isinstance(edge, dict):
            continue
        edge_id = str(edge.get("id", ""))
        items.append(
            {
                "id": f"item_{edge_id}",
                "item_type": "edge",
                "title": edge_id or "Draft edge",
                "content": str(edge.get("relationship_type") or "contains"),
                "source_refs": [],
                "assumptions": [],
                "status": "draft",
                "selected": True,
                "metadata": {"edge_id": edge_id},
            }
        )
    for annotation in draft_annotations:
        if not isinstance(annotation, dict):
            continue
        annotation_id = str(annotation.get("id", ""))
        items.append(
            {
                "id": f"item_{annotation_id}",
                "item_type": "annotation",
                "title": str(annotation.get("title") or annotation_id or "Draft note"),
                "content": str(annotation.get("content") or annotation.get("summary") or ""),
                "source_refs": deepcopy(annotation.get("source_refs", [])) if isinstance(annotation.get("source_refs"), list) else [],
                "assumptions": deepcopy(annotation.get("assumptions", [])) if isinstance(annotation.get("assumptions"), list) else [],
                "status": "draft",
                "selected": True,
                "metadata": {"annotation_id": annotation_id},
            }
        )
    for artifact in generated_artifacts or []:
        if not isinstance(artifact, dict):
            continue
        artifact_id = str(artifact.get("id", ""))
        artifact_type = str(artifact.get("artifact_type") or "artifact")
        relationship_items = _relationship_draft_items_from_artifact(artifact)
        if relationship_items:
            items.extend(relationship_items)
            continue
        items.append(
            {
                "id": f"item_{artifact_id}",
                "item_type": "artifact",
                "title": str(artifact.get("title") or artifact_type),
                "content": str(artifact.get("summary") or artifact.get("description") or ""),
                "source_refs": deepcopy(artifact.get("source_refs", [])) if isinstance(artifact.get("source_refs"), list) else [],
                "assumptions": deepcopy(artifact.get("assumptions", [])) if isinstance(artifact.get("assumptions"), list) else [],
                "status": artifact.get("status") or "draft",
                "selected": True,
                "metadata": {"artifact_id": artifact_id, "artifact_type": artifact_type},
            }
        )
    return items


def _relationship_edge_accept_id(
    artifact: dict[str, Any],
    relationship: dict[str, Any],
    index: int,
) -> str:
    artifact_type = str(artifact.get("artifact_type") or "knowledge_graph")
    artifact_id = str(artifact.get("id") or artifact_type or "knowledge_graph")
    source = str(relationship.get("source_node_id") or "")
    target = str(relationship.get("target_node_id") or "")
    relationship_type = str(relationship.get("relationship_type") or "related_to")
    safe_type = relationship_type.replace(" ", "_")
    return str(
        relationship.get("id")
        or relationship.get("edge_id")
        or f"{artifact_id}_relationship_{index}_{source}_{target}_{safe_type}"
    )


def _relationship_draft_items_from_artifact(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    artifact_type = str(artifact.get("artifact_type") or "")
    if artifact_type not in {"knowledge_graph", "software_overlap_report"}:
        return []
    data = artifact.get("data") if isinstance(artifact.get("data"), dict) else {}
    relationship_edges = data.get("relationship_edges", [])
    if not isinstance(relationship_edges, list):
        return []
    artifact_id = str(artifact.get("id") or artifact_type or "knowledge_graph")
    items: list[dict[str, Any]] = []
    for index, relationship in enumerate(relationship_edges, start=1):
        if not isinstance(relationship, dict):
            continue
        source = str(relationship.get("source_node_id") or "")
        target = str(relationship.get("target_node_id") or "")
        relationship_type = str(relationship.get("relationship_type") or "related_to")
        if not source or not target:
            continue
        edge_id = _relationship_edge_accept_id(artifact, relationship, index)
        confidence = relationship.get("confidence", "")
        rationale = str(relationship.get("rationale") or relationship.get("source_signal") or "")
        title = str(
            relationship.get("title")
            or f"{source} {relationship_type.replace('_', ' ')} {target}"
        )
        items.append(
            {
                "id": f"item_{edge_id}",
                "item_type": "relationship",
                "title": title,
                "content": rationale,
                "source_refs": deepcopy(relationship.get("source_refs", []))
                if isinstance(relationship.get("source_refs"), list)
                else [],
                "assumptions": deepcopy(relationship.get("assumptions", []))
                if isinstance(relationship.get("assumptions"), list)
                else [],
                "confidence": confidence,
                "status": relationship.get("review_state") or artifact.get("status") or "needs_review",
                "selected": True,
                "metadata": {
                    "artifact_id": artifact_id,
                    "artifact_type": artifact_type,
                    "relationship_edge_id": edge_id,
                    "edge_id": edge_id,
                    "source_node_id": source,
                    "target_node_id": target,
                    "relationship_type": relationship_type,
                    "source_signal": relationship.get("source_signal", ""),
                    "rationale": rationale,
                },
            }
        )
    return items


def _selected_draft_nodes(
    revision: dict[str, Any],
    accept_mode: str,
    selected_ids: set[str],
) -> list[dict[str, Any]]:
    if accept_mode == "notes_only":
        return []
    nodes = deepcopy(revision.get("draft_nodes", []))
    if accept_mode == "selected" and not selected_ids:
        return []
    if accept_mode == "cited_only":
        nodes = [node for node in nodes if isinstance(node, dict) and node.get("source_refs")]
    if accept_mode == "selected" and selected_ids:
        item_node_ids = _selected_metadata_ids(revision, selected_ids, "node_id")
        nodes = [
            node
            for node in nodes
            if isinstance(node, dict)
            and (node.get("id") in selected_ids or node.get("id") in item_node_ids)
        ]
    return [node for node in nodes if isinstance(node, dict)]


def _selected_draft_edges(
    revision: dict[str, Any],
    accepted_nodes: list[dict[str, Any]],
    accept_mode: str,
) -> list[dict[str, Any]]:
    if accept_mode == "notes_only":
        return []
    accepted_node_ids = {node.get("id") for node in accepted_nodes}
    edges = []
    for edge in deepcopy(revision.get("draft_edges", [])):
        if not isinstance(edge, dict):
            continue
        target = edge.get("target_node_id")
        source = edge.get("source_node_id")
        if target in accepted_node_ids and (source in accepted_node_ids or source):
            edges.append(edge)
    return edges


def _selected_generated_artifacts(
    revision: dict[str, Any],
    accept_mode: str,
    selected_ids: set[str],
) -> list[dict[str, Any]]:
    if accept_mode == "notes_only":
        return []
    artifacts = [
        deepcopy(artifact)
        for artifact in revision.get("generated_artifacts", [])
        if isinstance(artifact, dict)
    ]
    if accept_mode != "selected" or not selected_ids:
        return artifacts

    artifact_ids = _selected_metadata_ids(revision, selected_ids, "artifact_id")
    relationship_edge_ids = _selected_metadata_ids(revision, selected_ids, "relationship_edge_id")
    selected_artifacts: list[dict[str, Any]] = []
    for artifact in artifacts:
        artifact_type = artifact.get("artifact_type")
        artifact_id = str(artifact.get("id") or "")
        if artifact_type not in {"knowledge_graph", "software_overlap_report"}:
            if artifact.get("id") in selected_ids or artifact.get("id") in artifact_ids:
                selected_artifacts.append(artifact)
            continue
        whole_artifact_selected = artifact.get("id") in selected_ids or f"item_{artifact_id}" in selected_ids
        if whole_artifact_selected and not relationship_edge_ids:
            selected_artifacts.append(artifact)
            continue
        data = artifact.get("data") if isinstance(artifact.get("data"), dict) else {}
        relationship_edges = data.get("relationship_edges", [])
        if not isinstance(relationship_edges, list):
            continue
        filtered_edges = [
            relationship
            for index, relationship in enumerate(relationship_edges, start=1)
            if isinstance(relationship, dict)
            and _relationship_edge_accept_id(artifact, relationship, index) in relationship_edge_ids
        ]
        if filtered_edges:
            filtered_artifact = deepcopy(artifact)
            filtered_artifact.setdefault("data", {})
            filtered_artifact["data"]["relationship_edges"] = filtered_edges
            selected_artifacts.append(filtered_artifact)
    return selected_artifacts


def _knowledge_graph_artifact_edges_for_accept(
    artifacts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for artifact in artifacts:
        artifact_type = artifact.get("artifact_type")
        if artifact_type not in {"knowledge_graph", "software_overlap_report"}:
            continue
        data = artifact.get("data") if isinstance(artifact.get("data"), dict) else {}
        relationship_edges = data.get("relationship_edges", [])
        if not isinstance(relationship_edges, list):
            continue
        artifact_id = str(artifact.get("id") or artifact_type or "knowledge_graph")
        for index, relationship in enumerate(relationship_edges, start=1):
            if not isinstance(relationship, dict):
                continue
            source = str(relationship.get("source_node_id") or "")
            target = str(relationship.get("target_node_id") or "")
            relationship_type = str(relationship.get("relationship_type") or "related_to")
            if not source or not target:
                continue
            edge_id = _relationship_edge_accept_id(artifact, relationship, index)
            metadata = relationship.get("metadata") if isinstance(relationship.get("metadata"), dict) else {}
            edges.append(
                {
                    "id": edge_id,
                    "source_node_id": source,
                    "target_node_id": target,
                    "relationship_type": relationship_type,
                    "source_refs": deepcopy(relationship.get("source_refs", []))
                    if isinstance(relationship.get("source_refs"), list)
                    else [],
                    "metadata": {
                        **deepcopy(metadata),
                        "source": f"{artifact_type}_artifact",
                        "artifact_id": artifact_id,
                        "relationship_edge_id": edge_id,
                        "source_signal": relationship.get("source_signal", ""),
                        "confidence": relationship.get("confidence", ""),
                        "rationale": relationship.get("rationale", ""),
                        "assumptions": deepcopy(relationship.get("assumptions", []))
                        if isinstance(relationship.get("assumptions"), list)
                        else [],
                        "review_state": relationship.get("review_state", ""),
                    },
                }
            )
    return edges


def _accepted_item_ids(
    revision: dict[str, Any],
    accepted_nodes: list[dict[str, Any]],
    accepted_edges: list[dict[str, Any]],
    review_outputs: list[dict[str, Any]],
    selected_ids: set[str],
) -> list[str]:
    accepted_raw_ids = {
        *[node.get("id") for node in accepted_nodes if isinstance(node, dict)],
        *[edge.get("id") for edge in accepted_edges if isinstance(edge, dict)],
        *[item.get("id") for item in review_outputs if isinstance(item, dict)],
    }
    accepted_artifact_ids = {
        edge.get("metadata", {}).get("artifact_id", "")
        for edge in accepted_edges
        if isinstance(edge, dict) and isinstance(edge.get("metadata"), dict)
    }
    accepted_relationship_edge_ids = {
        edge.get("metadata", {}).get("relationship_edge_id", "")
        for edge in accepted_edges
        if isinstance(edge, dict) and isinstance(edge.get("metadata"), dict)
    }
    item_ids = []
    for item in revision.get("draft_items", []):
        if not isinstance(item, dict):
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        raw_id = (
            metadata.get("node_id")
            or metadata.get("edge_id")
            or metadata.get("relationship_edge_id")
            or metadata.get("annotation_id")
            or metadata.get("artifact_id")
        )
        item_id = item.get("id")
        if (
            item_id in selected_ids
            or raw_id in accepted_raw_ids
            or raw_id in accepted_artifact_ids
            or raw_id in accepted_relationship_edge_ids
        ):
            item_ids.append(str(item_id))
    return item_ids


def _selected_metadata_ids(
    revision: dict[str, Any],
    selected_ids: set[str],
    metadata_key: str,
) -> set[str]:
    ids: set[str] = set()
    for item in revision.get("draft_items", []):
        if not isinstance(item, dict) or item.get("id") not in selected_ids:
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        value = metadata.get(metadata_key)
        if isinstance(value, str) and value:
            ids.add(value)
    return ids


def _build_ai_draft_graph_patch(
    graph: dict[str, Any],
    session: dict[str, Any],
    revision: dict[str, Any],
    *,
    accept_mode: str,
    selected_ids: set[str],
    accepted_by: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    patch_operations: list[dict[str, Any]] = []
    if accept_mode == "replace":
        _remove_scope_branch_for_replace(graph, session, patch_operations)

    if accept_mode == "notes_only":
        return [], [], deepcopy(revision.get("draft_annotations", [])), patch_operations

    selected_nodes = _selected_draft_nodes(revision, accept_mode, selected_ids)
    selected_edges = _selected_draft_edges(revision, selected_nodes, accept_mode)
    selected_artifacts = _selected_generated_artifacts(revision, accept_mode, selected_ids)
    selected_edges = [
        *selected_edges,
        *_knowledge_graph_artifact_edges_for_accept(selected_artifacts),
    ]
    existing_node_ids = {node.get("id") for node in graph.get("nodes", []) if isinstance(node, dict)}
    existing_by_id = _existing_nodes_by_id(graph)
    existing_by_title = _existing_nodes_by_title(graph)
    id_map: dict[str, str] = {}
    accepted_nodes: list[dict[str, Any]] = []

    for draft_node in selected_nodes:
        node = _accepted_revision_node(
            draft_node,
            session=session,
            revision=revision,
            accepted_by=accepted_by,
        )
        original_id = str(node.get("id") or f"draft_node_{_utc_token()}")
        merge_target = _merge_target_for_node(node, existing_by_id, existing_by_title) if accept_mode == "merge" else None

        if merge_target:
            id_map[original_id] = str(merge_target.get("id", original_id))
            _merge_draft_node_into_existing(merge_target, node, session, revision, patch_operations)
            continue

        next_id = _unique_graph_id(original_id, existing_node_ids)
        id_map[original_id] = next_id
        existing_node_ids.add(next_id)
        node["id"] = next_id
        if node.get("parent_id") in id_map:
            node["parent_id"] = id_map[node["parent_id"]]
        accepted_nodes.append(node)
        patch_operations.append(
            {
                "op": "add_node",
                "node_id": node["id"],
                "value": deepcopy(node),
                "metadata": {
                    "draft_node_id": original_id,
                    "session_id": session.get("session_id", ""),
                    "revision_id": revision.get("revision_id", ""),
                },
            }
        )

    accepted_edges = _accepted_revision_edges(
        graph,
        selected_edges,
        id_map=id_map,
        session=session,
        revision=revision,
        patch_operations=patch_operations,
    )
    return accepted_nodes, accepted_edges, [], patch_operations


def _remove_scope_branch_for_replace(
    graph: dict[str, Any],
    session: dict[str, Any],
    patch_operations: list[dict[str, Any]],
) -> None:
    scope = session.get("scope", {}) if isinstance(session, dict) else {}
    root_id = scope.get("node_id")
    if not root_id:
        return

    children_by_parent: dict[str, list[str]] = {}
    for edge in graph.get("edges", []):
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source and target:
            children_by_parent.setdefault(str(source), []).append(str(target))

    to_remove: set[str] = set()
    stack = list(children_by_parent.get(str(root_id), []))
    while stack:
        node_id = stack.pop()
        if node_id in to_remove:
            continue
        to_remove.add(node_id)
        stack.extend(children_by_parent.get(node_id, []))

    if not to_remove:
        return

    graph["nodes"] = [
        node for node in graph.get("nodes", [])
        if not isinstance(node, dict) or node.get("id") not in to_remove
    ]
    next_edges = []
    for edge in graph.get("edges", []):
        if not isinstance(edge, dict):
            continue
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source in to_remove or target in to_remove:
            patch_operations.append(
                {
                    "op": "remove_edge",
                    "edge_id": edge.get("id", ""),
                    "source_node_id": source or "",
                    "target_node_id": target or "",
                    "value": deepcopy(edge),
                    "metadata": {"mode": "replace"},
                }
            )
            continue
        next_edges.append(edge)
    graph["edges"] = next_edges

    for node_id in sorted(to_remove):
        patch_operations.append(
            {
                "op": "remove_node",
                "node_id": node_id,
                "metadata": {
                    "mode": "replace",
                    "scope_node_id": root_id,
                },
            }
        )


def _existing_nodes_by_title(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        _title_key(node.get("title")): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and _title_key(node.get("title"))
    }


def _existing_nodes_by_id(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(node.get("id")): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("id") is not None
    }


def _merge_target_for_node(
    node: dict[str, Any],
    existing_by_id: dict[str, dict[str, Any]],
    existing_by_title: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    node_id = str(node.get("id", ""))
    if node_id in existing_by_id:
        return existing_by_id[node_id]
    return existing_by_title.get(_title_key(node.get("title")))


def _merge_draft_node_into_existing(
    target: dict[str, Any],
    draft_node: dict[str, Any],
    session: dict[str, Any],
    revision: dict[str, Any],
    patch_operations: list[dict[str, Any]],
) -> None:
    before = deepcopy(target)
    if draft_node.get("summary"):
        target["summary"] = draft_node.get("summary", "")
    if draft_node.get("source_refs"):
        target["source_refs"] = _merge_source_refs(target.get("source_refs", []), draft_node.get("source_refs", []))
    if draft_node.get("external_refs") and isinstance(draft_node.get("external_refs"), dict):
        target["external_refs"] = {
            **(target.get("external_refs", {}) if isinstance(target.get("external_refs"), dict) else {}),
            **draft_node.get("external_refs", {}),
        }
    metadata = target.get("metadata") if isinstance(target.get("metadata"), dict) else {}
    metadata.update(
        {
            "ai_draft_merged_from": draft_node.get("id", ""),
            "ai_draft_session_id": session.get("session_id", ""),
            "ai_draft_revision_id": revision.get("revision_id", ""),
        }
    )
    target["metadata"] = metadata
    patch_operations.append(
        {
            "op": "update_node",
            "node_id": str(target.get("id", "")),
            "value": {"before": before, "after": deepcopy(target)},
            "metadata": {
                "draft_node_id": draft_node.get("id", ""),
                "session_id": session.get("session_id", ""),
                "revision_id": revision.get("revision_id", ""),
            },
        }
    )


def _accepted_revision_node(
    draft_node: dict[str, Any],
    *,
    session: dict[str, Any],
    revision: dict[str, Any],
    accepted_by: str,
) -> dict[str, Any]:
    node = deepcopy(draft_node)
    node["id"] = str(node.get("id") or f"draft_node_{_utc_token()}")
    node["title"] = str(node.get("title") or node["id"])
    node["summary"] = str(node.get("summary") or "")
    node["node_type"] = str(node.get("node_type") or "concept")
    node["status"] = str(node.get("status") or "ai_generated")
    node["source_refs"] = deepcopy(node.get("source_refs", [])) if isinstance(node.get("source_refs"), list) else []
    node["external_refs"] = deepcopy(node.get("external_refs", {})) if isinstance(node.get("external_refs"), dict) else {}
    node["metadata"] = deepcopy(node.get("metadata", {})) if isinstance(node.get("metadata"), dict) else {}
    if node.get("node_type") != "reference" and not node.get("source_refs"):
        node["status"] = "needs_review"
    node["metadata"].update(
        {
            "source": "ai_draft_session",
            "ai_draft_session_id": session.get("session_id", ""),
            "ai_draft_revision_id": revision.get("revision_id", ""),
            "ai_draft_intent": session.get("intent", ""),
            "ai_draft_role": session.get("role", ""),
            "accepted_by": accepted_by or "user",
        }
    )
    return node


def _accepted_revision_edges(
    graph: dict[str, Any],
    selected_edges: list[dict[str, Any]],
    *,
    id_map: dict[str, str],
    session: dict[str, Any],
    revision: dict[str, Any],
    patch_operations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    graph_node_ids = {node.get("id") for node in graph.get("nodes", []) if isinstance(node, dict)}
    graph_node_ids.update(id_map.values())
    existing_edge_keys = {
        (
            edge.get("source_node_id"),
            edge.get("target_node_id"),
            str(edge.get("relationship_type") or "contains"),
        )
        for edge in graph.get("edges", [])
        if isinstance(edge, dict)
    }
    accepted_edges: list[dict[str, Any]] = []
    used_edge_ids = {edge.get("id") for edge in graph.get("edges", []) if isinstance(edge, dict)}
    for draft_edge in selected_edges:
        edge = deepcopy(draft_edge)
        source = id_map.get(edge.get("source_node_id"), edge.get("source_node_id"))
        target = id_map.get(edge.get("target_node_id"), edge.get("target_node_id"))
        if source not in graph_node_ids or target not in graph_node_ids or source == target:
            continue
        relationship_type = str(edge.get("relationship_type") or "contains")
        key = (source, target, relationship_type)
        if key in existing_edge_keys:
            continue
        edge["source_node_id"] = source
        edge["target_node_id"] = target
        edge["id"] = _unique_graph_id(str(edge.get("id") or f"edge_{source}_{target}"), used_edge_ids)
        used_edge_ids.add(edge["id"])
        edge["relationship_type"] = relationship_type
        edge["metadata"] = deepcopy(edge.get("metadata", {})) if isinstance(edge.get("metadata"), dict) else {}
        edge["metadata"].setdefault("source", "ai_draft_session")
        edge["metadata"].update(
            {
                "ai_draft_session_id": session.get("session_id", ""),
                "ai_draft_revision_id": revision.get("revision_id", ""),
            }
        )
        accepted_edges.append(edge)
        existing_edge_keys.add(key)
        patch_operations.append(
            {
                "op": "add_edge",
                "edge_id": edge["id"],
                "source_node_id": source,
                "target_node_id": target,
                "value": deepcopy(edge),
                "metadata": {
                    "draft_edge_id": draft_edge.get("id", ""),
                    "session_id": session.get("session_id", ""),
                    "revision_id": revision.get("revision_id", ""),
                },
            }
        )
    return accepted_edges


def _attach_ai_draft_revision_notes(
    graph: dict[str, Any],
    session: dict[str, Any],
    revision: dict[str, Any],
    *,
    review_outputs: list[dict[str, Any]],
    accepted_by: str,
    patch_operations: list[dict[str, Any]],
) -> None:
    scope = session.get("scope", {}) if isinstance(session, dict) else {}
    node_id = scope.get("node_id")
    if not node_id and graph.get("nodes"):
        node_id = graph["nodes"][0].get("id")
    for node in graph.get("nodes", []):
        if not isinstance(node, dict) or node.get("id") != node_id:
            continue
        metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
        output = {
            "session_id": session.get("session_id", ""),
            "revision_id": revision.get("revision_id", ""),
            "outputs": deepcopy(review_outputs),
            "accepted_by": accepted_by or "user",
        }
        metadata.setdefault("ai_draft_outputs", []).append(output)
        node["metadata"] = metadata
        patch_operations.append(
            {
                "op": "attach_note",
                "node_id": str(node_id or ""),
                "value": output,
                "metadata": {
                    "session_id": session.get("session_id", ""),
                    "revision_id": revision.get("revision_id", ""),
                },
            }
        )
        return


def _title_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _unique_graph_id(preferred_id: str, existing_ids: set[str]) -> str:
    if preferred_id not in existing_ids:
        return preferred_id
    suffix = 2
    while f"{preferred_id}-{suffix}" in existing_ids:
        suffix += 1
    return f"{preferred_id}-{suffix}"


def registered_artifact_types() -> list[str]:
    return sorted(ARTIFACT_REGISTRY)


def normalize_requested_artifact_types(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    aliases = {
        "handoff_package": "implementation_handoff_package",
        "rendered_chart": "chart",
        "missing_information": "missing_info_report",
        "standards_completeness": "completeness_review",
        "folder_review": "completeness_review",
        "roadmap": "team_roadmap",
        "team_roadmap": "team_roadmap",
        "software_overlap": "software_overlap_report",
        "software_rationalization": "software_overlap_report",
        "application_rationalization": "software_overlap_report",
        "tool_rationalization": "software_overlap_report",
        "sme_question": "sme_questions",
        "task": "tasks",
    }
    normalized: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        artifact_type = aliases.get(value.strip(), value.strip())
        if artifact_type in ARTIFACT_REGISTRY and artifact_type not in normalized:
            normalized.append(artifact_type)
    return normalized


def _desired_outputs_from_graph(graph: dict[str, Any]) -> list[str]:
    if not isinstance(graph, dict):
        return []
    brief = graph.get("workspace_brief")
    if not isinstance(brief, dict):
        workspace = graph.get("workspace", {})
        brief = workspace.get("workspace_brief") if isinstance(workspace, dict) else None
    if isinstance(brief, dict):
        return normalize_requested_artifact_types(brief.get("desired_outputs", []))
    return []


def validate_generated_artifacts(
    artifacts: list[dict[str, Any]] | Any,
    *,
    scope: dict[str, Any],
    model_provider: str,
    model: str,
    ai_role: str,
    prompt_profile: str | dict[str, Any],
    input_source_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if artifacts in (None, []):
        return []
    if not isinstance(artifacts, list):
        raise GraphSchemaError(["generated_artifacts: must be a list"])

    normalized: list[dict[str, Any]] = []
    errors: list[str] = []
    for index, artifact in enumerate(artifacts):
        path = f"generated_artifacts.{index}"
        if not isinstance(artifact, dict):
            errors.append(f"{path}: must be an object")
            continue
        artifact_type = str(artifact.get("artifact_type") or "").strip()
        if artifact_type not in ARTIFACT_REGISTRY:
            errors.append(f"{path}.artifact_type: unsupported artifact type '{artifact_type}'")
            continue
        item = deepcopy(artifact)
        item["artifact_type"] = artifact_type
        item["id"] = str(item.get("id") or f"draft_artifact_{artifact_type}_{index + 1}")
        item["title"] = str(item.get("title") or artifact_type.replace("_", " ").title())
        item["status"] = str(item.get("status") or "draft")
        item["data"] = item.get("data") if isinstance(item.get("data"), dict) else {}
        item["source_refs"] = item.get("source_refs") if isinstance(item.get("source_refs"), list) else []
        item["assumptions"] = [
            str(assumption)
            for assumption in item.get("assumptions", [])
            if isinstance(assumption, str) and assumption.strip()
        ] if isinstance(item.get("assumptions"), list) else []
        if not item["source_refs"] and not item["assumptions"]:
            item["assumptions"] = ["Artifact contains generated or projected content that needs source review."]
        if not item["source_refs"]:
            item["status"] = "needs_review"

        if artifact_type == "knowledge_graph":
            item["data"]["relationship_edges"] = _normalize_relationship_edges(
                item["data"].get("relationship_edges", []),
                path=f"{path}.data.relationship_edges",
                errors=errors,
            )
        elif artifact_type == "flow_chart":
            _validate_flow_chart_artifact(item, path, errors)
        elif artifact_type == "chart":
            _validate_chart_artifact(item, path, errors)
        elif artifact_type == "completeness_review":
            _validate_completeness_review_artifact(item, path, errors)
        elif artifact_type == "software_overlap_report":
            _validate_software_overlap_report_artifact(item, path, errors)
        elif artifact_type == "team_roadmap":
            _validate_team_roadmap_artifact(item, path, errors)
        elif artifact_type == "implementation_handoff_package":
            _validate_handoff_artifact(item, path, errors)

        validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
        validation.setdefault("status", "needs_review" if item["status"] == "needs_review" else "valid")
        validation.setdefault("rules", ARTIFACT_REGISTRY[artifact_type]["validation_rules"])
        validation.setdefault("issues", [])
        item["validation"] = validation
        item["provenance"] = _artifact_provenance(
            item.get("provenance") if isinstance(item.get("provenance"), dict) else {},
            scope=scope,
            model_provider=model_provider,
            model=model,
            ai_role=ai_role,
            prompt_profile=prompt_profile,
            input_source_refs=input_source_refs,
            assumptions=item["assumptions"],
            validation_status=validation["status"],
        )
        item["registry"] = {
            "artifact_registry_version": ARTIFACT_REGISTRY_VERSION,
            "definition": ARTIFACT_REGISTRY[artifact_type],
        }
        normalized.append(item)

    if errors:
        raise GraphSchemaError(errors)
    return normalized


def _artifact_provenance(
    provenance: dict[str, Any],
    *,
    scope: dict[str, Any],
    model_provider: str,
    model: str,
    ai_role: str,
    prompt_profile: str | dict[str, Any],
    input_source_refs: list[dict[str, Any]],
    assumptions: list[str],
    validation_status: str,
) -> dict[str, Any]:
    confidence_summary = provenance.get("confidence_summary")
    if not confidence_summary:
        confidence_summary = "needs_review" if validation_status == "needs_review" else "medium"
    return {
        "generated_by": provenance.get("generated_by") or "ai_draft_session",
        "prompt_profile": provenance.get("prompt_profile") or prompt_profile or "",
        "ai_role": provenance.get("ai_role") or ai_role or "",
        "input_scope": provenance.get("input_scope") if isinstance(provenance.get("input_scope"), dict) else normalize_ai_draft_scope(scope),
        "input_source_refs": provenance.get("input_source_refs") if isinstance(provenance.get("input_source_refs"), list) else deepcopy(input_source_refs or []),
        "generated_at": provenance.get("generated_at") or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "model_provider": provenance.get("model_provider") or model_provider or "",
        "model": provenance.get("model") or model or "",
        "confidence_summary": confidence_summary,
        "assumptions": provenance.get("assumptions") if isinstance(provenance.get("assumptions"), list) else deepcopy(assumptions),
        "validation_status": validation_status,
    }


def _normalize_relationship_edges(relationship_edges: Any, *, path: str, errors: list[str]) -> list[dict[str, Any]]:
    if not isinstance(relationship_edges, list):
        errors.append(f"{path}: must be a list")
        return []
    normalized = []
    for index, edge in enumerate(relationship_edges):
        try:
            normalized.append(validate_knowledge_graph_relationship_edge(edge, f"{path}.{index}"))
        except GraphSchemaError as exc:
            errors.extend(exc.errors)
    return normalized


def _validate_flow_chart_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not (data.get("steps") or data.get("nodes") or data.get("decisions") or data.get("dependencies")):
        errors.append(f"{path}.data: flow_chart requires steps, nodes, decisions, or dependencies")


def _validate_chart_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not isinstance(data.get("chart_spec"), dict):
        errors.append(f"{path}.data.chart_spec: chart requires a chart_spec object")
    rows = data.get("data_rows") or data.get("rows")
    if not isinstance(rows, list) or not rows:
        errors.append(f"{path}.data.data_rows: chart requires source or extracted data rows")


def _validate_handoff_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not data.get("summary"):
        errors.append(f"{path}.data.summary: implementation_handoff_package requires a summary")
    if "recommended_next_actions" in data and not isinstance(data.get("recommended_next_actions"), list):
        errors.append(f"{path}.data.recommended_next_actions: must be a list when provided")


def _validate_completeness_review_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    review_keys = (
        "covered_areas",
        "missing_areas",
        "partial_areas",
        "duplicate_conflicting_areas",
        "stale_deprecated_candidates",
    )
    if not any(isinstance(data.get(key), list) and data.get(key) for key in review_keys):
        errors.append(f"{path}.data: completeness_review requires at least one populated review area")
    for key in (*review_keys, "recommended_roadmap", "sme_questions"):
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")


def _validate_software_overlap_report_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if isinstance(data, dict):
        data = enrich_software_overlap_report(data)
        item["data"] = data
    inventory_items = data.get("inventory_items", [])
    overlap_candidates = data.get("overlap_candidates", [])
    rationalization_actions = data.get("rationalization_actions", [])

    if not isinstance(inventory_items, list):
        errors.append(f"{path}.data.inventory_items: must be a list when provided")
        inventory_items = []
    if not isinstance(overlap_candidates, list) or not overlap_candidates:
        errors.append(f"{path}.data.overlap_candidates: software_overlap_report requires at least one overlap candidate")
        overlap_candidates = []
    if not isinstance(rationalization_actions, list):
        errors.append(f"{path}.data.rationalization_actions: must be a list when provided")

    for index, inventory_item in enumerate(inventory_items):
        if not isinstance(inventory_item, dict):
            errors.append(f"{path}.data.inventory_items.{index}: must be an object")
            continue
        entity_type = str(inventory_item.get("entity_type") or "").strip()
        if entity_type and entity_type not in SOFTWARE_INVENTORY_ENTITY_TYPES:
            errors.append(
                f"{path}.data.inventory_items.{index}.entity_type: must be a registered software inventory entity type"
            )

    validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
    issues = validation.get("issues") if isinstance(validation.get("issues"), list) else []
    item_needs_review = False

    for index, candidate in enumerate(overlap_candidates):
        candidate_path = f"{path}.data.overlap_candidates.{index}"
        if not isinstance(candidate, dict):
            errors.append(f"{candidate_path}: must be an object")
            continue
        application_ids = candidate.get("application_ids")
        if not isinstance(application_ids, list):
            application_ids = [
                str(application.get("id") or application.get("node_id") or "")
                for application in candidate.get("applications", [])
                if isinstance(application, dict)
            ] if isinstance(candidate.get("applications"), list) else []
            candidate["application_ids"] = [value for value in application_ids if value]
        if len([value for value in candidate.get("application_ids", []) if str(value).strip()]) < 2:
            errors.append(f"{candidate_path}.application_ids: must include at least two application ids")
        scoring_factors = candidate.get("scoring_factors")
        if not isinstance(scoring_factors, list) or not scoring_factors:
            errors.append(f"{candidate_path}.scoring_factors: must include score factor evidence")

        source_refs = candidate.get("source_refs", [])
        assumptions = candidate.get("assumptions", [])
        if source_refs is None:
            source_refs = []
        if assumptions is None:
            assumptions = []
        if not isinstance(source_refs, list):
            errors.append(f"{candidate_path}.source_refs: must be a list when provided")
            source_refs = []
        if not isinstance(assumptions, list) or not all(isinstance(value, str) for value in assumptions):
            errors.append(f"{candidate_path}.assumptions: must be a list of strings when provided")
            assumptions = []
        if not source_refs or str(candidate.get("review_state") or "") in {"", "inferred"}:
            candidate["review_state"] = "needs_review"
            item_needs_review = True
            issues.append(
                {
                    "code": "software_overlap_candidate_needs_review",
                    "severity": "warning",
                    "message": "Software overlap candidate is inferred or missing source evidence and was marked needs_review.",
                    "candidate_id": str(candidate.get("id") or ""),
                    "repaired": True,
                }
            )
        candidate["source_refs"] = source_refs
        candidate["assumptions"] = assumptions

    if "relationship_edges" in data:
        data["relationship_edges"] = _normalize_relationship_edges(
            data.get("relationship_edges", []),
            path=f"{path}.data.relationship_edges",
            errors=errors,
        )

    if item_needs_review:
        item["status"] = "needs_review"
        validation["status"] = "needs_review"
    if issues:
        validation["issues"] = issues
    item["validation"] = validation


def _validate_team_roadmap_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not data.get("context"):
        errors.append(f"{path}.data.context: team_roadmap requires plain-language context")
    for key in (
        "workstreams",
        "milestones",
        "dependencies",
        "risks",
        "required_decisions",
        "recommended_next_actions",
        "source_backed_appendix",
    ):
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")
    has_action_path = any(
        isinstance(data.get(key), list) and data.get(key)
        for key in ("workstreams", "milestones", "recommended_next_actions")
    )
    if not has_action_path:
        errors.append(f"{path}.data: team_roadmap requires workstreams, milestones, or recommended_next_actions")


def validate_ai_action_drafts_for_accept(
    draft_nodes: list[dict[str, Any]],
    draft_edges: list[dict[str, Any]] | None = None,
    generated_artifacts: list[dict[str, Any]] | None = None,
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

    for artifact in generated_artifacts or []:
        if not isinstance(artifact, dict):
            continue
        validation = artifact.get("validation", {}) if isinstance(artifact.get("validation"), dict) else {}
        for issue in validation.get("issues", []) if isinstance(validation.get("issues"), list) else []:
            if isinstance(issue, dict):
                issues.append(
                    {
                        "code": str(issue.get("code") or "artifact_validation_issue"),
                        "severity": str(issue.get("severity") or "warning"),
                        "message": str(issue.get("message") or "Generated artifact needs review."),
                        "artifact_id": str(artifact.get("id", "")),
                        "repaired": bool(issue.get("repaired", False)),
                    }
            )

    for artifact in generated_artifacts or []:
        if not isinstance(artifact, dict):
            continue
        validation = artifact.get("validation") if isinstance(artifact.get("validation"), dict) else {}
        if artifact.get("status") == "needs_review" or validation.get("status") == "needs_review":
            issues.append(
                {
                    "code": "artifact_needs_review",
                    "severity": "warning",
                    "message": "Generated artifact includes inferred or unsupported items and was marked needs_review.",
                    "artifact_id": str(artifact.get("id", "")),
                    "repaired": True,
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
            "You are TraceSpace's Source Librarian. Produce reviewable source "
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
            "You are TraceSpace's Reviewer. Produce reviewable gaps, "
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
            "You are TraceSpace's Project Planner. Produce reviewable task and "
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
            "You are TraceSpace's Integration Operator. Produce reviewable handoff "
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
Inspect this TraceSpace workspace graph and produce Source Librarian preview items.

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
Inspect this TraceSpace workspace graph and produce Reviewer preview items.

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
Inspect this TraceSpace workspace graph and produce Project Planner preview items.

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
Inspect this TraceSpace workspace graph and produce Integration Operator preview items.

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
        needs_source_ref = any(
            issue in {"Missing source document", "Missing source location", "Missing source quote"}
            for issue in issues
        )
        source_refs = (
            [suggestion["source_ref"]]
            if suggestion and needs_source_ref
            else _node_source_refs(node)
            if not needs_source_ref
            else []
        )
        assumptions = [] if source_refs else ["Reviewer must identify a supporting source."]
        suggested_confidence = _suggested_confidence(node, suggestion)
        repair_type = (
            "suggest_source_ref"
            if suggestion and needs_source_ref
            else "request_source_ref"
            if needs_source_ref
            else "suggest_confidence"
        )
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
                        if suggestion and needs_source_ref
                        else f"Suggested confidence '{suggested_confidence}' from current source metadata."
                        if not needs_source_ref
                        else "No nearby cited node was found."
                    )
                ),
                "confidence": suggested_confidence if not needs_source_ref else "low" if suggestion else "needs_review",
                "source_refs": source_refs,
                "assumptions": assumptions,
                "proposed_mutation": {
                    "source_refs": source_refs,
                    "confidence": suggested_confidence,
                    "source_ref_repair": {
                        "repair_type": repair_type,
                        "repair_kind": "source_ref" if needs_source_ref else "confidence",
                        "issues": issues,
                        "suggested_confidence": suggested_confidence,
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
    else:
        if not first_ref.get("page") and not first_ref.get("section"):
            issues.append("Missing source location")
        if not first_ref.get("quote_snippet"):
            issues.append("Missing source quote")
        source_confidence = _numeric_confidence(first_ref.get("confidence"))
        if not first_ref.get("confidence"):
            issues.append("Missing source confidence")
        elif source_confidence is not None and source_confidence < 0.6:
            issues.append("Low source confidence")

    node_confidence = _numeric_confidence(node.get("confidence"))
    if not node.get("confidence"):
        issues.append("Missing confidence")
    elif node_confidence is not None and node_confidence < 0.6:
        issues.append("Low confidence")
    return issues


def _numeric_confidence(value: Any) -> float | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    is_percent = text.endswith("%")
    try:
        parsed = float(text.rstrip("%").strip())
    except (TypeError, ValueError):
        return None
    if is_percent or parsed > 1:
        parsed = parsed / 100
    return parsed if parsed >= 0 else None


def _suggested_confidence(node: dict[str, Any], suggestion: dict[str, Any] | None) -> str:
    suggested_ref = suggestion.get("source_ref", {}) if suggestion else {}
    for value in (
        suggested_ref.get("confidence"),
        node.get("confidence"),
        (_node_source_refs(node)[0] if _node_source_refs(node) else {}).get("confidence"),
    ):
        confidence = _numeric_confidence(value)
        if confidence is not None and confidence >= 0.6:
            return str(value)
    return "medium"


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
        "create_team_roadmap",
        "create_30_60_90_day_improvement_plan",
        "create_stakeholder_review_package",
        "custom_prompt",
    }:
        planned_items = _draft_plan_for_action(
            action=action,
            source_title=source_title,
            custom_prompt=action_run.get("custom_prompt"),
        )
        for order, item in enumerate(planned_items, start=1):
            parent_order = item.get("parent_order")
            parent_node = (
                draft_nodes[int(parent_order) - 1]
                if isinstance(parent_order, int) and 0 < parent_order <= len(draft_nodes)
                else None
            )
            parent_id = parent_node.get("id") if parent_node else source_node_id
            draft_node = _draft_node(
                action_run=action_run,
                order=order,
                title=item["title"],
                summary=item["summary"],
                parent_id=parent_id,
                node_type=item["node_type"],
                source_refs=source_refs[:1],
                profile=profile,
            )
            draft_nodes.append(draft_node)
            if parent_id:
                draft_edges.append(
                    {
                        "id": f"draft_edge_{action_run['ai_action_id']}_{order}",
                        "source_node_id": parent_id,
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
        "assess_standards_completeness",
        "find_process_bottlenecks",
        "find_duplicate_tools",
        "find_ownership_gaps",
        "find_unsupported_business_critical_systems",
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
) -> list[dict[str, Any]]:
    target = source_title or "workspace"
    prompt = (custom_prompt or "").strip()
    if action == "custom_prompt" and prompt:
        return _custom_prompt_draft_plan(prompt)

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
        "create_team_roadmap": [
            ("Plain-language context", f"Explain the issue behind {target} in terms the team can use.", "concept"),
            ("Workstreams and dependencies", "Group the work into practical streams, dependencies, decisions, and risks.", "workflow"),
            ("Milestones and next actions", "Create a sequenced roadmap with milestones, owner placeholders, and review checkpoints.", "task"),
        ],
        "create_30_60_90_day_improvement_plan": [
            ("30 day stabilization plan", f"Identify urgent fixes, owners, and evidence needed to stabilize {target}.", "task"),
            ("60 day operating improvements", "Sequence process, tooling, and ownership improvements that reduce repeated friction.", "task"),
            ("90 day governance checkpoint", "Define durable controls, success measures, and stakeholder review gates.", "task"),
        ],
        "create_stakeholder_review_package": [
            ("Executive summary", f"Summarize the enterprise readiness findings for {target}.", "concept"),
            ("Decision and risk register", "List decisions needed, open risks, owners, and unsupported assumptions.", "requirement"),
            ("Review agenda and asks", "Package stakeholder questions, evidence requests, and next actions.", "task"),
        ],
    }
    return [
        {"title": f"{title} for {target}", "summary": summary, "node_type": node_type}
        for title, summary, node_type in plans.get(
            action,
            [("AI draft", f"Create a reviewable draft for {target}.", "concept")],
        )
    ]


def _custom_prompt_draft_plan(prompt: str) -> list[dict[str, Any]]:
    normalized_prompt = prompt.rstrip(".?!").strip()
    topic = _topic_from_custom_prompt(normalized_prompt)
    return _generic_custom_prompt_plan(topic or normalized_prompt or "AI draft")


def _topic_from_custom_prompt(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip(" .?!")
    patterns = [
        r"^(?:please\s+)?(?:show|map|layout|lay out|create|build|draft|make|generate|outline)\s+(?:me\s+)?(?:a|an|the|typical\s+)?(.+)$",
        r"^(?:what\s+is|explain|describe)\s+(?:a|an|the\s+)?(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip(" .?!")
            break
    cleaned = re.sub(r"^(?:typical|standard|basic)\s+", "", cleaned, flags=re.IGNORECASE)
    if re.search(r"\bsaas\b", cleaned, flags=re.IGNORECASE):
        cleaned = re.sub(r"\bSAAS\b", "SaaS", cleaned, flags=re.IGNORECASE)
    return cleaned[:96].replace("business model model", "business model")


def _generic_custom_prompt_plan(topic: str) -> list[dict[str, Any]]:
    return [
        {
            "title": topic[:80],
            "summary": f"Draft a reviewable structure for: {topic[:180]}",
            "node_type": "concept",
        },
        {
            "title": "Core components",
            "summary": f"Break {topic[:140] or 'the request'} into its main parts, decisions, and dependencies.",
            "node_type": "category",
            "parent_order": 1,
        },
        {
            "title": "Workflow or sequence",
            "summary": "Show the practical order of operations, handoffs, or lifecycle stages.",
            "node_type": "category",
            "parent_order": 1,
        },
        {
            "title": "Metrics and evidence",
            "summary": "Identify the signals, examples, or source support needed to validate the draft.",
            "node_type": "reference",
            "parent_order": 1,
        },
        {
            "title": "Open questions",
            "summary": "Flag assumptions, missing context, risks, and choices to confirm before accepting.",
            "node_type": "question",
            "parent_order": 1,
        },
    ]


def _annotation_type(action: str) -> str:
    if "question" in action or action == "ask_follow_up":
        return "sme_question"
    if action == "assess_standards_completeness":
        return "completeness_review"
    if "business_critical" in action:
        return "business_critical_system_gap"
    if "source" in action or "unsupported" in action:
        return "source_gap"
    if "duplicate" in action:
        return "overlap_review"
    if "bottleneck" in action:
        return "process_bottleneck"
    if "ownership" in action:
        return "ownership_gap"
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
        "assess_standards_completeness": "Standards completeness review",
        "find_process_bottlenecks": "Process bottleneck",
        "find_duplicate_tools": "Duplicate tool",
        "find_ownership_gaps": "Ownership gap",
        "find_unsupported_business_critical_systems": "Unsupported business-critical system",
        "interpret_table_data": "Table interpretation",
        "summarize_branch": "Branch summary",
        "reorganize_branch": "Branch reorganization note",
        "split_branch_into_categories": "Branch category split",
    }
    return f"{labels.get(action, 'AI note')} for {source_title}"


def _annotation_body(action: str, source_title: str, role: str, custom_prompt: str | None) -> str:
    if action == "custom_prompt" and custom_prompt:
        return custom_prompt.strip()
    if action == "assess_standards_completeness":
        return f"{role} should review {source_title} for documented, missing, partial, stale, duplicate, and conflicting standards coverage, with assumptions separated from source-backed findings."
    if "question" in action or action == "ask_follow_up":
        return f"What decision or source evidence is needed to finalize {source_title}?"
    if "business_critical" in action:
        return f"{role} should identify business-critical systems in {source_title} that lack source support, ownership, recovery notes, or integration coverage."
    if "source" in action or "unsupported" in action:
        return f"{role} should verify source support before accepting generated content for {source_title}."
    if "duplicate" in action:
        return f"{role} should compare nearby nodes for overlapping meaning before merging or accepting changes."
    if "bottleneck" in action:
        return f"{role} should identify process delays, handoff friction, missing decision gates, and measurable symptoms for {source_title}."
    if "ownership" in action:
        return f"{role} should flag systems, tasks, and decisions in {source_title} that lack a clear accountable owner or review cadence."
    if "table" in action:
        return f"{role} should review table-derived claims and mark inferred conclusions for review."
    return f"{role} generated a preview note for {source_title}."


def normalize_ai_draft_scope(scope: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(scope, dict):
        return {"type": "workspace"}
    scope_type = scope.get("type") or "workspace"
    if scope_type not in AIDRAFT_SCOPE_TYPES:
        return {"type": "workspace"}
    normalized = {"type": scope_type}
    for key in ("node_id", "source_id"):
        value = scope.get(key)
        if isinstance(value, str) and value.strip():
            normalized[key] = value.strip()
    node_ids = scope.get("node_ids")
    if isinstance(node_ids, list):
        normalized["node_ids"] = [str(node_id) for node_id in node_ids if str(node_id).strip()]
    return normalized


def _validate_ai_draft_scope(scope: dict[str, Any], errors: list[str]) -> None:
    scope_type = scope.get("type")
    if scope_type not in AIDRAFT_SCOPE_TYPES:
        errors.append(
            f"ai_draft_session.scope.type: must be one of {', '.join(sorted(AIDRAFT_SCOPE_TYPES))}"
        )
        return
    if scope_type in {"branch", "node"} and not _has_text(scope.get("node_id")):
        errors.append(f"ai_draft_session.scope.node_id: required for {scope_type} scope")
    if scope_type == "source" and not _has_text(scope.get("source_id")):
        errors.append("ai_draft_session.scope.source_id: required for source scope")
    if scope_type == "nodes" and not scope.get("node_ids"):
        errors.append("ai_draft_session.scope.node_ids: required for nodes scope")


def _validate_ai_draft_item(item: Any, index: int, errors: list[str]) -> None:
    path = f"ai_draft_revision.draft_items.{index}"
    if not isinstance(item, dict):
        errors.append(f"{path}: must be an object")
        return
    for key in ("id", "item_type", "title", "status"):
        _require_string(item, key, path, errors)
    if not isinstance(item.get("source_refs", []), list):
        errors.append(f"{path}.source_refs: must be a list")
    if not isinstance(item.get("assumptions", []), list):
        errors.append(f"{path}.assumptions: must be a list")
    if not isinstance(item.get("metadata", {}), dict):
        errors.append(f"{path}.metadata: must be an object")


def _validate_ai_draft_node(node: Any, index: int, errors: list[str]) -> None:
    path = f"ai_draft_revision.draft_nodes.{index}"
    if not isinstance(node, dict):
        errors.append(f"{path}: must be an object")
        return
    for key in ("id", "title", "node_type", "status"):
        _require_string(node, key, path, errors)
    _validate_source_ref_list(node.get("source_refs", []), f"{path}.source_refs", errors)
    if not isinstance(node.get("metadata", {}), dict):
        errors.append(f"{path}.metadata: must be an object")


def _validate_ai_draft_edge(edge: Any, index: int, errors: list[str]) -> None:
    path = f"ai_draft_revision.draft_edges.{index}"
    if not isinstance(edge, dict):
        errors.append(f"{path}: must be an object")
        return
    for key in ("id", "source_node_id", "target_node_id"):
        _require_string(edge, key, path, errors)
    if not isinstance(edge.get("metadata", {}), dict):
        errors.append(f"{path}.metadata: must be an object")


def _normalize_draft_items(
    draft_items: list[dict[str, Any]] | None,
    draft_nodes: list[dict[str, Any]],
    draft_annotations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if isinstance(draft_items, list) and draft_items:
        return [_normalize_draft_item(item) for item in draft_items if isinstance(item, dict)]
    items = []
    for node in draft_nodes:
        normalized = _normalize_draft_node(node)
        items.append(
            {
                "id": normalized["id"],
                "item_type": "node",
                "title": normalized["title"],
                "content": normalized.get("summary", ""),
                "source_refs": deepcopy(normalized.get("source_refs", [])),
                "assumptions": [] if normalized.get("source_refs") else ["Generated node has no source citation."],
                "status": "draft",
                "selected": True,
                "metadata": {"draft_node_id": normalized["id"]},
            }
        )
    for annotation in draft_annotations:
        if not isinstance(annotation, dict):
            continue
        items.append(
            {
                "id": str(annotation.get("id") or f"draft_annotation_{len(items) + 1}"),
                "item_type": "annotation",
                "title": str(annotation.get("title") or annotation.get("type") or "Review annotation"),
                "content": str(annotation.get("body") or annotation.get("content") or ""),
                "source_refs": deepcopy(annotation.get("source_refs", [])) if isinstance(annotation.get("source_refs"), list) else [],
                "assumptions": deepcopy(annotation.get("assumptions", [])) if isinstance(annotation.get("assumptions"), list) else [],
                "status": "draft",
                "selected": True,
                "metadata": {"draft_annotation_id": annotation.get("id", "")},
            }
        )
    return items


def _normalize_draft_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(item.get("id") or f"draft_item_{_utc_token()}"),
        "item_type": str(item.get("item_type") or item.get("type") or "node"),
        "title": str(item.get("title") or item.get("id") or "Draft item"),
        "content": str(item.get("content") or item.get("body") or item.get("summary") or ""),
        "source_refs": deepcopy(item.get("source_refs", [])) if isinstance(item.get("source_refs"), list) else [],
        "assumptions": deepcopy(item.get("assumptions", [])) if isinstance(item.get("assumptions"), list) else [],
        "status": str(item.get("status") or "draft"),
        "selected": bool(item.get("selected", True)),
        "metadata": deepcopy(item.get("metadata", {})) if isinstance(item.get("metadata"), dict) else {},
    }


def _normalize_draft_node(node: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(node)
    normalized["id"] = str(normalized.get("id") or f"draft_node_{_utc_token()}")
    normalized["title"] = str(normalized.get("title") or normalized["id"])
    normalized["summary"] = str(normalized.get("summary") or normalized.get("content") or "")
    normalized["node_type"] = str(normalized.get("node_type") or "concept")
    normalized["status"] = str(normalized.get("status") or "ai_generated")
    normalized["source_refs"] = deepcopy(normalized.get("source_refs", [])) if isinstance(normalized.get("source_refs"), list) else []
    normalized["external_refs"] = deepcopy(normalized.get("external_refs", {})) if isinstance(normalized.get("external_refs"), dict) else {}
    normalized["metadata"] = deepcopy(normalized.get("metadata", {})) if isinstance(normalized.get("metadata"), dict) else {}
    return normalized


def _normalize_draft_edge(edge: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(edge)
    normalized["id"] = str(normalized.get("id") or f"draft_edge_{_utc_token()}")
    normalized["source_node_id"] = str(normalized.get("source_node_id") or normalized.get("source") or "")
    normalized["target_node_id"] = str(normalized.get("target_node_id") or normalized.get("target") or "")
    normalized["relationship_type"] = str(normalized.get("relationship_type") or "contains")
    normalized["metadata"] = deepcopy(normalized.get("metadata", {})) if isinstance(normalized.get("metadata"), dict) else {}
    return normalized


def _latest_revision(session: dict[str, Any]) -> dict[str, Any]:
    revisions = session.get("revisions", [])
    if not revisions:
        raise GraphSchemaError(["ai_draft_session.revisions: at least one revision is required"])
    return revisions[-1]


def _select_draft_nodes(
    revision: dict[str, Any],
    *,
    mode: str,
    selected_item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    nodes = [_normalize_draft_node(node) for node in revision.get("draft_nodes", []) if isinstance(node, dict)]
    if mode == "cited_only":
        nodes = [node for node in nodes if node.get("source_refs")]
    if mode == "selected" and selected_item_ids is not None:
        selected = set(selected_item_ids)
        item_to_node = {
            item.get("id"): item.get("metadata", {}).get("draft_node_id")
            for item in revision.get("draft_items", [])
            if isinstance(item, dict) and isinstance(item.get("metadata"), dict)
        }
        selected_node_ids = selected | {node_id for item_id, node_id in item_to_node.items() if item_id in selected}
        nodes = [node for node in nodes if node["id"] in selected_node_ids]
    return nodes


def _preview_diff_summary(
    *,
    added_nodes: int,
    added_edges: int,
    updated_nodes: int,
    needs_review_repairs: int,
) -> str:
    return (
        f"+ {added_nodes} nodes, + {added_edges} edges, ~ {updated_nodes} updates, "
        f"! {needs_review_repairs} needs_review repairs"
    )


def _source_refs_from_revision(revision: dict[str, Any]) -> list[dict[str, Any]]:
    return _source_refs_from_draft_parts(
        revision.get("draft_nodes", []),
        revision.get("draft_annotations", []),
    )


def _source_refs_from_draft_parts(
    nodes: list[dict[str, Any]],
    annotations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    refs = []
    for part in list(nodes) + list(annotations):
        if isinstance(part, dict) and isinstance(part.get("source_refs"), list):
            refs = _merge_source_refs(refs, part["source_refs"])
    return refs


def _merge_source_refs(
    left: list[dict[str, Any]] | None,
    right: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source_ref in list(left or []) + list(right or []):
        if not isinstance(source_ref, dict) or not source_ref.get("document_id"):
            continue
        key = json.dumps(source_ref, sort_keys=True)
        if key in seen:
            continue
        refs.append(deepcopy(source_ref))
        seen.add(key)
    return refs


def _apply_ai_draft_nodes(
    graph: dict[str, Any],
    nodes: list[dict[str, Any]],
    *,
    session: dict[str, Any],
    revision: dict[str, Any],
    mode: str,
) -> None:
    existing_by_id = {node.get("id"): node for node in graph.get("nodes", []) if isinstance(node, dict)}
    for draft_node in nodes:
        node = _normalize_draft_node(draft_node)
        if node.get("node_type") != "reference" and not node.get("source_refs"):
            node["status"] = "needs_review"
        node["metadata"].update(
            {
                "source": "ai_draft_session",
                "ai_draft_session_id": session["session_id"],
                "ai_draft_revision_id": revision["revision_id"],
                "accept_mode": mode,
            }
        )
        if mode == "merge" and node["id"] in existing_by_id:
            existing_by_id[node["id"]].update(node)
        elif node["id"] not in existing_by_id:
            graph["nodes"].append(node)
            existing_by_id[node["id"]] = node


def _apply_ai_draft_edges(graph: dict[str, Any], edges: list[dict[str, Any]]) -> None:
    existing_ids = {edge.get("id") for edge in graph.get("edges", []) if isinstance(edge, dict)}
    node_ids = {node.get("id") for node in graph.get("nodes", []) if isinstance(node, dict)}
    for draft_edge in edges:
        edge = _normalize_draft_edge(draft_edge)
        if edge["id"] in existing_ids:
            continue
        if edge["source_node_id"] not in node_ids or edge["target_node_id"] not in node_ids:
            continue
        graph["edges"].append(edge)
        existing_ids.add(edge["id"])


def _attach_ai_draft_notes(
    graph: dict[str, Any],
    session: dict[str, Any],
    revision: dict[str, Any],
    *,
    accepted_at: str,
    mode: str,
) -> None:
    workspace = graph.setdefault("workspace", {})
    notes = workspace.setdefault("ai_review_notes", [])
    for annotation in revision.get("draft_annotations", []):
        if not isinstance(annotation, dict):
            continue
        note = deepcopy(annotation)
        note.setdefault("id", f"ai_draft_note_{_utc_token()}_{len(notes) + 1}")
        note["accepted_at"] = accepted_at
        note["accept_mode"] = mode
        note["session_id"] = session["session_id"]
        note["revision_id"] = revision["revision_id"]
        notes.append(note)


def classify_ai_draft_intent(
    prompt: str,
    *,
    scope: dict[str, Any] | None = None,
    desired_outputs: list[str] | None = None,
) -> dict[str, Any]:
    text = str(prompt or "").lower()
    normalized_scope = normalize_ai_draft_scope(scope)
    requested_artifacts = normalize_requested_artifact_types(desired_outputs or [])
    output_shape = "graph_draft"
    capability = "create_graph_draft"
    risk = "medium"
    model_policy = "balanced"

    if requested_artifacts:
        primary = requested_artifacts[0]
        output_shape = primary
        capability = f"draft_{primary}"
        if primary in {"source_coverage", "source_repair", "missing_info_report", "sme_questions", "knowledge_graph"}:
            model_policy = "deep_review"
            risk = "high"
    elif any(term in text for term in ("knowledge graph", "connections", "relationships", "relationship edges")):
        output_shape = "knowledge_graph"
        capability = "draft_knowledge_graph"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("flow chart", "flowchart", "process flow", "decision tree", "handoff")):
        output_shape = "flow_chart"
        capability = "draft_flow_chart"
    elif any(term in text for term in ("chart", "graph this", "visualize data")):
        output_shape = "chart"
        capability = "draft_chart"
    elif any(term in text for term in ("handoff package", "implementation package", "implementation handoff")):
        output_shape = "implementation_handoff_package"
        capability = "draft_implementation_handoff_package"
    elif any(term in text for term in ("stakeholder review package", "stakeholder package", "review package")):
        output_shape = "presentation_sections"
        capability = "draft_stakeholder_review_package"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("standards completeness", "completeness review", "review completeness", "folder review", "revit standards", "bim standards")):
        output_shape = "completeness_review"
        capability = "assess_standards_completeness"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("team roadmap", "roadmap for my team", "complex issue into a roadmap", "issue into a roadmap")):
        output_shape = "team_roadmap"
        capability = "create_team_roadmap"
        risk = "medium"
        model_policy = "balanced"
    elif any(term in text for term in ("30/60/90", "30 60 90", "30-60-90", "improvement plan")):
        output_shape = "tasks"
        capability = "draft_30_60_90_improvement_plan"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("process bottleneck", "process bottlenecks", "bottleneck")):
        output_shape = "review_annotations"
        capability = "find_process_bottlenecks"
        risk = "high"
        model_policy = "deep_review"
    elif any(
        term in text
        for term in (
            "duplicate tools",
            "duplicate tool",
            "tool overlap",
            "overlapping tools",
            "software overlap",
            "software rationalization",
            "application rationalization",
            "license rationalization",
            "software inventory overlap",
        )
    ):
        output_shape = "software_overlap_report"
        capability = "find_duplicate_tools"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("ownership gap", "ownership gaps", "missing owner", "unowned")):
        output_shape = "review_annotations"
        capability = "find_ownership_gaps"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("unsupported business-critical", "unsupported business critical", "business-critical systems", "business critical systems")):
        output_shape = "source_coverage"
        capability = "find_unsupported_business_critical_systems"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("diff", "patch", "change", "replace", "merge")):
        output_shape = "patch_diff"
        capability = "propose_graph_patch"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("source", "citation", "cited", "coverage")):
        output_shape = "source_coverage"
        capability = "review_source_coverage"
        risk = "high"
        model_policy = "deep_review"
    elif any(term in text for term in ("checklist", "check list")):
        output_shape = "checklist"
        capability = "draft_checklist"
    elif any(term in text for term in ("task", "todo", "to-do")):
        output_shape = "tasks"
        capability = "draft_tasks"
    elif "outline" in text:
        output_shape = "outline"
        capability = "draft_outline"
    elif any(term in text for term in ("table", "matrix", "spreadsheet")):
        output_shape = "table"
        capability = "draft_table_projection"
    elif "kanban" in text:
        output_shape = "kanban"
        capability = "draft_kanban_projection"
    elif any(term in text for term in ("presentation", "slides", "deck")):
        output_shape = "presentation_sections"
        capability = "draft_presentation_sections"
    elif any(term in text for term in ("review", "annotate", "annotation", "questions", "gaps")):
        output_shape = "review_annotations"
        capability = "draft_review_annotations"
        model_policy = "deep_review"

    if any(term in text for term in ("quick", "simple", "rough", "brainstorm")) and risk != "high":
        model_policy = "speed"
        risk = "low"

    return {
        "intent": _action_id(capability),
        "capability": capability,
        "output_shape": output_shape,
        "risk": risk,
        "model_policy": model_policy,
        "scope_type": normalized_scope["type"],
        "requested_artifact_types": requested_artifacts,
        "registered_artifact_types": registered_artifact_types(),
    }


def build_ai_draft_source_context(
    graph: dict[str, Any],
    *,
    scope: dict[str, Any] | None = None,
    source_chunks: list[dict[str, Any]] | None = None,
    prior_session: dict[str, Any] | None = None,
    include_source_library: bool = True,
    max_source_chunks: int = AI_DRAFT_SOURCE_CONTEXT_MAX_CHUNKS,
    max_source_refs: int = AI_DRAFT_SOURCE_CONTEXT_MAX_REFS,
) -> dict[str, Any]:
    normalized_scope = normalize_ai_draft_scope(scope)
    scoped_graph = _scope_graph_for_ai_draft(graph, normalized_scope)
    uploaded_chunks = _normalize_source_chunks(source_chunks or [])
    library_chunks = _source_library_chunks_for_scope(graph, normalized_scope) if include_source_library else []
    merged_chunks = _merge_source_chunks(uploaded_chunks, library_chunks)
    chunk_limit = max(0, max_source_chunks)
    ref_limit = max(0, max_source_refs)
    all_chunks = merged_chunks[:chunk_limit]
    graph_refs = _collect_source_refs(scoped_graph)
    chunk_refs = _source_refs_from_chunks(all_chunks)
    session_refs = prior_session.get("source_refs", []) if isinstance(prior_session, dict) else []
    merged_refs = _merge_source_refs(_merge_source_refs(graph_refs, chunk_refs), session_refs)
    source_refs = merged_refs[:ref_limit]
    source_library = (
        graph.get("source_library", {})
        if include_source_library and isinstance(graph, dict) and isinstance(graph.get("source_library"), dict)
        else {}
    )
    source_context_mode = _source_context_mode(
        normalized_scope=normalized_scope,
        uploaded_chunks=uploaded_chunks,
        library_chunks=library_chunks,
        include_source_library=include_source_library,
    )
    return {
        "scope": normalized_scope,
        "graph_context": _source_context_graph(scoped_graph),
        "source_refs": source_refs,
        "source_chunks": all_chunks,
        "uploaded_source_chunks": uploaded_chunks,
        "source_context_mode": source_context_mode,
        "source_chunks_included": len(all_chunks),
        "source_refs_included": len(source_refs),
        "source_context_truncated": len(merged_chunks) > chunk_limit or len(merged_refs) > ref_limit,
        "source_library_gaps": _source_library_gaps(source_library, scoped_graph),
        "draft_session_state": _draft_session_source_state(prior_session),
    }


def _source_context_graph(scoped_graph: dict[str, Any]) -> dict[str, Any]:
    graph_context = deepcopy(scoped_graph) if isinstance(scoped_graph, dict) else {}
    graph_context.pop("source_library", None)
    return graph_context


def _source_context_mode(
    *,
    normalized_scope: dict[str, Any],
    uploaded_chunks: list[dict[str, Any]],
    library_chunks: list[dict[str, Any]],
    include_source_library: bool,
) -> str:
    if uploaded_chunks:
        return "uploaded_chunks"
    if not include_source_library:
        return "none"
    if normalized_scope.get("type") == "source" and library_chunks:
        return "selected_source"
    if library_chunks:
        return "source_library"
    return "none"


def _should_include_library_sources(
    *,
    classification: dict[str, Any],
    prompt: str,
    source_chunks: list[dict[str, Any]] | None,
) -> bool:
    if source_chunks:
        return True
    output_shape = str(classification.get("output_shape") or "")
    capability = str(classification.get("capability") or "")
    if output_shape in {"source_coverage", "source_repair"} or "source" in capability:
        return True
    text = str(prompt or "").lower()
    return any(
        term in text
        for term in (
            "source",
            "sources",
            "citation",
            "cite",
            "evidence",
            "quote",
            "document",
            "docx",
            "grounded",
        )
    )


def generate_ai_draft_session_with_provider(
    graph: dict[str, Any],
    *,
    workspace_id: str | None = None,
    prompt: str,
    scope: dict[str, Any] | None = None,
    role: str = "Ask AI",
    model_policy: str | None = None,
    model: str | None = None,
    desired_outputs: list[str] | None = None,
    source_chunks: list[dict[str, Any]] | None = None,
    provider: DocMapAIProvider | None = None,
) -> dict[str, Any]:
    normalized_scope = normalize_ai_draft_scope(scope)
    scoped_graph = _scope_graph_for_ai_draft(graph, normalized_scope)
    requested_outputs = desired_outputs if desired_outputs is not None else _desired_outputs_from_graph(graph)
    classification = classify_ai_draft_intent(prompt, scope=normalized_scope, desired_outputs=requested_outputs)
    policy = normalize_model_policy(model_policy or classification["model_policy"], requested_model=model)
    include_library_sources = _should_include_library_sources(
        classification=classification,
        prompt=prompt,
        source_chunks=source_chunks,
    )
    source_context = build_ai_draft_source_context(
        graph,
        scope=normalized_scope,
        source_chunks=source_chunks or [],
        include_source_library=include_library_sources,
    )
    source_refs = source_context["source_refs"]
    decision = choose_openai_model(
        requested_model=model,
        model_policy=policy,
        task=f"{classification['capability']} {classification['output_shape']}",
        content=f"{prompt}\n{json.dumps(source_context)[:6000]}",
        source_chunks=source_context["source_chunks"],
        requires_source_grounding=bool(source_refs) or classification["output_shape"] == "source_coverage",
    )
    result = _generate_ai_draft_revision_payload(
        prompt=prompt,
        graph=source_context["graph_context"],
        scope=normalized_scope,
        role=role,
        classification=classification,
        decision=decision,
        source_refs=source_refs,
        source_chunks=source_context["source_chunks"],
        source_context=source_context,
        provider=provider,
    )
    metadata = _draft_generation_metadata(result, classification, decision, policy)
    metadata["source_context"] = _source_context_metadata(source_context)
    metadata.update(_source_context_budget_metadata(source_context))
    generated_artifacts = validate_generated_artifacts(
        result.get("generated_artifacts", []),
        scope=normalized_scope,
        model_provider=result.get("provider", ""),
        model=metadata["actual_model"],
        ai_role=role,
        prompt_profile=classification.get("requested_artifact_types", []),
        input_source_refs=_merge_source_refs(source_refs, result.get("source_refs", [])),
    )
    session = build_ai_draft_session(
        workspace_id=workspace_id or _workspace_id(graph),
        prompt=prompt,
        scope=normalized_scope,
        role=role,
        intent=classification["intent"],
        draft_nodes=result["draft_nodes"],
        draft_edges=result["draft_edges"],
        draft_items=result.get("draft_items"),
        draft_annotations=result["draft_annotations"],
        generated_artifacts=generated_artifacts,
        model_policy={"policy": policy},
        selected_model=metadata["actual_model"],
        model_reason=decision.reason,
        source_refs=_merge_source_refs(source_refs, result.get("source_refs", [])),
        metadata=metadata,
    )
    if session.get("revisions"):
        session["revisions"][-1].setdefault("metadata", {}).update(metadata)
    return validate_ai_draft_session(session)


def revise_ai_draft_session_with_provider(
    session: dict[str, Any],
    graph: dict[str, Any],
    *,
    prompt: str,
    model_policy: str | None = None,
    model: str | None = None,
    desired_outputs: list[str] | None = None,
    source_chunks: list[dict[str, Any]] | None = None,
    provider: DocMapAIProvider | None = None,
) -> dict[str, Any]:
    normalized_session = validate_ai_draft_session(session)
    normalized_scope = normalized_session["scope"]
    requested_outputs = desired_outputs if desired_outputs is not None else _desired_outputs_from_graph(graph)
    classification = classify_ai_draft_intent(
        f"{normalized_session.get('intent', '')} {prompt}",
        scope=normalized_scope,
        desired_outputs=requested_outputs,
    )
    current_policy = normalized_session.get("model_policy", {})
    current_policy_name = current_policy.get("policy") if isinstance(current_policy, dict) else current_policy
    policy = normalize_model_policy(model_policy or current_policy_name or classification["model_policy"], requested_model=model)
    include_library_sources = _should_include_library_sources(
        classification=classification,
        prompt=prompt,
        source_chunks=source_chunks,
    )
    source_context = build_ai_draft_source_context(
        graph,
        scope=normalized_scope,
        source_chunks=source_chunks or [],
        prior_session=normalized_session,
        include_source_library=include_library_sources,
    )
    source_refs = source_context["source_refs"]
    decision = choose_openai_model(
        requested_model=model,
        model_policy=policy,
        task=f"revise {classification['capability']} {classification['output_shape']}",
        content=f"{prompt}\n{json.dumps(source_context)[:6000]}",
        source_chunks=source_context["source_chunks"],
        requires_source_grounding=bool(source_refs) or classification["output_shape"] == "source_coverage",
    )
    result = _generate_ai_draft_revision_payload(
        prompt=prompt,
        graph=source_context["graph_context"],
        scope=normalized_scope,
        role=normalized_session.get("role") or "Ask AI",
        classification=classification,
        decision=decision,
        source_refs=source_refs,
        source_chunks=source_context["source_chunks"],
        source_context=source_context,
        provider=provider,
        prior_session=normalized_session,
    )
    metadata = _draft_generation_metadata(result, classification, decision, policy)
    metadata["source_context"] = _source_context_metadata(source_context)
    metadata.update(_source_context_budget_metadata(source_context))
    generated_artifacts = validate_generated_artifacts(
        result.get("generated_artifacts", []),
        scope=normalized_scope,
        model_provider=result.get("provider", ""),
        model=metadata["actual_model"],
        ai_role=normalized_session.get("role") or "Ask AI",
        prompt_profile=classification.get("requested_artifact_types", []),
        input_source_refs=_merge_source_refs(source_refs, result.get("source_refs", [])),
    )
    revision = build_ai_draft_revision(
        session=normalized_session,
        prompt=prompt,
        draft_nodes=result["draft_nodes"],
        draft_edges=result["draft_edges"],
        draft_items=result.get("draft_items"),
        draft_annotations=result["draft_annotations"],
        generated_artifacts=generated_artifacts,
        model=metadata["actual_model"],
        metadata=metadata,
    )
    revised = append_ai_draft_revision(normalized_session, revision, prompt=prompt)
    revised["selected_model"] = metadata["actual_model"]
    revised["model_reason"] = decision.reason
    revised["model_policy"] = {"policy": policy}
    revised["source_refs"] = _merge_source_refs(
        revised.get("source_refs", []),
        _merge_source_refs(source_refs, result.get("source_refs", [])),
    )
    revised["metadata"].update(metadata)
    return validate_ai_draft_session(revised)


def add_source_to_ai_draft_session(
    session: dict[str, Any],
    graph: dict[str, Any],
    *,
    source_chunks: list[dict[str, Any]],
    prompt: str | None = None,
    model_policy: str | None = None,
    model: str | None = None,
    provider: DocMapAIProvider | None = None,
) -> dict[str, Any]:
    normalized_chunks = _normalize_source_chunks(source_chunks)
    if not normalized_chunks:
        raise GraphSchemaError(["ai_draft_source_context.source_chunks: at least one source chunk is required"])
    reconcile_prompt = prompt or (
        "Reconcile the current draft against the newly added source chunks. "
        "Preserve supported draft content, add citations only when supported by the allowed source_refs, "
        "and keep unsupported claims uncited with needs_review assumptions."
    )
    revised = revise_ai_draft_session_with_provider(
        session,
        graph,
        prompt=reconcile_prompt,
        model_policy=model_policy,
        model=model,
        source_chunks=normalized_chunks,
        provider=provider,
    )
    added_refs = _source_refs_from_chunks(normalized_chunks)
    revised.setdefault("metadata", {})["last_added_source_refs"] = added_refs
    revised["metadata"]["last_source_reconciliation_revision_id"] = revised["revisions"][-1]["revision_id"]
    return validate_ai_draft_session(revised)


def build_ai_draft_generation_request(
    *,
    prompt: str,
    graph: dict[str, Any],
    scope: dict[str, Any],
    role: str,
    classification: dict[str, Any],
    model: str,
    source_refs: list[dict[str, Any]],
    source_chunks: list[dict[str, Any]],
    source_context: dict[str, Any] | None = None,
    prior_session: dict[str, Any] | None = None,
) -> DocMapGenerationRequest:
    return DocMapGenerationRequest(
        model=model,
        instructions=_ai_draft_system_prompt(role),
        input=[
            {
                "role": "user",
                "content": _ai_draft_user_prompt(
                    prompt=prompt,
                    graph=graph,
                    scope=scope,
                    classification=classification,
                    source_refs=source_refs,
                    source_chunks=source_chunks,
                    source_context=source_context,
                    prior_session=prior_session,
                ),
            }
        ],
        response_schema=AI_DRAFT_REVISION_OUTPUT_SCHEMA,
        schema_name="docmap_ai_draft_revision",
        metadata={
            "feature": "ai_draft_session",
            "intent": classification["intent"][:64],
            "output_shape": classification["output_shape"],
            "scope_type": scope.get("type", "workspace"),
        },
        store=False,
    )


def parse_ai_draft_revision_response(
    raw_response: str | dict[str, Any],
    *,
    prompt: str,
    scope: dict[str, Any],
    source_refs: list[dict[str, Any]] | None = None,
    classification: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if isinstance(raw_response, dict):
        parsed = deepcopy(raw_response)
    elif isinstance(raw_response, str):
        try:
            parsed = json.loads(_strip_json_fence(raw_response))
        except json.JSONDecodeError as exc:
            raise GraphSchemaError([f"ai_draft_revision: invalid JSON at character {exc.pos}"]) from exc
    else:
        raise GraphSchemaError(["ai_draft_revision: response must be a JSON object or string"])

    if not isinstance(parsed, dict):
        raise GraphSchemaError(["ai_draft_revision: response must be a JSON object"])

    shape = str(parsed.get("output_shape") or (classification or {}).get("output_shape") or "graph_draft")
    if shape not in AI_DRAFT_OUTPUT_SHAPES:
        shape = "graph_draft"
    allowed_source_refs = source_refs or []
    draft_nodes = [
        _normalize_model_draft_node(node, allowed_source_refs=allowed_source_refs)
        for node in parsed.get("draft_nodes", [])
        if isinstance(node, dict)
    ]
    draft_edges = [
        _normalize_model_draft_edge(edge)
        for edge in parsed.get("draft_edges", [])
        if isinstance(edge, dict)
    ]
    draft_annotations = [
        _normalize_model_annotation(annotation, allowed_source_refs=allowed_source_refs)
        for annotation in (
            list(parsed.get("draft_annotations", []))
            + list(parsed.get("review_annotations", []))
            + _projection_annotations(parsed, shape)
        )
        if isinstance(annotation, dict)
    ]
    draft_items = parsed.get("draft_items")
    if not isinstance(draft_items, list) or not draft_items:
        draft_items = _items_from_model_output(parsed, draft_nodes, draft_annotations, shape)
    raw_generated_artifacts = parsed.get("generated_artifacts", [])
    if not isinstance(raw_generated_artifacts, list):
        raw_generated_artifacts = []
    projection_artifact = _artifact_from_top_level_projection(parsed, shape)
    if projection_artifact and not any(
        isinstance(artifact, dict)
        and artifact.get("artifact_type") == projection_artifact["artifact_type"]
        for artifact in raw_generated_artifacts
    ):
        raw_generated_artifacts = [*raw_generated_artifacts, projection_artifact]
    generated_artifacts = validate_generated_artifacts(
        raw_generated_artifacts,
        scope=scope,
        model_provider="",
        model="",
        ai_role="",
        prompt_profile="",
        input_source_refs=allowed_source_refs,
    )
    response_source_refs = _filter_allowed_source_refs(parsed.get("source_refs", []), allowed_source_refs)
    if not response_source_refs:
        response_source_refs = _source_refs_from_draft_parts(draft_nodes, draft_annotations)
    return {
        "intent": str(parsed.get("intent") or (classification or {}).get("intent") or "custom_prompt"),
        "output_shape": shape,
        "summary": str(parsed.get("summary") or prompt or ""),
        "draft_nodes": draft_nodes,
        "draft_edges": draft_edges,
        "draft_annotations": draft_annotations,
        "generated_artifacts": generated_artifacts,
        "draft_items": draft_items,
        "source_refs": response_source_refs,
        "assumptions": [
            str(assumption)
            for assumption in parsed.get("assumptions", [])
            if isinstance(assumption, str) and assumption.strip()
        ],
    }


def _generate_ai_draft_revision_payload(
    *,
    prompt: str,
    graph: dict[str, Any],
    scope: dict[str, Any],
    role: str,
    classification: dict[str, Any],
    decision: Any,
    source_refs: list[dict[str, Any]],
    source_chunks: list[dict[str, Any]],
    source_context: dict[str, Any] | None = None,
    provider: DocMapAIProvider | None,
    prior_session: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if provider is None:
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError("Missing required environment variable(s): openai_api_key.")
        provider = OpenAIResponsesDocMapProvider(api_key=api_key)
    request = build_ai_draft_generation_request(
        prompt=prompt,
        graph=graph,
        scope=scope,
        role=role,
        classification=classification,
        model=decision.model,
        source_refs=source_refs,
        source_chunks=source_chunks,
        source_context=source_context,
        prior_session=prior_session,
    )
    generated = provider.generate_json(request)
    parsed = parse_ai_draft_revision_response(
        generated.text,
        prompt=prompt,
        scope=scope,
        source_refs=source_refs,
        classification=classification,
    )
    parsed["provider"] = generated.provider
    parsed["actual_model"] = generated.model or _model_from_raw_response(generated.raw_response) or request.model
    parsed["usage"] = _normalize_generation_usage(generated.usage, model=parsed["actual_model"], provider=generated.provider)
    return parsed


def _ai_draft_system_prompt(role: str) -> str:
    return (
        f"You are TraceSpace's {role or 'Ask AI'} drafting agent. Return only strict JSON "
        "matching the provided schema. Draft sessions are preview-only and non-canonical. "
        "TraceSpace is a source-grounded think space; mind_map is only one possible artifact. "
        "Do not claim source support unless a source_ref appears in the provided source_refs. "
        "Unsourced generated graph nodes and inferred artifact items must keep source_refs empty, "
        "include an assumption, and be marked needs_review."
    )


def _ai_draft_user_prompt(
    *,
    prompt: str,
    graph: dict[str, Any],
    scope: dict[str, Any],
    classification: dict[str, Any],
    source_refs: list[dict[str, Any]],
    source_chunks: list[dict[str, Any]],
    source_context: dict[str, Any] | None,
    prior_session: dict[str, Any] | None,
) -> str:
    prior = ""
    if prior_session:
        prior = f"\nPrior draft session:\n{json.dumps(prior_session, indent=2)[:6000]}\n"
    return f"""
User request:
{prompt}

Intent classification:
{json.dumps(classification, indent=2)}

Scope:
{json.dumps(scope, indent=2)}

Canonical graph context. Do not mutate it directly:
{json.dumps(graph, indent=2)[:12000]}

Allowed source_refs. Use only these exact source refs; otherwise return []:
{json.dumps(source_refs, indent=2)[:6000]}

Source chunks:
{json.dumps(source_chunks, indent=2)[:6000]}

Source context, including selected scope, source-library gaps, uploaded chunks, and prior draft state:
{json.dumps(source_context or {}, indent=2)[:10000]}
{prior}
Output requirements:
- Treat mind_map as only one registered artifact type. Prefer the requested artifact_type/output_shape over map-first generation.
- For broad mind_map or graph_draft requests, create a useful 2-4 level hierarchy instead of only top-level labels.
- For broad conceptual, business, operating model, GTM, strategy, or learning-map requests, choose enough nodes for the subject to be genuinely useful, usually 20-40 draft_nodes unless the user asks for a quick/simple sketch.
- Silently self-review before returning JSON: if the draft only contains generic category labels, is missing obvious domain-standard subtopics, or has fewer than 3 useful child branches under major concepts, revise it internally before finalizing.
- Use your model knowledge of the requested domain to choose depth and subtopics; do not rely on hardcoded examples or stop at framework headings.
- Populate generated_artifacts for visual or review outputs such as knowledge_graph, flow_chart, chart, checklist, tasks, source_coverage, software_overlap_report, and implementation_handoff_package.
- Populate the projection matching output_shape and, when graph changes are useful, draft_nodes and draft_edges.
- Use stable draft IDs prefixed with draft_.
- Use source_refs only by copying from Allowed source_refs.
- For unsourced generated nodes, set source_refs: [] and add an assumption.
- Strict schema mode requires every declared field. Include generated_artifacts, source_coverage, tasks, checklist, outline, table, kanban, presentation_sections, and review_annotations as arrays even when empty.
- For typed object projections that are not relevant to the request, return null for flow_chart, knowledge_graph, and chart. When they are relevant, fill their required arrays and use [] for empty nested lists.

{ARTIFACT_REGISTRY_CONTRACT.strip()}
""".strip()


def _scope_graph_for_ai_draft(graph: dict[str, Any], scope: dict[str, Any]) -> dict[str, Any]:
    scope_type = scope.get("type")
    if scope_type == "branch" and scope.get("node_id"):
        return _scope_graph(graph, {"type": "branch", "node_id": scope["node_id"]})
    if scope_type == "node" and scope.get("node_id"):
        return _scope_node_graph(graph, scope["node_id"])
    if scope_type == "nodes":
        node_ids = set(scope.get("node_ids", []))
        scoped = deepcopy(graph)
        scoped["nodes"] = [node for node in graph.get("nodes", []) if isinstance(node, dict) and node.get("id") in node_ids]
        scoped["edges"] = [
            edge
            for edge in graph.get("edges", [])
            if isinstance(edge, dict)
            and edge.get("source_node_id") in node_ids
            and edge.get("target_node_id") in node_ids
        ]
        return scoped
    return deepcopy(graph)


def _normalize_model_draft_node(
    node: dict[str, Any],
    *,
    allowed_source_refs: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = _normalize_draft_node(node)
    normalized["source_refs"] = _filter_allowed_source_refs(
        normalized.get("source_refs", []),
        allowed_source_refs,
    )
    normalized["metadata"].setdefault("source", "responses_ai_draft")
    if not normalized["source_refs"] and normalized.get("node_type") != "reference":
        normalized.setdefault("assumptions", [])
    return normalized


def _normalize_model_draft_edge(edge: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_draft_edge(edge)
    normalized["metadata"].setdefault("source", "responses_ai_draft")
    return normalized


def _normalize_model_annotation(
    annotation: dict[str, Any],
    *,
    allowed_source_refs: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = deepcopy(annotation)
    normalized["id"] = str(normalized.get("id") or f"draft_annotation_{_utc_token()}")
    normalized["type"] = str(normalized.get("type") or "ai_note")
    normalized["title"] = str(normalized.get("title") or normalized["type"])
    normalized["body"] = str(normalized.get("body") or normalized.get("content") or "")
    normalized["source_refs"] = _filter_allowed_source_refs(
        normalized.get("source_refs", []),
        allowed_source_refs,
    )
    normalized["assumptions"] = normalized.get("assumptions", []) if isinstance(normalized.get("assumptions"), list) else []
    normalized["metadata"] = normalized.get("metadata", {}) if isinstance(normalized.get("metadata"), dict) else {}
    normalized["metadata"].setdefault("source", "responses_ai_draft")
    return normalized


def _projection_annotations(parsed: dict[str, Any], shape: str) -> list[dict[str, Any]]:
    projections = {
        "source_coverage": "source_coverage",
        "source_repair": "source_coverage",
        "tasks_checklist": "tasks",
        "tasks": "tasks",
        "checklist": "checklist",
        "outline": "outline",
        "table": "table",
        "kanban": "kanban",
        "presentation_sections": "presentation_sections",
        "sme_questions": "review_annotations",
        "missing_info_report": "review_annotations",
    }
    key = projections.get(shape)
    values = parsed.get(key, []) if key else []
    if not isinstance(values, list):
        return []
    annotations = []
    for index, value in enumerate(values, start=1):
        if isinstance(value, dict):
            annotations.append(
                {
                    "id": str(value.get("id") or f"draft_projection_{shape}_{index}"),
                    "type": shape,
                    "title": str(value.get("title") or value.get("label") or shape),
                    "body": str(value.get("body") or value.get("summary") or value.get("description") or ""),
                    "source_refs": value.get("source_refs", []),
                    "metadata": {"projection": shape, "projection_item": value},
                }
            )
    return annotations


def _artifact_from_top_level_projection(
    parsed: dict[str, Any],
    shape: str,
) -> dict[str, Any] | None:
    if shape != "software_overlap_report":
        return None
    data = parsed.get("software_overlap_report")
    if not isinstance(data, dict) or not data:
        return None
    return {
        "id": str(data.get("id") or "artifact-software-overlap-report"),
        "artifact_type": "software_overlap_report",
        "title": str(data.get("title") or "Software Overlap Report"),
        "status": str(data.get("status") or "draft"),
        "data": deepcopy(data),
        "source_refs": deepcopy(data.get("source_refs", []))
        if isinstance(data.get("source_refs"), list)
        else [],
        "assumptions": deepcopy(data.get("assumptions", []))
        if isinstance(data.get("assumptions"), list)
        else [],
    }


def _items_from_model_output(
    parsed: dict[str, Any],
    draft_nodes: list[dict[str, Any]],
    draft_annotations: list[dict[str, Any]],
    shape: str,
) -> list[dict[str, Any]]:
    items = _normalize_draft_items(None, draft_nodes, draft_annotations)
    for assumption in parsed.get("assumptions", []):
        if isinstance(assumption, str) and assumption.strip():
            items.append(
                {
                    "id": f"draft_assumption_{len(items) + 1}",
                    "item_type": "assumption",
                    "title": "Assumption",
                    "content": assumption,
                    "source_refs": [],
                    "assumptions": [assumption],
                    "status": "draft",
                    "selected": True,
                    "metadata": {"output_shape": shape},
                }
            )
    return items


def _filter_allowed_source_refs(
    source_refs: Any,
    allowed_source_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(source_refs, list):
        return []
    allowed_by_key = {json.dumps(ref, sort_keys=True): ref for ref in allowed_source_refs if isinstance(ref, dict)}
    filtered = []
    for source_ref in source_refs:
        if not isinstance(source_ref, dict) or not source_ref.get("document_id"):
            continue
        key = json.dumps(source_ref, sort_keys=True)
        if key in allowed_by_key:
            filtered.append(deepcopy(allowed_by_key[key]))
    return _merge_source_refs([], filtered)


def _source_refs_from_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        if isinstance(chunk.get("source_ref"), dict):
            refs = _merge_source_refs(refs, [chunk["source_ref"]])
        if isinstance(chunk.get("source_refs"), list):
            refs = _merge_source_refs(refs, chunk["source_refs"])
    return refs


def _normalize_source_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for index, chunk in enumerate(chunks):
        if not isinstance(chunk, dict):
            continue
        source_refs = []
        if isinstance(chunk.get("source_ref"), dict):
            source_refs = _merge_source_refs(source_refs, [chunk["source_ref"]])
        if isinstance(chunk.get("source_refs"), list):
            source_refs = _merge_source_refs(source_refs, chunk["source_refs"])
        document_id = str(
            chunk.get("document_id")
            or (source_refs[0].get("document_id") if source_refs else "")
            or ""
        ).strip()
        chunk_id = str(chunk.get("id") or chunk.get("chunk_id") or f"source_chunk_{index + 1}")
        if not source_refs and document_id:
            source_refs = [
                {
                    "document_id": document_id,
                    "chunk_id": chunk_id,
                    "page": chunk.get("page"),
                    "section": chunk.get("heading") or chunk.get("section") or "",
                    "quote_snippet": str(chunk.get("quote_snippet") or chunk.get("snippet") or chunk.get("text") or "")[:360],
                    "confidence": chunk.get("confidence") or "medium",
                }
            ]
        normalized.append(
            {
                "id": chunk_id,
                "document_id": document_id,
                "page": chunk.get("page"),
                "heading": chunk.get("heading") or chunk.get("section") or "",
                "text": str(chunk.get("text") or chunk.get("snippet") or ""),
                "snippet": str(chunk.get("snippet") or chunk.get("text") or "")[:720],
                "source_refs": source_refs,
                "source_ref": source_refs[0] if source_refs else {},
                "metadata": chunk.get("metadata", {}) if isinstance(chunk.get("metadata"), dict) else {},
            }
        )
    return normalized


def _merge_source_chunks(
    left: list[dict[str, Any]],
    right: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    chunks = []
    seen = set()
    for chunk in list(left or []) + list(right or []):
        if not isinstance(chunk, dict):
            continue
        key = (
            str(chunk.get("document_id") or ""),
            str(chunk.get("id") or chunk.get("chunk_id") or ""),
            str(chunk.get("snippet") or chunk.get("text") or "")[:120],
        )
        if key in seen:
            continue
        seen.add(key)
        chunks.append(deepcopy(chunk))
    return chunks


def _source_library_chunks_for_scope(
    graph: dict[str, Any],
    scope: dict[str, Any],
) -> list[dict[str, Any]]:
    source_library = graph.get("source_library", {}) if isinstance(graph, dict) else {}
    if not isinstance(source_library, dict):
        return []
    documents = source_library.get("documents", [])
    if not isinstance(documents, list):
        return []
    selected_source_id = scope.get("source_id") if scope.get("type") == "source" else ""
    chunks = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        document_id = str(document.get("id") or document.get("document_id") or "")
        if selected_source_id and document_id != selected_source_id:
            continue
        for chunk in document.get("chunks", []) if isinstance(document.get("chunks"), list) else []:
            if not isinstance(chunk, dict):
                continue
            chunk_id = str(chunk.get("id") or "")
            source_ref = {
                "document_id": document_id,
                "chunk_id": chunk_id,
                "page": chunk.get("page"),
                "section": chunk.get("heading") or "",
                "quote_snippet": chunk.get("snippet") or "",
                "confidence": "medium",
            }
            chunks.append(
                {
                    "id": chunk_id,
                    "document_id": document_id,
                    "page": chunk.get("page"),
                    "heading": chunk.get("heading") or "",
                    "snippet": chunk.get("snippet") or "",
                    "text": chunk.get("snippet") or "",
                    "source_ref": source_ref,
                    "source_refs": [source_ref],
                    "metadata": {"source": "source_library"},
                }
            )
    return _normalize_source_chunks(chunks)


def _source_library_document(
    graph: dict[str, Any],
    source_id: str,
) -> dict[str, Any] | None:
    source_library = graph.get("source_library", {}) if isinstance(graph, dict) else {}
    documents = source_library.get("documents", []) if isinstance(source_library, dict) else []
    if not isinstance(documents, list):
        return None
    requested_source_id = str(source_id)
    for document in documents:
        if not isinstance(document, dict):
            continue
        document_ids = {
            str(value)
            for value in (
                document.get("id"),
                document.get("document_id"),
                document.get("source_document_id"),
                document.get("component_id"),
            )
            if value not in (None, "")
        }
        if requested_source_id in document_ids:
            return document
    return None


def _source_ref_from_chunk(
    document: dict[str, Any],
    chunk: dict[str, Any],
    confidence: str = "medium",
) -> dict[str, Any]:
    document_id = str(
        document.get("id")
        or document.get("document_id")
        or document.get("source_document_id")
        or ""
    )
    return {
        "document_id": document_id,
        "chunk_id": str(chunk.get("id") or chunk.get("chunk_id") or ""),
        "page": chunk.get("page"),
        "section": chunk.get("heading") or chunk.get("section") or "",
        "quote_snippet": str(
            chunk.get("quote_snippet")
            or chunk.get("snippet")
            or chunk.get("text")
            or ""
        )[:360],
        "confidence": confidence,
    }


def _token_terms(value: Any) -> set[str]:
    text = str(value or "").lower()
    terms = set(re.findall(r"[a-z0-9][a-z0-9_-]{2,}", text))
    stop_words = {
        "and",
        "are",
        "for",
        "from",
        "into",
        "that",
        "the",
        "this",
        "with",
        "will",
        "your",
    }
    return {term for term in terms if term not in stop_words}


def _source_reconciliation_refs_by_node(
    graph: dict[str, Any],
    document: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    chunks = document.get("chunks", []) if isinstance(document.get("chunks"), list) else []
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    best_refs: dict[str, tuple[float, dict[str, Any]]] = {}
    normalized_chunks = [chunk for chunk in chunks if isinstance(chunk, dict)]
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        node_terms = _token_terms(
            " ".join(
                [
                    str(node.get("title") or ""),
                    str(node.get("summary") or ""),
                    str(node.get("body") or ""),
                    str(node.get("node_type") or ""),
                ]
            )
        )
        if not node_terms:
            continue
        for chunk in normalized_chunks:
            chunk_terms = _token_terms(
                " ".join(
                    [
                        str(chunk.get("heading") or chunk.get("section") or ""),
                        str(chunk.get("snippet") or chunk.get("text") or ""),
                    ]
                )
            )
            if not chunk_terms:
                continue
            overlap = len(node_terms & chunk_terms)
            if overlap == 0:
                continue
            score = overlap / max(len(node_terms), 1)
            if overlap >= 2 or score >= 0.34:
                confidence = "high" if score >= 0.6 else "medium"
                current = best_refs.get(node_id)
                if current and current[0] >= score:
                    continue
                best_refs[node_id] = (
                    score,
                    _source_ref_from_chunk(document, chunk, confidence),
                )
    return {node_id: source_ref for node_id, (_, source_ref) in best_refs.items()}


def _source_library_gaps(
    source_library: dict[str, Any],
    scoped_graph: dict[str, Any],
) -> dict[str, Any]:
    documents = source_library.get("documents", []) if isinstance(source_library, dict) else []
    document_gaps = []
    if isinstance(documents, list):
        for document in documents:
            if not isinstance(document, dict):
                continue
            coverage = document.get("coverage", {}) if isinstance(document.get("coverage"), dict) else {}
            total_chunks = int(coverage.get("total_chunks") or document.get("chunk_count") or 0)
            cited_chunks = int(coverage.get("cited_chunks") or 0)
            if total_chunks and cited_chunks < total_chunks:
                document_gaps.append(
                    {
                        "document_id": document.get("id") or document.get("document_id") or "",
                        "filename": document.get("filename") or "",
                        "uncited_chunks": total_chunks - cited_chunks,
                        "total_chunks": total_chunks,
                    }
                )
    uncited_nodes = [
        {
            "node_id": node.get("id", ""),
            "title": node.get("title", ""),
            "status": node.get("status", ""),
        }
        for node in scoped_graph.get("nodes", [])
        if isinstance(node, dict)
        and node.get("node_type") != "reference"
        and not node.get("source_refs")
    ]
    failures = source_library.get("failures", []) if isinstance(source_library, dict) and isinstance(source_library.get("failures"), list) else []
    return {
        "documents_with_uncited_chunks": document_gaps,
        "uncited_graph_nodes": uncited_nodes,
        "source_failures": deepcopy(failures),
    }


def _draft_session_source_state(session: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(session, dict):
        return {}
    revisions = session.get("revisions", []) if isinstance(session.get("revisions"), list) else []
    latest = revisions[-1] if revisions and isinstance(revisions[-1], dict) else {}
    return {
        "session_id": session.get("session_id", ""),
        "status": session.get("status", ""),
        "prompt_history": session.get("prompt_history", [])[-5:] if isinstance(session.get("prompt_history"), list) else [],
        "known_source_refs": session.get("source_refs", []) if isinstance(session.get("source_refs"), list) else [],
        "latest_revision": {
            "revision_id": latest.get("revision_id", ""),
            "draft_nodes": latest.get("draft_nodes", []) if isinstance(latest.get("draft_nodes"), list) else [],
            "draft_annotations": latest.get("draft_annotations", []) if isinstance(latest.get("draft_annotations"), list) else [],
            "validation_report": latest.get("validation_report", {}) if isinstance(latest.get("validation_report"), dict) else {},
        },
    }


def _source_context_metadata(source_context: dict[str, Any]) -> dict[str, Any]:
    gaps = source_context.get("source_library_gaps", {}) if isinstance(source_context, dict) else {}
    return {
        "scope_type": source_context.get("scope", {}).get("type", ""),
        "source_context_mode": source_context.get("source_context_mode", "none"),
        "source_ref_count": len(source_context.get("source_refs", [])),
        "source_chunk_count": len(source_context.get("source_chunks", [])),
        "source_chunks_included": source_context.get("source_chunks_included", len(source_context.get("source_chunks", []))),
        "source_refs_included": source_context.get("source_refs_included", len(source_context.get("source_refs", []))),
        "source_context_truncated": bool(source_context.get("source_context_truncated")),
        "uploaded_source_chunk_count": len(source_context.get("uploaded_source_chunks", [])),
        "documents_with_uncited_chunks": len(gaps.get("documents_with_uncited_chunks", [])) if isinstance(gaps, dict) else 0,
        "uncited_graph_nodes": len(gaps.get("uncited_graph_nodes", [])) if isinstance(gaps, dict) else 0,
    }


def _source_context_budget_metadata(source_context: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(source_context, dict):
        return {
            "source_context_mode": "none",
            "source_chunks_included": 0,
            "source_refs_included": 0,
            "source_context_truncated": False,
        }
    return {
        "source_context_mode": str(source_context.get("source_context_mode") or "none"),
        "source_chunks_included": int(source_context.get("source_chunks_included") or 0),
        "source_refs_included": int(source_context.get("source_refs_included") or 0),
        "source_context_truncated": bool(source_context.get("source_context_truncated")),
    }


def _draft_generation_metadata(
    result: dict[str, Any],
    classification: dict[str, Any],
    decision: Any,
    policy: str,
) -> dict[str, Any]:
    return {
        "ai_draft_session_contract_version": AI_DRAFT_SESSION_CONTRACT_VERSION,
        "canonical": False,
        "preview_mode": "responses_structured_draft",
        "provider": result.get("provider", "unknown"),
        "actual_model": result.get("actual_model") or decision.model,
        "model": result.get("actual_model") or decision.model,
        "model_tier": decision.tier,
        "model_policy": policy,
        "model_reason": decision.reason,
        "intent": classification["intent"],
        "capability": classification["capability"],
        "output_shape": result.get("output_shape") or classification["output_shape"],
        "requested_artifact_types": classification.get("requested_artifact_types", []),
        "registered_artifact_types": classification.get("registered_artifact_types", registered_artifact_types()),
        "artifact_registry_version": ARTIFACT_REGISTRY_VERSION,
        "risk": classification["risk"],
        "usage": result.get("usage", {}) if isinstance(result.get("usage"), dict) else {},
        **_flat_usage_metadata(result.get("usage", {}) if isinstance(result.get("usage"), dict) else {}),
    }


def _normalize_generation_usage(
    usage: dict[str, Any] | None,
    *,
    model: str,
    provider: str,
) -> dict[str, Any]:
    if not isinstance(usage, dict):
        usage = {}
    input_tokens = _positive_int(usage.get("input_tokens") or usage.get("prompt_tokens"))
    output_tokens = _positive_int(usage.get("output_tokens") or usage.get("completion_tokens"))
    total_tokens = _positive_int(usage.get("total_tokens")) or input_tokens + output_tokens
    normalized = {
        "model": str(model or ""),
        "provider": str(provider or ""),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }
    normalized = {key: value for key, value in normalized.items() if value not in ("", 0)}
    cost = _estimate_generation_cost_usd(normalized)
    if cost is not None:
        normalized["estimated_cost_usd"] = f"${cost:.4f}"
        normalized["cost_source"] = "OPENAI_PRICING_PER_1M_JSON"
    elif total_tokens:
        normalized["cost_source"] = "token_usage_only"
    return normalized


def _positive_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    try:
        return max(0, int(float(str(value))))
    except (TypeError, ValueError):
        return 0


def _estimate_generation_cost_usd(usage: dict[str, Any]) -> float | None:
    pricing = get_setting("OPENAI_PRICING_PER_1M_JSON")
    if not pricing:
        return None
    try:
        table = json.loads(pricing)
    except json.JSONDecodeError:
        return None
    if not isinstance(table, dict):
        return None
    model = str(usage.get("model") or "")
    rates = table.get(model) or table.get(model.split("-")[0]) or table.get("default")
    if not isinstance(rates, dict):
        return None
    input_rate = _float_rate(rates.get("input") or rates.get("input_per_1m"))
    output_rate = _float_rate(rates.get("output") or rates.get("output_per_1m"))
    if input_rate is None and output_rate is None:
        total_rate = _float_rate(rates.get("total") or rates.get("total_per_1m"))
        if total_rate is None:
            return None
        return (int(usage.get("total_tokens") or 0) / 1_000_000) * total_rate
    return (
        (int(usage.get("input_tokens") or 0) / 1_000_000) * (input_rate or 0)
        + (int(usage.get("output_tokens") or 0) / 1_000_000) * (output_rate or 0)
    )


def _float_rate(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _flat_usage_metadata(usage: dict[str, Any]) -> dict[str, Any]:
    if not usage:
        return {}
    flattened = {
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "estimated_tokens": usage.get("total_tokens"),
        "estimated_cost_usd": usage.get("estimated_cost_usd"),
        "usage_cost_source": usage.get("cost_source"),
    }
    return {key: value for key, value in flattened.items() if value not in (None, "", 0)}


def _model_from_raw_response(raw_response: Any) -> str:
    if isinstance(raw_response, dict):
        value = raw_response.get("model")
        return str(value) if value else ""
    value = getattr(raw_response, "model", "")
    return str(value) if value else ""


def _workspace_id(graph: dict[str, Any]) -> str:
    workspace = graph.get("workspace", {}) if isinstance(graph, dict) else {}
    return str(workspace.get("id") or graph.get("workspace_id") or "")


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
