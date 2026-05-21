from copy import deepcopy
from typing import Any, Callable


CONCEPT_NODE_TYPES = {
    "category",
    "concept",
    "definition",
    "entity",
    "requirement",
    "standard",
    "workspace_goal",
}
PROCESS_NODE_TYPES = {"decision", "phase", "procedure", "process", "step", "workflow"}
DEPENDENCY_NODE_TYPES = {"blocker", "dependency", "risk"}
DATA_NODE_TYPES = {"data", "data_source", "dataset", "metric", "sql_query", "table"}
ACTION_NODE_TYPES = {"action", "approval", "task", "todo", "workstream"}
DEPENDENCY_RELATIONSHIP_TYPES = {
    "blocked_by",
    "blocks",
    "dependency",
    "depends_on",
    "prerequisite",
    "requires",
}
STRUCTURAL_RELATIONSHIP_TYPES = {"", "contains", "child", "parent"}
DATA_ARTIFACT_TYPES = {"chart", "data_summary", "data_table", "sql_query", "structured_data_analysis"}
EVIDENCE_ARTIFACT_TYPES = {
    "executive_summary",
    "news_article",
    "newsletter",
    "source_set_review",
    "source_summary",
}
ACTION_ARTIFACT_TYPES = {"checklist", "implementation_plan", "project_plan", "team_roadmap"}


