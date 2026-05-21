import json
import time
import traceback
from typing import Any, Callable

from fastapi import APIRouter, HTTPException

from ai_helpers import (
    accept_ai_draft_revision,
    add_source_to_ai_draft_session,
    append_ai_draft_revision,
    build_ai_action_run,
    build_ai_draft_revision,
    build_ai_draft_session,
    discard_ai_draft_session,
    generate_ai_action_preview,
    generate_ai_draft_session_with_provider,
    generate_node_info_message_with_provider,
    normalize_ai_draft_scope,
    revise_ai_draft_session_with_provider,
    validate_ai_draft_session,
)
from config import MissingConfigurationError, configuration_http_error
from export.workspace_graph import build_workspace_graph
from graph.schemas import GraphSchemaError


def create_ai_draft_router(
    *,
    get_workspace_graph_or_404: Callable[[str], dict],
    get_workspace_flow_or_404: Callable[[str], dict],
    get_source_components: Callable[[str], list[dict]],
    save_ai_draft_session: Callable[[dict], dict],
    get_ai_draft_session_or_404: Callable[[str, str], dict],
    list_ai_draft_sessions_for_workspace: Callable[[str], list[dict]],
    persist_flow_snapshot: Callable[[str, dict], None],
    query_with_workspace_brief: Callable[[str, dict | None], str],
    query_with_follow_up_memory: Callable[[str, dict[str, Any] | None], str],
) -> APIRouter:
    router = APIRouter()

    def summarize_ai_usage_for_workspace(flow_id: str) -> dict:
        sessions = list_ai_draft_sessions_for_workspace(flow_id)
        totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        by_session = []
        for session in sessions:
            session_total = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
            revision_usages = []
            for revision in session.get("revisions", []):
                usage = _ai_usage_from_metadata(revision.get("metadata"))
                if not usage.get("total_tokens"):
                    continue
                revision_usages.append(
                    {
                        "revision_id": revision.get("revision_id", ""),
                        "created_at": revision.get("created_at", ""),
                        "model": revision.get("model") or revision.get("metadata", {}).get("model", ""),
                        **usage,
                    }
                )
                session_total = _add_ai_usage(session_total, usage)
            if not revision_usages:
                session_total = _ai_usage_from_metadata(session.get("metadata"))
            totals = _add_ai_usage(totals, session_total)
            by_session.append(
                {
                    "session_id": session.get("session_id", ""),
                    "status": session.get("status", ""),
                    "selected_model": session.get("selected_model", ""),
                    "created_at": session.get("created_at", ""),
                    **session_total,
                    "revisions": revision_usages,
                }
            )
        return {
            "workspace_id": flow_id,
            **totals,
            "session_count": len(sessions),
            "sessions": by_session,
        }

    def requested_prompt(request: dict[str, Any]) -> str:
        prompt_with_brief = query_with_workspace_brief(
            request.get("prompt") or request.get("custom_prompt") or "",
            request.get("workspace_brief")
            if isinstance(request.get("workspace_brief"), dict)
            else (request.get("metadata") or {}).get("workspace_brief")
            if isinstance(request.get("metadata"), dict)
            else None,
        )
        return query_with_follow_up_memory(prompt_with_brief, request)

    def draft_revision_from_request(session: dict, graph: dict, request: dict[str, Any]) -> dict:
        if has_client_supplied_draft(request):
            return build_ai_draft_revision(
                session=session,
                prompt=request.get("prompt") or request.get("custom_prompt") or "",
                draft_nodes=request.get("draft_nodes") or [],
                draft_edges=request.get("draft_edges") or [],
                draft_annotations=request.get("draft_annotations") or [],
                draft_items=request.get("draft_items"),
                generated_artifacts=request.get("generated_artifacts") or [],
                model=request.get("model") or session.get("selected_model", ""),
                metadata=request.get("metadata") if isinstance(request.get("metadata"), dict) else {},
            )

        preview = generate_ai_action_preview(
            graph,
            workspace_id=session["workspace_id"],
            role=request.get("role") or session.get("role") or "Custom",
            action=request.get("action") or "custom_prompt",
            scope=session.get("scope") or {"type": "workspace"},
            custom_prompt=requested_prompt(request),
            created_by=request.get("created_by") or "user",
            model=request.get("model"),
        )
        return build_ai_draft_revision(
            session=session,
            prompt=request.get("prompt") or request.get("custom_prompt") or "",
            draft_nodes=preview.get("draft_nodes", []),
            draft_edges=preview.get("draft_edges", []),
            draft_annotations=preview.get("draft_annotations", []),
            generated_artifacts=preview.get("generated_artifacts", []),
            model=preview.get("metadata", {}).get("model", ""),
            validation_report=preview.get("validation_report"),
            metadata={
                "ai_action_id": preview.get("ai_action_id", ""),
                "model_reason": preview.get("metadata", {}).get("model_reason", ""),
                "preview_mode": preview.get("metadata", {}).get("preview_mode", ""),
                "output_shape": (request.get("metadata") or {}).get("output_shape", "")
                if isinstance(request.get("metadata"), dict)
                else "",
                "requested_visual": (request.get("metadata") or {}).get("requested_visual", "")
                if isinstance(request.get("metadata"), dict)
                else "",
            },
        )

    def draft_request_debug_summary(request: dict[str, Any], scope: dict[str, Any] | None = None) -> dict[str, Any]:
        prompt = requested_prompt(request)
        desired_outputs = requested_desired_outputs(request)
        source_chunks = requested_source_chunks(request)
        source_refs = request.get("source_refs") if isinstance(request.get("source_refs"), list) else []
        normalized_scope = scope or (
            request.get("scope") if isinstance(request.get("scope"), dict) else {"type": "workspace"}
        )
        return {
            "role": request.get("role") or "Ask AI",
            "action": request.get("action") or request.get("intent") or "custom_prompt",
            "scope_type": normalized_scope.get("type", "workspace"),
            "desired_outputs": desired_outputs,
            "model": request.get("model") or "auto",
            "model_policy": requested_model_policy(request) or "balanced",
            "prompt_chars": len(prompt or ""),
            "source_chunks": len(source_chunks),
            "source_refs": len(source_refs),
            "client_supplied_draft": has_client_supplied_draft(request),
        }

    @router.post("/api/workspaces/{flow_id}/ai/draft-sessions")
    def create_ai_draft_session(flow_id: str, request: dict[str, Any] | None = None):
        started_at = time.perf_counter()
        request = request or {}
        graph_started_at = time.perf_counter()
        graph = get_workspace_graph_or_404(flow_id)
        graph_elapsed_ms = (time.perf_counter() - graph_started_at) * 1000
        scope = normalize_ai_draft_scope(request.get("scope") if isinstance(request.get("scope"), dict) else {"type": "workspace"})
        request_summary = draft_request_debug_summary(request, scope)
        if not has_client_supplied_draft(request):
            try:
                generation_started_at = time.perf_counter()
                generated_session = generate_ai_draft_session_with_provider(
                    graph,
                    workspace_id=flow_id,
                    prompt=requested_prompt(request),
                    display_prompt=display_prompt(request),
                    scope=scope,
                    role=request.get("role") or "Ask AI",
                    model_policy=requested_model_policy(request),
                    model=requested_model(request),
                    desired_outputs=requested_desired_outputs(request),
                    source_chunks=requested_source_chunks(request),
                    metadata=request.get("metadata") if isinstance(request.get("metadata"), dict) else {},
                )
                generated_session["ai_action_run"] = build_ai_action_run(
                    workspace_id=flow_id,
                    scope=scope if scope.get("type") in {"workspace", "branch", "node"} else {"type": "workspace"},
                    role=request.get("role") or "Ask AI",
                    action=request.get("action") or "custom_prompt",
                    custom_prompt=request.get("prompt") or request.get("custom_prompt"),
                    input_source_refs=generated_session.get("source_refs") or graph.get("source_refs") or [],
                    created_by=request.get("created_by") or "user",
                    generated_node_ids=[
                        node.get("id", "")
                        for node in generated_session.get("revisions", [{}])[-1].get("draft_nodes", [])
                        if isinstance(node, dict)
                    ],
                )
                metadata = request.get("metadata") if isinstance(request.get("metadata"), dict) else {}
                if metadata:
                    generated_session.setdefault("metadata", {}).update(metadata)
                generation_elapsed_ms = (time.perf_counter() - generation_started_at) * 1000
                save_started_at = time.perf_counter()
                saved_session = save_ai_draft_session(validate_ai_draft_session(generated_session))
                save_elapsed_ms = (time.perf_counter() - save_started_at) * 1000
                print_ai_draft_debug(
                    flow_id=flow_id,
                    status_label="generated",
                    started_at=started_at,
                    graph_elapsed_ms=graph_elapsed_ms,
                    generation_elapsed_ms=generation_elapsed_ms,
                    save_elapsed_ms=save_elapsed_ms,
                    request_summary=request_summary,
                    session=saved_session,
                )
                return saved_session
            except MissingConfigurationError as exc:
                raise configuration_http_error(exc) from exc
            except GraphSchemaError as exc:
                print("AI draft generation schema validation failed:", json.dumps(exc.errors, indent=2))
                raise HTTPException(
                    status_code=422,
                    detail={"message": "AI draft generation failed schema validation.", "errors": exc.errors},
                ) from exc
            except Exception as exc:
                traceback.print_exc()
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "AI draft generation failed while calling the model provider.",
                        "error_type": exc.__class__.__name__,
                        "error": str(exc),
                    },
                ) from exc

        action_run = build_ai_action_run(
            workspace_id=flow_id,
            scope=scope if scope.get("type") in {"workspace", "branch", "node"} else {"type": "workspace"},
            role=request.get("role") or "Custom",
            action=request.get("action") or "custom_prompt",
            custom_prompt=request.get("prompt") or request.get("custom_prompt"),
            input_source_refs=graph.get("source_refs") or [],
            created_by=request.get("created_by") or "user",
        )
        session = build_ai_draft_session(
            workspace_id=flow_id,
            prompt=request.get("prompt") or request.get("custom_prompt") or "",
            scope=scope,
            role=request.get("role") or "Custom",
            intent=request.get("intent") or request.get("action") or "custom_prompt",
            model_policy=request.get("model_policy") if isinstance(request.get("model_policy"), dict) else {},
            selected_model=request.get("model") or "",
            model_reason=request.get("model_reason") or "",
            source_refs=graph.get("source_refs") or [],
            ai_action_run=action_run,
            created_by=request.get("created_by") or "user",
            metadata=request.get("metadata") if isinstance(request.get("metadata"), dict) else {},
        )
        revision = draft_revision_from_request(session, graph, request)
        session = append_ai_draft_revision(
            session,
            revision,
            prompt=request.get("prompt") or request.get("custom_prompt") or "",
            created_by=request.get("created_by") or "user",
        )
        if revision.get("model"):
            session["selected_model"] = revision["model"]
        if revision.get("metadata", {}).get("model_reason"):
            session["model_reason"] = revision["metadata"]["model_reason"]
        save_started_at = time.perf_counter()
        saved_session = save_ai_draft_session(session)
        save_elapsed_ms = (time.perf_counter() - save_started_at) * 1000
        print_ai_draft_debug(
            flow_id=flow_id,
            status_label="client_supplied",
            started_at=started_at,
            graph_elapsed_ms=graph_elapsed_ms,
            generation_elapsed_ms=0,
            save_elapsed_ms=save_elapsed_ms,
            request_summary=request_summary,
            session=saved_session,
        )
        return saved_session

    @router.post("/api/workspaces/{flow_id}/ai/node-message")
    def create_node_info_message(flow_id: str, request: dict[str, Any] | None = None):
        request = request or {}
        graph = get_workspace_graph_or_404(flow_id)
        scope = normalize_ai_draft_scope(request.get("scope") if isinstance(request.get("scope"), dict) else {"type": "workspace"})
        try:
            return generate_node_info_message_with_provider(
                graph,
                prompt=requested_prompt(request),
                scope=scope,
                role=request.get("role") or "Ask AI",
                model_policy=requested_model_policy(request),
                model=requested_model(request),
                source_chunks=requested_source_chunks(request),
                message_history=request.get("message_history") if isinstance(request.get("message_history"), list) else [],
                metadata=request.get("metadata") if isinstance(request.get("metadata"), dict) else {},
            )
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc) from exc
        except Exception as exc:
            traceback.print_exc()
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "AI node message failed while calling the model provider.",
                    "error_type": exc.__class__.__name__,
                    "error": str(exc),
                },
            ) from exc

    @router.get("/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}")
    def get_ai_draft_session(flow_id: str, session_id: str):
        return get_ai_draft_session_or_404(flow_id, session_id)

    @router.get("/api/workspaces/{flow_id}/ai/usage")
    def get_workspace_ai_usage(flow_id: str):
        get_workspace_graph_or_404(flow_id)
        return summarize_ai_usage_for_workspace(flow_id)

    @router.post("/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}/revisions")
    def create_ai_draft_revision(flow_id: str, session_id: str, request: dict[str, Any] | None = None):
        request = request or {}
        session = get_ai_draft_session_or_404(flow_id, session_id)
        if session.get("status") != "drafting":
            raise HTTPException(status_code=409, detail="Only active draft sessions can be revised.")
        graph = get_workspace_graph_or_404(flow_id)
        if not has_client_supplied_draft(request):
            try:
                session = revise_ai_draft_session_with_provider(
                    session,
                    graph,
                    prompt=requested_prompt(request),
                    display_prompt=display_prompt(request),
                    model_policy=requested_model_policy(request),
                    model=requested_model(request),
                    desired_outputs=requested_desired_outputs(request),
                    source_chunks=requested_source_chunks(request),
                )
                metadata = request.get("metadata") if isinstance(request.get("metadata"), dict) else {}
                if metadata:
                    session.setdefault("metadata", {}).update(metadata)
                return save_ai_draft_session(session)
            except MissingConfigurationError as exc:
                raise configuration_http_error(exc) from exc
            except GraphSchemaError as exc:
                raise HTTPException(
                    status_code=422,
                    detail={"message": "AI draft revision failed schema validation.", "errors": exc.errors},
                ) from exc
            except Exception as exc:
                traceback.print_exc()
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "AI draft revision failed while calling the model provider.",
                        "error_type": exc.__class__.__name__,
                        "error": str(exc),
                    },
                ) from exc

        revision = draft_revision_from_request(session, graph, request)
        session = append_ai_draft_revision(
            session,
            revision,
            prompt=request.get("prompt") or request.get("custom_prompt") or "",
            created_by=request.get("created_by") or "user",
        )
        if revision.get("model"):
            session["selected_model"] = revision["model"]
        if revision.get("metadata", {}).get("model_reason"):
            session["model_reason"] = revision["metadata"]["model_reason"]
        return save_ai_draft_session(session)

    @router.post("/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}/sources")
    def add_ai_draft_session_source(flow_id: str, session_id: str, request: dict[str, Any] | None = None):
        request = request or {}
        session = get_ai_draft_session_or_404(flow_id, session_id)
        if session.get("status") != "drafting":
            raise HTTPException(status_code=409, detail="Only active draft sessions can add sources.")
        source_chunks = request.get("source_chunks")
        if not isinstance(source_chunks, list):
            source_chunks = []
        graph = get_workspace_graph_or_404(flow_id)
        if request.get("source_id") and not source_chunks:
            source_id = str(request.get("source_id"))
            source_library = graph.get("source_library", {}) if isinstance(graph.get("source_library"), dict) else {}
            for document in source_library.get("documents", []) if isinstance(source_library.get("documents"), list) else []:
                if not isinstance(document, dict):
                    continue
                if str(document.get("id") or document.get("document_id") or "") != source_id:
                    continue
                source_chunks = [
                    {
                        **chunk,
                        "document_id": source_id,
                        "source_ref": {
                            "document_id": source_id,
                            "chunk_id": chunk.get("id", ""),
                            "page": chunk.get("page"),
                            "section": chunk.get("heading", ""),
                            "quote_snippet": chunk.get("snippet", ""),
                            "confidence": "medium",
                        },
                    }
                    for chunk in document.get("chunks", [])
                    if isinstance(chunk, dict)
                ]
                break
        try:
            session = add_source_to_ai_draft_session(
                session,
                graph,
                source_chunks=source_chunks,
                prompt=request.get("prompt"),
                model_policy=request.get("model_policy"),
                model=request.get("model"),
            )
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc) from exc
        except GraphSchemaError as exc:
            raise HTTPException(
                status_code=422,
                detail={"message": "AI draft source reconciliation failed schema validation.", "errors": exc.errors},
            ) from exc
        return save_ai_draft_session(session)

    @router.post("/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}/discard")
    def discard_ai_draft_session_endpoint(flow_id: str, session_id: str, request: dict[str, Any] | None = None):
        request = request or {}
        session = get_ai_draft_session_or_404(flow_id, session_id)
        session = discard_ai_draft_session(
            session,
            discarded_by=request.get("discarded_by") or request.get("created_by") or "user",
        )
        return save_ai_draft_session(session)

    @router.post("/api/workspaces/{flow_id}/ai/draft-sessions/{session_id}/accept")
    def accept_ai_draft_session_endpoint(flow_id: str, session_id: str, request: dict[str, Any] | None = None):
        request = request or {}
        session = get_ai_draft_session_or_404(flow_id, session_id)
        if session.get("status") != "drafting":
            raise HTTPException(status_code=409, detail="Only active draft sessions can be accepted.")
        flow = get_workspace_flow_or_404(flow_id)
        graph = build_workspace_graph(flow, source_components=get_source_components(flow_id))
        previous_flow_json = flow.get("flow_json", "")
        try:
            accepted_graph, session, accept_result = accept_ai_draft_revision(
                graph,
                session,
                revision_id=request.get("revision_id"),
                accept_mode=request.get("mode") or request.get("accept_mode") or "append",
                selected_item_ids=request.get("selected_item_ids") if isinstance(request.get("selected_item_ids"), list) else [],
                accepted_by=request.get("accepted_by") or request.get("created_by") or "user",
            )
        except GraphSchemaError as exc:
            raise HTTPException(
                status_code=422,
                detail={"message": "AI draft accept failed schema validation.", "errors": exc.errors},
            ) from exc
        accept_result.setdefault("metadata", {})["undo_snapshot"] = previous_flow_json
        if session.get("accept_history"):
            session["accept_history"][-1].setdefault("metadata", {})["undo_snapshot"] = previous_flow_json
        snapshot = append_accepted_graph_to_flow_snapshot(flow, accept_result, accepted_graph)
        persist_flow_snapshot(flow_id, snapshot)
        save_ai_draft_session(session)
        return {
            **accept_result,
            "graph": snapshot,
            "session": session,
            "accept_result": accept_result,
        }

    return router


