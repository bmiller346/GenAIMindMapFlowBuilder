from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from ai.schemas import AIDRAFT_ACCEPT_MODES, AI_DRAFT_SESSION_CONTRACT_VERSION
from graph.schemas import GraphSchemaError
from graph.validation import validate_and_repair_graph


@dataclass(frozen=True)
class DraftAcceptanceDependencies:
    latest_revision: Callable[[dict[str, Any], str | None], dict[str, Any]]
    validate_session: Callable[[dict[str, Any]], dict[str, Any]]
    build_preview_diff: Callable[..., dict[str, Any]]


def accept_ai_draft_revision(
    graph: dict[str, Any],
    session: dict[str, Any],
    *,
    revision_id: str | None = None,
    accept_mode: str = "append",
    selected_item_ids: list[str] | None = None,
    accepted_by: str = "user",
    dependencies: DraftAcceptanceDependencies,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if accept_mode not in AIDRAFT_ACCEPT_MODES:
        raise GraphSchemaError([f"ai_draft_accept.mode: unsupported mode '{accept_mode}'"])

    original_graph = deepcopy(graph)
    revision = dependencies.latest_revision(session, revision_id)
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

    accepted_nodes, accepted_edges, review_outputs, patch_operations = build_ai_draft_graph_patch(
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
        attach_ai_draft_revision_notes(
            candidate_graph,
            session,
            revision,
            review_outputs=review_outputs,
            accepted_by=accepted_by,
            patch_operations=patch_operations,
        )

    selected_artifacts = selected_generated_artifacts(revision, accept_mode, selected_ids)
    repaired_graph = validate_and_repair_graph(candidate_graph)
    accepted_item_ids = accepted_item_ids_for_revision(
        revision,
        accepted_nodes,
        accepted_edges,
        review_outputs,
        selected_artifacts,
        selected_ids,
    )
    accepted_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    accepted_artifacts = accepted_artifacts_with_revision_context(
        revision,
        selected_artifacts,
        session=session,
        accepted_at=accepted_at,
        accepted_by=accepted_by,
    )
    preview_diff = dependencies.build_preview_diff(
        accepted_nodes,
        accepted_edges,
        review_outputs,
        repaired_graph.get("validation_report", {}),
        accepted_item_ids,
        selected_artifacts,
    )
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
        "accepted_artifacts": accepted_artifacts,
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
            "undo_kind": "full_graph_snapshot",
            "accepted_artifact_ids": [artifact.get("id", "") for artifact in accepted_artifacts],
        },
    }
    updated_session = dependencies.validate_session(session)
    updated_session["status"] = "accepted"
    updated_session["updated_at"] = accepted_at
    updated_session["accept_history"].append(result)
    if isinstance(updated_session.get("ai_action_run"), dict):
        updated_session["ai_action_run"]["status"] = "accepted"
        updated_session["ai_action_run"]["generated_node_ids"] = result["accepted_node_ids"]
    return repaired_graph, dependencies.validate_session(updated_session), result


def accept_ai_draft_session(
    graph: dict[str, Any],
    session: dict[str, Any],
    *,
    mode: str = "append",
    selected_item_ids: list[str] | None = None,
    accepted_by: str = "user",
    accepted_at: str | None = None,
    dependencies: DraftAcceptanceDependencies,
) -> dict[str, Any]:
    accepted_graph, accepted_session, accept_result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode=mode,
        selected_item_ids=selected_item_ids,
        accepted_by=accepted_by,
        dependencies=dependencies,
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