def concept_graph(graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return _projection(
        graph,
        "concept_graph",
        node_filter=lambda node: _node_type(node) in CONCEPT_NODE_TYPES,
        edge_filter=lambda edge: _relationship_type(edge) in STRUCTURAL_RELATIONSHIP_TYPES,
        accepted_artifacts=accepted_artifacts,
    )


def relationship_graph(
    graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return _projection(
        graph,
        "relationship_graph",
        node_filter=lambda node: _node_type(node) != "reference",
        edge_filter=lambda edge: _relationship_type(edge) not in STRUCTURAL_RELATIONSHIP_TYPES,
        accepted_artifacts=accepted_artifacts,
    )


def process_graph(graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return _projection(
        graph,
        "process_graph",
        node_filter=lambda node: _node_type(node) in PROCESS_NODE_TYPES,
        edge_filter=lambda edge: _relationship_type(edge)
        in {*STRUCTURAL_RELATIONSHIP_TYPES, "next", "precedes", "leads_to", "decision"},
        accepted_artifacts=accepted_artifacts,
    )


def dependency_graph(
    graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return _projection(
        graph,
        "dependency_graph",
        node_filter=lambda node: _node_type(node) in DEPENDENCY_NODE_TYPES,
        edge_filter=lambda edge: _relationship_type(edge) in DEPENDENCY_RELATIONSHIP_TYPES,
        accepted_artifacts=accepted_artifacts,
        include_edge_endpoint_nodes=True,
    )


def evidence_graph(
    graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return _projection(
        graph,
        "evidence_graph",
        node_filter=lambda node: _node_type(node) != "reference",
        edge_filter=lambda edge: True,
        accepted_artifacts=accepted_artifacts,
        artifact_filter=lambda artifact: _artifact_type(artifact) in EVIDENCE_ARTIFACT_TYPES,
    )


def data_graph(graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return _projection(
        graph,
        "data_graph",
        node_filter=lambda node: _node_type(node) in DATA_NODE_TYPES,
        edge_filter=lambda edge: _relationship_type(edge) in {*STRUCTURAL_RELATIONSHIP_TYPES, "derived_from", "measures"},
        accepted_artifacts=accepted_artifacts,
        artifact_filter=lambda artifact: _artifact_type(artifact) in DATA_ARTIFACT_TYPES,
    )


def action_graph(graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    task_node_ids = {str(task.get("node_id", "")) for task in graph.get("tasks", []) if isinstance(task, dict)}
    return _projection(
        graph,
        "action_graph",
        node_filter=lambda node: _node_type(node) in ACTION_NODE_TYPES or str(node.get("id", "")) in task_node_ids,
        edge_filter=lambda edge: _relationship_type(edge)
        in {*STRUCTURAL_RELATIONSHIP_TYPES, *DEPENDENCY_RELATIONSHIP_TYPES, "assigned_to"},
        accepted_artifacts=accepted_artifacts,
        artifact_filter=lambda artifact: _artifact_type(artifact) in ACTION_ARTIFACT_TYPES,
    )


def connected_picture_package_projections(
    graph: dict[str, Any], accepted_artifacts: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return {
        "concept_graph": concept_graph(graph, accepted_artifacts),
        "relationship_graph": relationship_graph(graph, accepted_artifacts),
        "process_graph": process_graph(graph, accepted_artifacts),
        "dependency_graph": dependency_graph(graph, accepted_artifacts),
        "evidence_graph": evidence_graph(graph, accepted_artifacts),
        "data_graph": data_graph(graph, accepted_artifacts),
        "action_graph": action_graph(graph, accepted_artifacts),
    }


def _projection(
    graph: dict[str, Any],
    projection_type: str,
    *,
    node_filter: Callable[[dict[str, Any]], bool],
    edge_filter: Callable[[dict[str, Any]], bool],
    accepted_artifacts: list[dict[str, Any]] | None,
    artifact_filter: Callable[[dict[str, Any]], bool] | None = None,
    include_edge_endpoint_nodes: bool = False,
) -> dict[str, Any]:
    graph_nodes = [node for node in graph.get("nodes", []) if isinstance(node, dict)]
    graph_edges = [edge for edge in graph.get("edges", []) if isinstance(edge, dict)]
    matched_edges = [edge for edge in graph_edges if edge_filter(edge)]
    edge_node_ids = {
        node_id
        for edge in matched_edges
        for node_id in (str(edge.get("source_node_id", "")), str(edge.get("target_node_id", "")))
        if node_id
    }
    selected_nodes = [
        _project_node(node, projection_type)
        for node in graph_nodes
        if node_filter(node) or (include_edge_endpoint_nodes and str(node.get("id", "")) in edge_node_ids)
    ]
    selected_node_ids = {node["id"] for node in selected_nodes}
    selected_edges = [
        _project_edge(edge, projection_type)
        for edge in matched_edges
        if str(edge.get("source_node_id", "")) in selected_node_ids
        and str(edge.get("target_node_id", "")) in selected_node_ids
    ]
    selected_artifacts = [
        _project_artifact(artifact, projection_type)
        for artifact in accepted_artifacts or []
        if isinstance(artifact, dict) and (artifact_filter is None or artifact_filter(artifact))
    ]
    evidence_gaps = [
        _evidence_gap("node", node["id"], node["title"])
        for node in selected_nodes
        if node.get("needs_review") and not node.get("source_backed")
    ]
    evidence_gaps.extend(
        _evidence_gap("artifact", artifact["id"], artifact["title"])
        for artifact in selected_artifacts
        if artifact.get("needs_review") and not artifact.get("source_backed")
    )

    return {
        "id": projection_type,
        "projection_type": projection_type,
        "workspace_id": str(graph.get("workspace", {}).get("id", "")),
        "workspace_title": str(graph.get("workspace", {}).get("title", "")),
        "nodes": selected_nodes,
        "edges": selected_edges,
        "artifacts": selected_artifacts,
        "evidence_gaps": evidence_gaps,
        "metadata": {
            "source": "connected_picture_package_projection",
            "node_count": len(selected_nodes),
            "edge_count": len(selected_edges),
            "artifact_count": len(selected_artifacts),
            "needs_review_count": len(evidence_gaps),
        },
    }


def _project_node(node: dict[str, Any], projection_type: str) -> dict[str, Any]:
    source_refs = _source_refs(node)
    source_backed = _source_backed(source_refs)
    needs_review = _needs_review(node) or not source_backed
    status = "needs_review" if needs_review else str(node.get("status") or "accepted")
    return {
        "id": str(node.get("id", "")),
        "title": str(node.get("title", "")),
        "summary": str(node.get("summary", "")),
        "node_type": _node_type(node),
        "status": status,
        "confidence": deepcopy(node.get("confidence", "")),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "metadata": {
            "source": "accepted_workspace_node",
            "projection_type": projection_type,
            "parent_id": node.get("parent_id"),
            "review_reason": "" if source_backed else "Missing source evidence.",
        },
    }


def _project_edge(edge: dict[str, Any], projection_type: str) -> dict[str, Any]:
    source_refs = _source_refs(edge)
    source_backed = _source_backed(source_refs)
    needs_review = _needs_review(edge) or not source_backed
    return {
        "id": str(edge.get("id", "")),
        "source_node_id": str(edge.get("source_node_id", "")),
        "target_node_id": str(edge.get("target_node_id", "")),
        "relationship_type": _relationship_type(edge) or "contains",
        "status": "needs_review" if needs_review else str(edge.get("review_state") or "accepted"),
        "confidence": deepcopy(edge.get("confidence", edge.get("metadata", {}).get("confidence", ""))),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "metadata": {
            **deepcopy(edge.get("metadata", {}) if isinstance(edge.get("metadata"), dict) else {}),
            "source": "accepted_workspace_edge",
            "projection_type": projection_type,
            "review_reason": "" if source_backed else "Missing source evidence.",
        },
    }


def _project_artifact(artifact: dict[str, Any], projection_type: str) -> dict[str, Any]:
    source_refs = _artifact_source_refs(artifact)
    source_backed = _source_backed(source_refs)
    needs_review = _needs_review(artifact) or not source_backed
    return {
        "id": str(artifact.get("id") or f"{_artifact_type(artifact)}-artifact"),
        "artifact_type": _artifact_type(artifact),
        "title": _artifact_title(artifact),
        "status": "needs_review" if needs_review else str(artifact.get("status") or "accepted"),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "data": deepcopy(artifact.get("data", {})),
        "metadata": {
            **deepcopy(artifact.get("metadata", {}) if isinstance(artifact.get("metadata"), dict) else {}),
            "source": "accepted_artifact",
            "projection_type": projection_type,
            "review_reason": "" if source_backed else "Missing source evidence.",
        },
    }


def _artifact_source_refs(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    for source in (artifact, artifact.get("data", {}), artifact.get("metadata", {})):
        refs = source.get("source_refs") if isinstance(source, dict) else None
        if isinstance(refs, list):
            return deepcopy(refs)
    return []


def _source_refs(item: dict[str, Any]) -> list[dict[str, Any]]:
    refs = item.get("source_refs")
    return deepcopy(refs) if isinstance(refs, list) else []


def _source_backed(source_refs: list[dict[str, Any]]) -> bool:
    return any(isinstance(ref, dict) and ref.get("document_id") for ref in source_refs)


def _needs_review(item: dict[str, Any]) -> bool:
    status = str(item.get("status", "")).lower()
    review_state = str(item.get("review_state", "")).lower()
    return status == "needs_review" or review_state == "needs_review" or item.get("needs_review") is True


def _node_type(node: dict[str, Any]) -> str:
    return str(node.get("node_type") or "").lower()


def _relationship_type(edge: dict[str, Any]) -> str:
    return str(edge.get("relationship_type") or "").lower()


def _artifact_type(artifact: dict[str, Any]) -> str:
    return str(artifact.get("artifact_type") or "").lower()


def _artifact_title(artifact: dict[str, Any]) -> str:
    data = artifact.get("data", {}) if isinstance(artifact.get("data"), dict) else {}
    return str(
        artifact.get("title")
        or data.get("title")
        or data.get("headline")
        or data.get("name")
        or artifact.get("artifact_type")
        or "Accepted artifact"
    )


def _evidence_gap(item_type: str, item_id: str, title: str) -> dict[str, Any]:
    return {
        "item_type": item_type,
        "item_id": item_id,
        "title": title,
        "status": "needs_review",
        "reason": "Missing source evidence.",
    }