def _ai_usage_from_metadata(metadata: dict | None) -> dict:
    if not isinstance(metadata, dict):
        return {}
    usage = metadata.get("usage") if isinstance(metadata.get("usage"), dict) else metadata
    return {
        "input_tokens": _int_ai_usage(usage.get("input_tokens")),
        "output_tokens": _int_ai_usage(usage.get("output_tokens")),
        "total_tokens": _int_ai_usage(usage.get("total_tokens") or usage.get("estimated_tokens")),
        "estimated_cost_usd": usage.get("estimated_cost_usd"),
        "cost_source": usage.get("cost_source") or metadata.get("usage_cost_source"),
    }


def _int_ai_usage(value) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _add_ai_usage(left: dict, right: dict) -> dict:
    result = {
        "input_tokens": int(left.get("input_tokens") or 0) + int(right.get("input_tokens") or 0),
        "output_tokens": int(left.get("output_tokens") or 0) + int(right.get("output_tokens") or 0),
        "total_tokens": int(left.get("total_tokens") or 0) + int(right.get("total_tokens") or 0),
    }
    costs = []
    for value in (left.get("estimated_cost_usd"), right.get("estimated_cost_usd")):
        if isinstance(value, str) and value.startswith("$"):
            try:
                costs.append(float(value[1:]))
            except ValueError:
                pass
    if costs:
        result["estimated_cost_usd"] = f"${sum(costs):.4f}"
    return result


