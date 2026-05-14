from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from config import MissingConfigurationError, get_setting
from graph.schemas import GraphSchemaError


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
AI_HELPER_PREVIEW_CONTRACT_VERSION = "1"
HELPER_ACTIONS: dict[str, set[str]] = {
    "source_librarian": {"source_repair", "source_coverage"},
    "reviewer": {"missing_information", "sme_questions", "contradictions"},
    "project_planner": {"task_projection", "checklist_projection"},
    "integration_operator": {"handoff_readiness", "sync_issue_review"},
}
SCOPE_TYPES = {"workspace", "branch", "node", "source"}
AI_HELPER_PREVIEW_CONTRACT = f"""
Canonical AI helper preview contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- Top-level fields: preview_id, helper_id, action, scope, generated_by, preview_items, warnings, metadata.
- preview_items must be an array. Each item must include id, preview_type, node_id, title, rationale, confidence, source_refs, assumptions, and proposed_mutation.
- source_refs must be an array. If a proposed item is not source-backed, return source_refs: [] and add a plain-language assumption.
- proposed_mutation must be an object describing changes only. Do not rewrite the entire graph.
- Include metadata.ai_helper_preview_contract_version as "{AI_HELPER_PREVIEW_CONTRACT_VERSION}".
"""


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
    return {
        "model": model or get_setting("openai_default_model") or "gpt-5.5",
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
        "text": {"format": {"type": "json_object"}},
        "metadata": {
            "helper_id": helper_id,
            "action": action,
            "scope_type": normalized_scope.get("type", "workspace"),
            "node_count": len(graph.get("nodes", [])) if isinstance(graph, dict) else 0,
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