def accepted_artifacts_with_revision_context(
    revision: dict[str, Any],
    artifacts: list[dict[str, Any]] | None = None,
    *,
    session: dict[str, Any] | None = None,
    accepted_at: str = "",
    accepted_by: str = "user",
) -> list[dict[str, Any]]:
    metadata = revision.get("metadata") if isinstance(revision.get("metadata"), dict) else {}
    evidence_mode = str(metadata.get("evidence_mode") or "").strip()
    citation_policy = str(metadata.get("citation_policy") or "").strip()
    artifacts = deepcopy(
        artifacts
        if artifacts is not None
        else revision.get("generated_artifacts", [])
    )
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        artifact_metadata = artifact.get("metadata") if isinstance(artifact.get("metadata"), dict) else {}
        artifact_metadata.setdefault("ai_draft_revision_id", revision.get("revision_id", ""))
        if session:
            artifact_metadata.setdefault("ai_draft_session_id", session.get("session_id", ""))
            artifact_metadata.setdefault("ai_draft_intent", session.get("intent", ""))
            artifact_metadata.setdefault("ai_draft_role", session.get("role", ""))
        if accepted_at:
            artifact_metadata.setdefault("accepted_at", accepted_at)
        artifact_metadata.setdefault("accepted_by", accepted_by or "user")
        if evidence_mode and not artifact_metadata.get("evidence_mode"):
            artifact_metadata["evidence_mode"] = evidence_mode
        if citation_policy and not artifact_metadata.get("citation_policy"):
            artifact_metadata["citation_policy"] = citation_policy
        artifact["metadata"] = artifact_metadata
        provenance = artifact.get("provenance") if isinstance(artifact.get("provenance"), dict) else {}
        provenance.setdefault("ai_draft_revision_id", revision.get("revision_id", ""))
        if session:
            provenance.setdefault("ai_draft_session_id", session.get("session_id", ""))
        if accepted_at:
            provenance.setdefault("accepted_at", accepted_at)
        provenance.setdefault("accepted_by", accepted_by or "user")
        if evidence_mode and not provenance.get("evidence_mode"):
            provenance["evidence_mode"] = evidence_mode
        if citation_policy and not provenance.get("citation_policy"):
            provenance["citation_policy"] = citation_policy
        artifact["provenance"] = provenance
    return artifacts