def has_client_supplied_draft(request: dict[str, Any]) -> bool:
    return (
        isinstance(request.get("draft_nodes"), list)
        or isinstance(request.get("draft_items"), list)
        or isinstance(request.get("generated_artifacts"), list)
    )


def requested_desired_outputs(request: dict[str, Any]) -> list[str] | None:
    desired_outputs = request.get("desired_outputs")
    if isinstance(desired_outputs, list):
        return [str(output) for output in desired_outputs if str(output).strip()]
    return None


def requested_source_chunks(request: dict[str, Any]) -> list[dict[str, Any]]:
    source_chunks = request.get("source_chunks")
    if not isinstance(source_chunks, list):
        return []
    return [chunk for chunk in source_chunks if isinstance(chunk, dict)]


def display_prompt(request: dict[str, Any]) -> str:
    return str(request.get("prompt") or request.get("custom_prompt") or "")


def requested_model_policy(request: dict[str, Any]) -> str | None:
    policy = request.get("model_policy")
    if isinstance(policy, str):
        return policy
    if isinstance(policy, dict):
        value = policy.get("policy")
        return str(value) if value else None
    return None


def requested_model(request: dict[str, Any]) -> str | None:
    model = request.get("model")
    if not isinstance(model, str):
        return None
    normalized = model.strip()
    if not normalized or normalized.lower() == "auto":
        return None
    return normalized


