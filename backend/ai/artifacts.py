from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from ai.schemas import (
    ARTIFACT_REGISTRY,
    ARTIFACT_REGISTRY_VERSION,
    AIDRAFT_SCOPE_TYPES,
    SOFTWARE_INVENTORY_ENTITY_TYPES,
)
from graph.ai_contract import validate_knowledge_graph_relationship_edge
from graph.schemas import GraphSchemaError
from graph.software_overlap_scoring import enrich_software_overlap_report


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
        "executive_brief": "executive_summary",
        "executive_summary": "executive_summary",
        "news_story": "news_article",
        "article": "news_article",
        "newsletter": "newsletter",
        "newsletter_update": "newsletter",
        "update_brief": "newsletter",
        "intranet_update": "newsletter",
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
        elif artifact_type == "source_repair":
            _validate_source_repair_artifact(item, path, errors)
        elif artifact_type == "team_roadmap":
            _validate_team_roadmap_artifact(item, path, errors)
        elif artifact_type == "implementation_handoff_package":
            _validate_handoff_artifact(item, path, errors)
        elif artifact_type == "executive_summary":
            _validate_executive_summary_artifact(item, path, errors)
        elif artifact_type == "news_article":
            _validate_news_article_artifact(item, path, errors)
        elif artifact_type == "newsletter":
            _validate_newsletter_artifact(item, path, errors)

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


def _coerce_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _clean_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    return [text] if text else []


def _coerce_row_indexes(value: Any) -> list[int]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    indexes: list[int] = []
    for item in values:
        try:
            index = int(item)
        except (TypeError, ValueError):
            continue
        if index not in indexes:
            indexes.append(index)
    return indexes