def selected_draft_nodes(
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
        item_node_ids = selected_metadata_ids(revision, selected_ids, "node_id")
        nodes = [
            node
            for node in nodes
            if isinstance(node, dict)
            and (node.get("id") in selected_ids or node.get("id") in item_node_ids)
        ]
    return [node for node in nodes if isinstance(node, dict)]


def selected_draft_edges(
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


def selected_generated_artifacts(
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

    artifact_ids = selected_metadata_ids(revision, selected_ids, "artifact_id")
    relationship_edge_ids = selected_metadata_ids(revision, selected_ids, "relationship_edge_id")
    package_item_ids = selected_package_item_ids(revision, selected_ids)
    selected_artifacts: list[dict[str, Any]] = []
    for artifact in artifacts:
        artifact_type = artifact.get("artifact_type")
        artifact_id = str(artifact.get("id") or "")
        if artifact_type == "connected_picture_package":
            filtered_artifact = filtered_connected_picture_package_artifact(
                artifact,
                selected_ids | package_item_ids,
            )
            if filtered_artifact:
                selected_artifacts.append(filtered_artifact)
            continue
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
            and relationship_edge_accept_id(artifact, relationship, index) in relationship_edge_ids
        ]
        if filtered_edges:
            filtered_artifact = deepcopy(artifact)
            filtered_artifact.setdefault("data", {})
            filtered_artifact["data"]["relationship_edges"] = filtered_edges
            selected_artifacts.append(filtered_artifact)
    return selected_artifacts


def selected_package_item_ids(
    revision: dict[str, Any],
    selected_ids: set[str],
) -> set[str]:
    ids = set(selected_ids)
    ids.update(
        item_id[5:]
        for item_id in selected_ids
        if isinstance(item_id, str) and item_id.startswith("item_") and len(item_id) > 5
    )
    for item in revision.get("draft_items", []):
        if not isinstance(item, dict) or item.get("id") not in selected_ids:
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        for key in ("package_item_id", "acceptance_group_id"):
            value = metadata.get(key)
            if isinstance(value, str) and value:
                ids.add(value)
        for key in (
            "package_item_ids",
            "required_sibling_ids",
            "required_siblings",
            "dependency_item_ids",
            "depends_on_item_ids",
            "dependency_link_ids",
        ):
            values = metadata.get(key)
            if isinstance(values, list):
                ids.update(str(value) for value in values if str(value).strip())
    return ids


def filtered_connected_picture_package_artifact(
    artifact: dict[str, Any],
    selected_ids: set[str],
) -> dict[str, Any] | None:
    artifact_id = str(artifact.get("id") or "")
    package = artifact.get("data") if isinstance(artifact.get("data"), dict) else {}
    package_id = str(package.get("package_id") or artifact.get("package_id") or artifact_id)
    if (
        artifact_id in selected_ids
        or package_id in selected_ids
        or f"item_{artifact_id}" in selected_ids
        or f"item_{package_id}" in selected_ids
    ):
        return artifact

    groups = package.get("acceptance_groups", []) if isinstance(package.get("acceptance_groups"), list) else []
    selected_item_ids = set(selected_ids)
    for group in groups:
        if not isinstance(group, dict):
            continue
        group_id = str(group.get("id") or "")
        if group_id not in selected_ids and str(group.get("package_item_id") or "") not in selected_ids:
            continue
        selected_item_ids.update(
            str(item_id)
            for item_id in group.get("item_ids", [])
            if isinstance(item_id, str) and item_id
        )
        selected_item_ids.update(_package_required_ids(group))

    if not selected_item_ids:
        return None

    collections = {
        "primary_nodes": package.get("primary_nodes", []),
        "relationship_edges": package.get("relationship_edges", []),
        "view_lenses": package.get("view_lenses", []),
        "structured_evidence": package.get("structured_evidence", []),
        "evidence_links": package.get("evidence_links", []),
        "tasks": package.get("tasks", []),
        "risks": package.get("risks", []),
        "decisions": package.get("decisions", []),
        "repair_targets": package.get("repair_targets", []),
    }
    item_by_id = {
        item_id: item
        for values in collections.values()
        for item in values
        if isinstance(item, dict)
        for item_id in _package_item_ids(item)
    }
    pending = list(selected_item_ids)
    while pending:
        item_id = pending.pop()
        item = item_by_id.get(item_id)
        if not item:
            continue
        for required_id in _package_required_ids(item):
            if required_id not in selected_item_ids:
                selected_item_ids.add(required_id)
                pending.append(required_id)

    next_package = deepcopy(package)
    for key in collections:
        next_package[key] = [
            deepcopy(item)
            for item in collections[key]
            if isinstance(item, dict) and _package_item_ids(item) & selected_item_ids
        ]

    primary_ids = {
        item_id
        for item in next_package["primary_nodes"]
        for item_id in _package_item_ids(item)
    }
    edge_ids = {
        item_id
        for item in next_package["relationship_edges"]
        for item_id in _package_item_ids(item)
    }
    evidence_ids = {
        item_id
        for item in next_package["structured_evidence"]
        for item_id in _package_item_ids(item)
    }
    allowed_link_targets = primary_ids | edge_ids | {
        item_id
        for key in ("tasks", "risks", "decisions", "repair_targets")
        for item in next_package[key]
        for item_id in _package_item_ids(item)
    }
    next_package["relationship_edges"] = [
        edge
        for edge in next_package["relationship_edges"]
        if _package_edge_is_resolved(edge, primary_ids)
    ]
    edge_ids = {
        item_id
        for item in next_package["relationship_edges"]
        for item_id in _package_item_ids(item)
    }
    next_package["evidence_links"] = [
        link
        for link in next_package["evidence_links"]
        if str(link.get("source_evidence_id") or "") in evidence_ids
        and (
            str(link.get("target_package_item_id") or "") in allowed_link_targets
            or str(link.get("target_id") or "") in allowed_link_targets
        )
    ]
    next_package["view_lenses"] = [
        _filter_package_lens_refs(lens, primary_ids, edge_ids)
        for lens in next_package["view_lenses"]
        if _filter_package_lens_refs(lens, primary_ids, edge_ids) is not None
    ]
    next_package["acceptance_groups"] = [
        deepcopy(group)
        for group in groups
        if isinstance(group, dict)
        and set(group.get("item_ids", []) if isinstance(group.get("item_ids"), list) else []) & selected_item_ids
    ]

    has_content = any(next_package.get(key) for key in collections)
    if not has_content:
        return None
    filtered = deepcopy(artifact)
    filtered["data"] = next_package
    return filtered


def _package_item_ids(item: dict[str, Any]) -> set[str]:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    return {
        str(value)
        for value in (
            item.get("package_item_id"),
            metadata.get("package_item_id"),
            item.get("id"),
            item.get("node_id"),
        )
        if isinstance(value, str) and value
    }


def _package_required_ids(item: dict[str, Any]) -> set[str]:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    ids: set[str] = set()
    for key in (
        "required_sibling_ids",
        "required_siblings",
        "dependency_item_ids",
        "depends_on_item_ids",
        "dependency_link_ids",
    ):
        values = item.get(key, [])
        if isinstance(values, list):
            ids.update(str(value) for value in values if isinstance(value, str) and value)
        metadata_values = metadata.get(key, [])
        if isinstance(metadata_values, list):
            ids.update(str(value) for value in metadata_values if isinstance(value, str) and value)
    dependency_links = item.get("dependency_links") or metadata.get("dependency_links")
    if isinstance(dependency_links, list):
        for link in dependency_links:
            if isinstance(link, str) and link:
                ids.add(link)
            elif isinstance(link, dict):
                ids.update(
                    str(link.get(key))
                    for key in ("target_id", "target_item_id", "source_id", "source_item_id")
                    if str(link.get(key) or "").strip()
                )
    return ids


def _package_edge_is_resolved(edge: dict[str, Any], primary_ids: set[str]) -> bool:
    source_item_id = str(edge.get("source_package_item_id") or "")
    target_item_id = str(edge.get("target_package_item_id") or "")
    if source_item_id or target_item_id:
        return source_item_id in primary_ids and target_item_id in primary_ids
    return bool(str(edge.get("source_node_id") or "") and str(edge.get("target_node_id") or ""))


def _filter_package_lens_refs(
    lens: dict[str, Any],
    primary_ids: set[str],
    edge_ids: set[str],
) -> dict[str, Any] | None:
    lens_copy = deepcopy(lens)
    if isinstance(lens_copy.get("node_ids"), list):
        lens_copy["node_ids"] = [
            node_id
            for node_id in lens_copy["node_ids"]
            if isinstance(node_id, str) and node_id in primary_ids
        ]
    if isinstance(lens_copy.get("edge_ids"), list):
        lens_copy["edge_ids"] = [
            edge_id
            for edge_id in lens_copy["edge_ids"]
            if isinstance(edge_id, str) and edge_id in edge_ids
        ]
    if lens_copy.get("node_ids") or lens_copy.get("edge_ids") or not lens.get("node_ids") and not lens.get("edge_ids"):
        return lens_copy
    return None


def knowledge_graph_artifact_edges_for_accept(
    artifacts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for artifact in artifacts:
        artifact_type = artifact.get("artifact_type")
        if artifact_type not in {"knowledge_graph", "software_overlap_report", "connected_picture_package"}:
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
            edge_id = relationship_edge_accept_id(artifact, relationship, index)
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
                        "package_id": data.get("package_id", "") if artifact_type == "connected_picture_package" else metadata.get("package_id", ""),
                        "package_item_id": edge_id if artifact_type == "connected_picture_package" else metadata.get("package_item_id", ""),
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


def accepted_item_ids_for_revision(
    revision: dict[str, Any],
    accepted_nodes: list[dict[str, Any]],
    accepted_edges: list[dict[str, Any]],
    review_outputs: list[dict[str, Any]],
    accepted_artifacts: list[dict[str, Any]],
    selected_ids: set[str],
) -> list[str]:
    selected_package_ids = selected_package_item_ids(revision, selected_ids)
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
    if not selected_ids:
        accepted_artifact_ids.update(
            artifact.get("id", "")
            for artifact in accepted_artifacts
            if isinstance(artifact, dict)
        )
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
            or metadata.get("package_item_id")
        )
        item_id = item.get("id")
        if metadata.get("artifact_type") == "connected_picture_package":
            if (
                item_id in selected_ids
                or metadata.get("package_item_id") in selected_package_ids
                or metadata.get("acceptance_group_id") in selected_package_ids
                or raw_id in accepted_relationship_edge_ids
            ):
                item_ids.append(str(item_id))
            continue
        if (
            item_id in selected_ids
            or metadata.get("package_item_id") in selected_package_ids
            or metadata.get("acceptance_group_id") in selected_package_ids
            or raw_id in accepted_raw_ids
            or raw_id in accepted_artifact_ids
            or raw_id in accepted_relationship_edge_ids
        ):
            item_ids.append(str(item_id))
    return item_ids


def selected_metadata_ids(
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


def build_ai_draft_graph_patch(
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
        remove_scope_branch_for_replace(graph, session, patch_operations)

    if accept_mode == "notes_only":
        return [], [], deepcopy(revision.get("draft_annotations", [])), patch_operations

    selected_nodes = selected_draft_nodes(revision, accept_mode, selected_ids)
    selected_edges = selected_draft_edges(revision, selected_nodes, accept_mode)
    selected_artifacts = selected_generated_artifacts(revision, accept_mode, selected_ids)
    selected_edges = [
        *selected_edges,
        *knowledge_graph_artifact_edges_for_accept(selected_artifacts),
    ]
    existing_node_ids = {node.get("id") for node in graph.get("nodes", []) if isinstance(node, dict)}
    existing_by_id = existing_nodes_by_id(graph)
    existing_by_title = existing_nodes_by_title(graph)
    id_map: dict[str, str] = {}
    accepted_nodes: list[dict[str, Any]] = []

    for draft_node in selected_nodes:
        node = accepted_revision_node(
            draft_node,
            session=session,
            revision=revision,
            accepted_by=accepted_by,
        )
        original_id = str(node.get("id") or f"draft_node_{_utc_token()}")
        merge_target = merge_target_for_node(node, existing_by_id, existing_by_title) if accept_mode == "merge" else None

        if merge_target:
            id_map[original_id] = str(merge_target.get("id", original_id))
            merge_draft_node_into_existing(merge_target, node, session, revision, patch_operations)
            continue

        next_id = unique_graph_id(original_id, existing_node_ids)
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

    accepted_edges = accepted_revision_edges(
        graph,
        selected_edges,
        id_map=id_map,
        session=session,
        revision=revision,
        patch_operations=patch_operations,
    )
    return accepted_nodes, accepted_edges, [], patch_operations


def remove_scope_branch_for_replace(
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


def existing_nodes_by_title(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        title_key(node.get("title")): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and title_key(node.get("title"))
    }


def existing_nodes_by_id(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(node.get("id")): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("id") is not None
    }


def merge_target_for_node(
    node: dict[str, Any],
    existing_by_id: dict[str, dict[str, Any]],
    existing_by_title: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    node_id = str(node.get("id", ""))
    if node_id in existing_by_id:
        return existing_by_id[node_id]
    return existing_by_title.get(title_key(node.get("title")))


def merge_draft_node_into_existing(
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
        target["source_refs"] = merge_source_refs(target.get("source_refs", []), draft_node.get("source_refs", []))
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


def accepted_revision_node(
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
    for key in ("package_id", "package_item_id", "acceptance_group_id"):
        if node.get(key) and not node["metadata"].get(key):
            node["metadata"][key] = node.get(key)
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


def accepted_revision_edges(
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
        edge["id"] = unique_graph_id(str(edge.get("id") or f"edge_{source}_{target}"), used_edge_ids)
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


def attach_ai_draft_revision_notes(
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


def relationship_edge_accept_id(
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


def merge_source_refs(
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


def title_key(value: Any) -> str:
    return str(value or "").strip().lower()


def unique_graph_id(preferred_id: str, existing_ids: set[str]) -> str:
    if preferred_id not in existing_ids:
        return preferred_id
    suffix = 2
    while f"{preferred_id}-{suffix}" in existing_ids:
        suffix += 1
    return f"{preferred_id}-{suffix}"


def _utc_token() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