def print_ai_draft_debug(
    *,
    flow_id: str,
    status_label: str,
    started_at: float,
    graph_elapsed_ms: float,
    generation_elapsed_ms: float,
    save_elapsed_ms: float,
    request_summary: dict[str, Any],
    session: dict[str, Any] | None = None,
) -> None:
    payload = {
        "flow_id": flow_id,
        "status": status_label,
        "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 1),
        "graph_ms": round(graph_elapsed_ms, 1),
        "generation_ms": round(generation_elapsed_ms, 1),
        "save_ms": round(save_elapsed_ms, 1),
        "request": request_summary,
    }
    if session is not None:
        payload["session"] = ai_draft_session_debug_summary(session)
    print(f"[ai-draft-session] {json.dumps(payload, separators=(',', ':'))}")


def ai_draft_session_debug_summary(session: dict[str, Any]) -> dict[str, Any]:
    revisions = session.get("revisions") if isinstance(session.get("revisions"), list) else []
    latest_revision = revisions[-1] if revisions and isinstance(revisions[-1], dict) else {}
    metadata = latest_revision.get("metadata") if isinstance(latest_revision.get("metadata"), dict) else {}
    return {
        "session_id": session.get("session_id", ""),
        "revision_id": latest_revision.get("revision_id", ""),
        "model": latest_revision.get("model") or session.get("selected_model") or metadata.get("actual_model") or "",
        "draft_nodes": len(latest_revision.get("draft_nodes", [])) if isinstance(latest_revision.get("draft_nodes"), list) else 0,
        "draft_edges": len(latest_revision.get("draft_edges", [])) if isinstance(latest_revision.get("draft_edges"), list) else 0,
        "draft_items": len(latest_revision.get("draft_items", [])) if isinstance(latest_revision.get("draft_items"), list) else 0,
        "generated_artifacts": len(latest_revision.get("generated_artifacts", [])) if isinstance(latest_revision.get("generated_artifacts"), list) else 0,
        "source_refs": len(session.get("source_refs", [])) if isinstance(session.get("source_refs"), list) else 0,
        "source_context_mode": metadata.get("source_context_mode", ""),
        "source_chunks_included": metadata.get("source_chunks_included", 0),
        "source_context_truncated": bool(metadata.get("source_context_truncated")),
        "input_tokens": metadata.get("input_tokens", 0),
        "output_tokens": metadata.get("output_tokens", 0),
        "total_tokens": metadata.get("total_tokens", 0),
    }