def _normalize_source_refs(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [deepcopy(ref) for ref in value if isinstance(ref, dict) and str(ref.get("document_id") or "").strip()]


def _evidence_target_id(
    value: dict[str, Any],
    *,
    key: str,
    artifact_id: str,
    index: int,
) -> str:
    for candidate in (
        value.get("evidence_item_id"),
        value.get("row_id"),
        value.get("path_id"),
        value.get("edge_id"),
        value.get("task_id"),
        value.get("finding_id"),
        value.get("id"),
    ):
        text = str(candidate or "").strip()
        if text:
            return text
    prefix = {
        "rows": "row",
        "data_rows": "row",
        "paths": "path",
        "edges": "edge",
        "relationship_edges": "edge",
        "findings": "finding",
        "tasks": "task",
        "checklist": "task",
    }.get(key, "item")
    return f"{artifact_id}_{prefix}_{index}"


def _normalize_evidence_target_item(
    value: Any,
    *,
    key: str,
    artifact_id: str,
    index: int,
) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    item = deepcopy(value)
    evidence_item_id = _evidence_target_id(item, key=key, artifact_id=artifact_id, index=index)
    source_refs = _normalize_source_refs(item.get("source_refs"))
    represented_row_indexes = _coerce_row_indexes(
        item.get("represented_row_indexes")
        if "represented_row_indexes" in item
        else item.get("representedRowIndexes")
        if "representedRowIndexes" in item
        else item.get("row_indexes")
        if "row_indexes" in item
        else item.get("rowIndexes")
        if "rowIndexes" in item
        else item.get("row_index")
    )
    artifact_ids = _clean_string_list(item.get("artifact_ids"))
    if not artifact_ids:
        artifact_ids = _clean_string_list(item.get("artifact_id"))
    if artifact_id and artifact_id not in artifact_ids:
        artifact_ids.insert(0, artifact_id)
    review_state = str(
        item.get("review_state")
        or item.get("evidence_status")
        or item.get("citation_status")
        or item.get("status")
        or ("source_backed" if source_refs else "needs_review")
    ).strip()

    item["evidence_item_id"] = evidence_item_id
    if key in {"rows", "data_rows"}:
        item["row_id"] = str(item.get("row_id") or evidence_item_id)
    item["represented_row_indexes"] = represented_row_indexes
    item["artifact_ids"] = artifact_ids
    item["source_refs"] = source_refs
    item["review_state"] = review_state or "needs_review"
    if item["review_state"] == "needs_review":
        item["status"] = "needs_review"
    return item


def _normalize_evidence_target_collection(data: dict[str, Any], key: str, *, artifact_id: str) -> None:
    values = data.get(key)
    if not isinstance(values, list):
        return
    normalized = [
        item
        for index, value in enumerate(values, start=1)
        if (item := _normalize_evidence_target_item(value, key=key, artifact_id=artifact_id, index=index))
    ]
    data[key] = normalized


def _normalize_flow_chart_step(value: Any, index: int, *, default_type: str = "process") -> dict[str, Any] | None:
    if not isinstance(value, dict):
        if isinstance(value, str) and value.strip():
            value = {"title": value}
        else:
            return None
    metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
    node_id = str(value.get("node_id") or value.get("node") or "").strip()
    if node_id:
        metadata.setdefault("node_id", node_id)
    step_type = str(
        value.get("step_type")
        or value.get("kind")
        or value.get("type")
        or value.get("node_type")
        or default_type
    )
    title = str(value.get("title") or value.get("label") or value.get("name") or f"Step {index}")
    return {
        "id": str(value.get("id") or node_id or f"step_{index}"),
        "title": title,
        "summary": value.get("summary") if isinstance(value.get("summary"), str) else value.get("description"),
        "step_type": step_type,
        "source_refs": deepcopy(value.get("source_refs", [])) if isinstance(value.get("source_refs"), list) else [],
        "assumptions": deepcopy(value.get("assumptions", [])) if isinstance(value.get("assumptions"), list) else [],
        "metadata": metadata,
    }


def _normalize_flow_chart_edge(value: Any, index: int, *, default_relationship: str = "next") -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
    label = str(
        value.get("label")
        or value.get("branch_label")
        or value.get("condition")
        or metadata.get("label")
        or metadata.get("branch_label")
        or metadata.get("condition")
        or ""
    ).strip()
    condition = str(value.get("condition") or metadata.get("condition") or "").strip()
    if condition:
        metadata.setdefault("condition", condition)
    if label:
        metadata.setdefault("branch_label", label)
    source = str(value.get("source_step_id") or value.get("source") or value.get("source_node_id") or "").strip()
    target = str(value.get("target_step_id") or value.get("target") or value.get("target_node_id") or "").strip()
    if not source or not target:
        return None
    relationship_type = str(value.get("relationship_type") or value.get("type") or default_relationship)
    return {
        "id": str(value.get("id") or f"flow_edge_{index}_{source}_{target}"),
        "source_step_id": source,
        "target_step_id": target,
        "label": label or None,
        "relationship_type": relationship_type,
        "metadata": metadata,
    }


def _normalize_flow_chart_data(data: Any) -> dict[str, Any]:
    data = data if isinstance(data, dict) else {}
    steps = [
        step
        for index, value in enumerate(
            [*_coerce_list(data.get("steps")), *_coerce_list(data.get("nodes"))],
            start=1,
        )
        if (step := _normalize_flow_chart_step(value, index))
    ]
    decisions = [
        step
        for index, value in enumerate(_coerce_list(data.get("decisions")), start=1)
        if (step := _normalize_flow_chart_step(value, index, default_type="decision"))
    ]
    edges = [
        edge
        for index, value in enumerate(_coerce_list(data.get("edges")), start=1)
        if (edge := _normalize_flow_chart_edge(value, index))
    ]
    dependency_start = len(edges) + 1
    for index, dependency in enumerate(_coerce_list(data.get("dependencies")), start=dependency_start):
        edge = _normalize_flow_chart_edge(dependency, index, default_relationship="dependency")
        if edge:
            edges.append(edge)
    return {
        **data,
        "steps": steps,
        "decisions": decisions,
        "edges": edges,
    }


def _validate_flow_chart_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = _normalize_flow_chart_data(item.get("data", {}))
    item["data"] = data
    if not (data.get("steps") or data.get("nodes") or data.get("decisions") or data.get("dependencies")):
        errors.append(f"{path}.data: flow_chart requires steps, nodes, decisions, or dependencies")

    validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
    issues = validation.get("issues") if isinstance(validation.get("issues"), list) else []
    decision_ids = {
        str(decision.get("id") or decision.get("node_id") or "").strip()
        for decision in data.get("decisions", [])
        if isinstance(decision, dict) and str(decision.get("id") or decision.get("node_id") or "").strip()
    }
    labeled_decision_edges: set[str] = set()

    edges = data.get("edges", [])
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            errors.append(f"{path}.data.edges.{index}: must be an object")
            continue
        metadata = edge.get("metadata") if isinstance(edge.get("metadata"), dict) else {}
        if not isinstance(edge.get("metadata"), dict):
            edge["metadata"] = metadata
        label = str(
            edge.get("label")
            or metadata.get("label")
            or metadata.get("branch_label")
            or metadata.get("condition")
            or ""
        ).strip()
        if label:
            edge["label"] = label

        source_id = str(edge.get("source_step_id") or edge.get("source") or "").strip()
        relationship_type = str(edge.get("relationship_type") or "").strip().lower().replace("_", "-")
        if source_id in decision_ids:
            if label:
                labeled_decision_edges.add(source_id)
            elif relationship_type in {"decision-path", "exception"}:
                issues.append(
                    f"{path}.data.edges.{index}: decision and exception paths should include label or metadata.branch_label"
                )

    for decision_id in sorted(decision_ids - labeled_decision_edges):
        issues.append(f"{path}.data.decisions: decision '{decision_id}' has no labeled outgoing path")

    if issues:
        validation["issues"] = issues
        validation["status"] = "needs_review"
        item["validation"] = validation


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


def _validate_source_repair_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not isinstance(data, dict):
        errors.append(f"{path}.data: source_repair requires a data object")
        return

    repair_keys = ("rows", "data_rows", "paths", "edges", "relationship_edges", "findings", "tasks", "checklist")
    for key in repair_keys:
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")
            continue
        _normalize_evidence_target_collection(
            data,
            key,
            artifact_id=str(item.get("id") or "source_repair"),
        )

    if not any(isinstance(data.get(key), list) and data.get(key) for key in repair_keys):
        errors.append(f"{path}.data: source_repair requires at least one repairable row, path, edge, finding, or task")

    validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
    issues = validation.get("issues") if isinstance(validation.get("issues"), list) else []
    item_needs_review = False
    for key in repair_keys:
        values = data.get(key)
        if not isinstance(values, list):
            continue
        for index, value in enumerate(values):
            if not isinstance(value, dict):
                continue
            if value.get("source_refs") and value.get("review_state") != "needs_review":
                continue
            value["review_state"] = "needs_review"
            value["status"] = "needs_review"
            item_needs_review = True
            issues.append(
                {
                    "code": "source_repair_target_needs_review",
                    "severity": "warning",
                    "message": "Repair target is missing source evidence or already needs review.",
                    "path": f"{path}.data.{key}.{index}",
                    "evidence_item_id": str(value.get("evidence_item_id") or ""),
                    "repaired": True,
                }
            )
    if item_needs_review:
        item["status"] = "needs_review"
        validation["status"] = "needs_review"
    if issues:
        validation["issues"] = issues
    item["data"] = data
    item["validation"] = validation


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


def _validate_executive_summary_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    if not isinstance(data.get("summary", ""), str):
        errors.append(f"{path}.data.summary: must be a string when provided")
    for key in ("key_points", "recommended_actions", "risks", "source_backed_appendix"):
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")
    if not str(data.get("summary") or "").strip() and not (
        isinstance(data.get("key_points"), list) and data.get("key_points")
    ):
        errors.append(f"{path}.data: executive_summary requires summary or key_points")
    _mark_unsourced_review_items(
        item,
        path,
        ("key_points", "recommended_actions", "risks"),
    )


def _validate_news_article_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    headline = str(data.get("headline") or data.get("title") or "").strip()
    if not headline:
        errors.append(f"{path}.data.headline: news_article requires a headline")
    for key in ("sections", "quotes", "fact_checks", "source_backed_appendix"):
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")
    has_body = bool(str(data.get("lede") or data.get("body") or "").strip())
    has_sections = isinstance(data.get("sections"), list) and bool(data.get("sections"))
    if not has_body and not has_sections:
        errors.append(f"{path}.data: news_article requires lede, body, or sections")
    _normalize_news_article_items(item, path)


def _validate_newsletter_artifact(item: dict[str, Any], path: str, errors: list[str]) -> None:
    data = item.get("data", {})
    title = str(data.get("title") or "").strip()
    if not title:
        errors.append(f"{path}.data.title: newsletter requires a title")
    for key in (
        "highlights",
        "sections",
        "upcoming",
        "risks",
        "decisions_needed",
        "visual_blocks",
        "source_backed_appendix",
    ):
        if key in data and not isinstance(data.get(key), list):
            errors.append(f"{path}.data.{key}: must be a list when provided")
    has_content = bool(str(data.get("opening_note") or "").strip()) or any(
        isinstance(data.get(key), list) and bool(data.get(key))
        for key in ("highlights", "sections", "upcoming")
    )
    if not has_content:
        errors.append(f"{path}.data: newsletter requires opening_note, highlights, sections, or upcoming")
    _normalize_news_article_items(
        item,
        path,
        section_keys=(
            "highlights",
            "sections",
            "upcoming",
            "risks",
            "decisions_needed",
            "visual_blocks",
            "source_backed_appendix",
        ),
        missing_source_message="Source evidence is missing for this newsletter item.",
        issue_code="newsletter_item_needs_review",
        issue_message="Newsletter item is missing source evidence and was marked needs_review.",
    )


def _normalize_news_article_items(
    item: dict[str, Any],
    path: str,
    *,
    section_keys: tuple[str, ...] = ("sections", "quotes", "fact_checks", "source_backed_appendix"),
    missing_source_message: str = "Source evidence is missing for this news article item.",
    issue_code: str = "news_article_item_needs_review",
    issue_message: str = "News article item is missing source evidence and was marked needs_review.",
) -> None:
    data = item.get("data", {}) if isinstance(item.get("data"), dict) else {}
    validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
    issues = validation.get("issues") if isinstance(validation.get("issues"), list) else []
    item_needs_review = False

    for key in section_keys:
        values = data.get(key)
        if not isinstance(values, list):
            if key == "source_backed_appendix":
                data[key] = []
            continue
        for index, value in enumerate(values):
            if not isinstance(value, dict):
                continue
            item_path = f"{path}.data.{key}.{index}"
            source_refs = value.get("source_refs", [])
            assumptions = value.get("assumptions", [])
            metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
            if not isinstance(source_refs, list):
                source_refs = []
            if not isinstance(assumptions, list):
                assumptions = []

            source_backed = any(
                isinstance(source_ref, dict)
                and str(source_ref.get("document_id") or "").strip()
                for source_ref in source_refs
            )
            explicit_review_state = str(
                value.get("review_state") or value.get("status") or ""
            ).strip()
            explicit_needs_review = explicit_review_state in {
                "needs_review",
                "review",
                "in_review",
                "rejected",
            } or value.get("needs_review") is True
            if source_backed:
                value["source_backed"] = True
                value["needs_review"] = explicit_needs_review
                value["review_state"] = explicit_review_state or "reviewed"
                value["status"] = "needs_review" if explicit_needs_review else "reviewed"
                value["source_signal"] = str(
                    value.get("source_signal")
                    or metadata.get("source_signal")
                    or "explicit_text"
                )
                metadata.setdefault("source_signal", value["source_signal"])
                metadata.setdefault(
                    "review_reason",
                    "Source reference supplied; reviewer marked item for review."
                    if explicit_needs_review
                    else "Source reference supplied.",
                )
                item_needs_review = item_needs_review or explicit_needs_review
            else:
                review_assumption = missing_source_message
                if not any(str(assumption).strip() for assumption in assumptions):
                    assumptions = [review_assumption]
                value["source_backed"] = False
                value["needs_review"] = True
                value["review_state"] = "needs_review"
                value["status"] = "needs_review"
                value["source_signal"] = str(
                    value.get("source_signal")
                    or metadata.get("source_signal")
                    or "missing_source_ref"
                )
                value.setdefault("rationale", review_assumption)
                metadata.setdefault("review_reason", review_assumption)
                metadata.setdefault("source_signal", value["source_signal"])
                item_needs_review = True
                issues.append(
                    {
                        "code": issue_code,
                        "severity": "warning",
                        "message": issue_message,
                        "path": item_path,
                        "repaired": True,
                    }
                )

            value["id"] = str(value.get("id") or f"{key}_{index + 1}")
            value["title"] = str(value.get("title") or value.get("label") or f"{key.replace('_', ' ').title()} {index + 1}")
            if "description" not in value:
                value["description"] = value.get("summary")
            if "content" not in value:
                value["content"] = value.get("body") or value.get("quote") or value.get("description")
            value.setdefault("confidence", None)
            value.setdefault("rationale", None)
            value["source_refs"] = source_refs
            value["assumptions"] = [
                str(assumption)
                for assumption in assumptions
                if isinstance(assumption, str) and assumption.strip()
            ]
            value["metadata"] = metadata

    item["data"] = data
    if item_needs_review:
        item["status"] = "needs_review"
        validation["status"] = "needs_review"
    if issues:
        validation["issues"] = issues
    item["validation"] = validation


def _mark_unsourced_review_items(
    item: dict[str, Any],
    path: str,
    section_keys: tuple[str, ...],
) -> None:
    data = item.get("data", {}) if isinstance(item.get("data"), dict) else {}
    validation = item.get("validation") if isinstance(item.get("validation"), dict) else {}
    issues = validation.get("issues") if isinstance(validation.get("issues"), list) else []
    item_needs_review = False
    for key in section_keys:
        values = data.get(key)
        if not isinstance(values, list):
            continue
        for index, value in enumerate(values):
            if not isinstance(value, dict):
                continue
            source_refs = value.get("source_refs", [])
            assumptions = value.get("assumptions", [])
            if not isinstance(source_refs, list):
                source_refs = []
                value["source_refs"] = source_refs
            if not isinstance(assumptions, list):
                assumptions = []
                value["assumptions"] = assumptions
            if source_refs:
                continue
            value["status"] = "needs_review"
            item_needs_review = True
            issues.append(
                {
                    "code": "artifact_item_needs_review",
                    "severity": "warning",
                    "message": "Generated artifact item is missing source evidence and was marked needs_review.",
                    "path": f"{path}.data.{key}.{index}",
                    "repaired": True,
                }
            )
    if item_needs_review:
        item["status"] = "needs_review"
        validation["status"] = "needs_review"
    if issues:
        validation["issues"] = issues
        item["validation"] = validation