def append_accepted_graph_to_flow_snapshot(flow: dict, accept_result: dict, accepted_graph: dict) -> dict:
    snapshot = flow_snapshot(flow)
    node_lookup = {node.get("id"): node for node in accepted_graph.get("nodes", []) if isinstance(node, dict)}
    edge_lookup = {edge.get("id"): edge for edge in accepted_graph.get("edges", []) if isinstance(edge, dict)}
    existing_node_ids = {node.get("id") for node in snapshot.get("nodes", []) if isinstance(node, dict)}
    existing_edge_ids = {edge.get("id") for edge in snapshot.get("edges", []) if isinstance(edge, dict)}

    for operation in accept_result.get("patch_operations", []):
        if not isinstance(operation, dict):
            continue
        op = operation.get("op")
        if op == "remove_node":
            node_id = operation.get("node_id")
            snapshot["nodes"] = [
                node for node in snapshot.get("nodes", [])
                if not isinstance(node, dict) or node.get("id") != node_id
            ]
            existing_node_ids.discard(node_id)
            continue
        if op == "remove_edge":
            edge_id = operation.get("edge_id")
            snapshot["edges"] = [
                edge for edge in snapshot.get("edges", [])
                if not isinstance(edge, dict) or edge.get("id") != edge_id
            ]
            existing_edge_ids.discard(edge_id)
            continue
        if op == "update_node":
            node_id = operation.get("node_id")
            graph_node = node_lookup.get(node_id)
            if not graph_node:
                continue
            updated_node = react_node_from_graph_node(graph_node, len(snapshot.get("nodes", [])) + 1)
            if node_id not in existing_node_ids:
                snapshot["nodes"].append(updated_node)
                existing_node_ids.add(node_id)
                continue
            snapshot["nodes"] = [
                (
                    {
                        **node,
                        **updated_node,
                        "position": node.get("position") or updated_node.get("position"),
                    }
                    if isinstance(node, dict) and node.get("id") == node_id
                    else node
                )
                for node in snapshot.get("nodes", [])
            ]
            continue

    for index, node_id in enumerate(accept_result.get("accepted_node_ids", []), start=1):
        if node_id in existing_node_ids:
            continue
        node = node_lookup.get(node_id)
        if node:
            snapshot["nodes"].append(react_node_from_graph_node(node, index))
            existing_node_ids.add(node_id)
    for edge_id in accept_result.get("accepted_edge_ids", []):
        if edge_id in existing_edge_ids:
            continue
        edge = edge_lookup.get(edge_id)
        if edge:
            snapshot["edges"].append(react_edge_from_graph_edge(edge))
            existing_edge_ids.add(edge_id)
    snapshot["viewport"] = accepted_graph_focus_viewport(snapshot, accept_result.get("accepted_node_ids", []))
    return snapshot


def flow_snapshot(flow: dict) -> dict:
    try:
        snapshot = json.loads(flow.get("flow_json") or "{}")
    except json.JSONDecodeError:
        snapshot = {}
    if not isinstance(snapshot, dict):
        snapshot = {}
    snapshot.setdefault("nodes", [])
    snapshot.setdefault("edges", [])
    snapshot.setdefault("viewport", {})
    return snapshot


def react_node_from_graph_node(node: dict, index: int) -> dict:
    node_type = node.get("node_type") or "concept"
    title = str(node.get("title") or "")
    body = str(node.get("summary") or node.get("body") or "")
    source_refs = node.get("source_refs", [])
    if not isinstance(source_refs, list):
        source_refs = []
    external_refs = node.get("external_refs", {})
    if not isinstance(external_refs, (dict, list)):
        external_refs = {}
    metadata = node.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
    artifact_ids = node.get("artifact_ids", [])
    if not isinstance(artifact_ids, list):
        artifact_ids = []
    generated_artifacts = node.get("generated_artifacts", [])
    if not isinstance(generated_artifacts, list):
        generated_artifacts = []
    review_state = node.get("review_state", metadata.get("review_state", ""))
    artifact_type = node.get("artifact_type", metadata.get("artifact_type", ""))
    return {
        "id": node.get("id", ""),
        "type": "response",
        "position": metadata.get("position") or {"x": 120 + (index % 4) * 260, "y": 160 + index * 120},
        "data": {
            "title": title,
            "body": body,
            "summary": body,
            "summ": body,
            "node_type": node_type,
            "status": node.get("status", ""),
            "priority": node.get("priority", ""),
            "owner_id": node.get("owner_id", ""),
            "due_date": node.get("due_date", ""),
            "confidence": node.get("confidence"),
            "review_state": review_state,
            "artifact_type": artifact_type,
            "artifact_ids": artifact_ids,
            "generated_artifacts": generated_artifacts,
            "source_refs": source_refs,
            "external_refs": external_refs,
            "metadata": metadata,
            "manual": True,
            "display": {
                "collapsed": False,
                "layoutMode": metadata.get("layout_mode") or "vertical-children",
            },
            "data": {
                "title": title,
                "body": body,
                "summary": body,
                "summ": body or title,
                "query": "",
                "df": [],
                "graph": {},
                "source_refs": source_refs,
                "status": node.get("status", ""),
                "review_state": review_state,
                "artifact_type": artifact_type,
                "artifact_ids": artifact_ids,
                "generated_artifacts": generated_artifacts,
                "metadata": metadata,
            },
        },
        "deletable": True,
        "targetPosition": "left",
        "sourcePosition": "right",
    }


def react_edge_from_graph_edge(edge: dict) -> dict:
    metadata = edge.get("metadata", {}) if isinstance(edge.get("metadata"), dict) else {}
    relationship_type = edge.get("relationship_type", "contains")
    source_refs = edge.get("source_refs")
    if not isinstance(source_refs, list):
        source_refs = metadata.get("source_refs") if isinstance(metadata.get("source_refs"), list) else []
    source_signal = metadata.get("source_signal", edge.get("source_signal", ""))
    rationale = metadata.get("rationale", edge.get("rationale", ""))
    return {
        "id": edge.get("id", ""),
        "source": edge.get("source_node_id", ""),
        "target": edge.get("target_node_id", ""),
        "type": metadata.get("react_flow_type", ""),
        "animated": metadata.get("animated", False),
        "relationship_type": relationship_type,
        "confidence": metadata.get("confidence", edge.get("confidence", "")),
        "review_state": metadata.get("review_state", edge.get("review_state", "")),
        "source_refs": source_refs,
        "data": {
            "relationship_type": relationship_type,
            "confidence": metadata.get("confidence", edge.get("confidence", "")),
            "review_state": metadata.get("review_state", edge.get("review_state", "")),
            "source_signal": source_signal,
            "rationale": rationale,
            "assumptions": metadata.get("assumptions", []),
            "artifact_id": metadata.get("artifact_id", ""),
            "source_refs": source_refs,
        },
    }


def accepted_graph_focus_viewport(snapshot: dict, accepted_node_ids: list[str]) -> dict:
    accepted_ids = {str(node_id) for node_id in accepted_node_ids if str(node_id)}
    if not accepted_ids:
        return snapshot.get("viewport", {}) if isinstance(snapshot.get("viewport"), dict) else {}

    positions = []
    for node in snapshot.get("nodes", []):
        if not isinstance(node, dict) or str(node.get("id", "")) not in accepted_ids:
            continue
        position = node.get("position") if isinstance(node.get("position"), dict) else {}
        try:
            positions.append((float(position.get("x", 0)), float(position.get("y", 0))))
        except (TypeError, ValueError):
            continue

    if not positions:
        return snapshot.get("viewport", {}) if isinstance(snapshot.get("viewport"), dict) else {}

    min_x = min(position[0] for position in positions)
    max_x = max(position[0] for position in positions)
    min_y = min(position[1] for position in positions)
    max_y = max(position[1] for position in positions)
    width = max(max_x - min_x + 320, 320)
    height = max(max_y - min_y + 220, 220)
    zoom = min(1, max(0.65, min(1080 / width, 620 / height)))
    center_x = min_x + (max_x - min_x) / 2
    center_y = min_y + (max_y - min_y) / 2
    return {
        "x": round(640 - center_x * zoom, 2),
        "y": round(320 - center_y * zoom, 2),
        "zoom": round(zoom, 3),
    }
