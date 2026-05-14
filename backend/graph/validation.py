from collections import Counter
from copy import deepcopy
from typing import Any

from .schemas import (
    GraphSchemaError,
    GraphValidationIssue,
    GraphValidationReport,
    WorkspaceGraph,
)


SYNTHETIC_ROOT_ID = "workspace-root"
AI_GENERATED_STATUSES = {"", "ai_generated", "AI Generated"}
REVIEWABLE_AI_STATUSES = {*AI_GENERATED_STATUSES, "needs_review"}
LOW_CONFIDENCE_THRESHOLD = 0.6
EXTERNAL_REF_REQUIRED_FIELDS = {
    "miro": ("board_id", "item_id", "export_batch_id", "last_pushed_at"),
    "monday": ("board_id", "item_id", "export_batch_id", "last_pushed_at"),
}


def validate_and_repair_graph(graph: dict[str, Any]) -> dict[str, Any]:
    repaired_graph = deepcopy(graph)
    issues: list[GraphValidationIssue] = []

    _repair_duplicate_node_ids(repaired_graph, issues)
    _repair_edges(repaired_graph, issues)
    _repair_parent_ids(repaired_graph, issues)
    _mark_uncited_ai_nodes(repaired_graph, issues)
    _mark_low_confidence_ai_nodes(repaired_graph, issues)
    _validate_external_refs(repaired_graph, issues)
    _validate_monday_selection_input(repaired_graph, issues)
    root_node_id = _enforce_one_root(repaired_graph, issues)
    _rebuild_tasks(repaired_graph)

    validation_report = _schema_report(repaired_graph, issues, root_node_id)
    repaired_graph["validation_report"] = validation_report.model_dump()
    return repaired_graph


def _repair_duplicate_node_ids(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    seen: Counter[str] = Counter()

    for node in graph.get("nodes", []):
        node_id = str(node.get("id", "")).strip()
        if not node_id:
            node_id = "untitled-node"

        seen[node_id] += 1
        if seen[node_id] == 1:
            node["id"] = node_id
            continue

        repaired_id = f"{node_id}-duplicate-{seen[node_id]}"
        issues.append(
            GraphValidationIssue(
                code="duplicate_node_id",
                severity="error",
                message=f"Duplicate node id '{node_id}' was renamed to '{repaired_id}'.",
                node_id=node_id,
                repaired=True,
            )
        )
        node["id"] = repaired_id


def _repair_edges(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    node_ids = {node.get("id") for node in graph.get("nodes", [])}
    repaired_edges = []
    seen_edge_ids: set[str] = set()

    for index, edge in enumerate(graph.get("edges", []), start=1):
        edge_id = edge.get("id") or f"edge-{index}"
        edge["id"] = str(edge_id)
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")

        if source not in node_ids or target not in node_ids:
            issues.append(
                GraphValidationIssue(
                    code="invalid_edge_endpoint",
                    severity="error",
                    message="Edge references a missing source or target node and was removed.",
                    edge_id=edge["id"],
                    repaired=True,
                )
            )
            continue

        if source == target:
            issues.append(
                GraphValidationIssue(
                    code="self_loop_edge",
                    severity="warning",
                    message="Self-loop edge was removed.",
                    edge_id=edge["id"],
                    node_id=str(source),
                    repaired=True,
                )
            )
            continue

        if edge["id"] in seen_edge_ids:
            edge["id"] = f"{edge['id']}-{index}"
            issues.append(
                GraphValidationIssue(
                    code="duplicate_edge_id",
                    severity="warning",
                    message=f"Duplicate edge id was renamed to '{edge['id']}'.",
                    edge_id=edge["id"],
                    repaired=True,
                )
            )

        seen_edge_ids.add(edge["id"])
        repaired_edges.append(edge)

    graph["edges"] = repaired_edges


def _repair_parent_ids(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    node_ids = {node.get("id") for node in graph.get("nodes", [])}
    parent_by_target = {
        edge.get("target_node_id"): edge.get("source_node_id")
        for edge in graph.get("edges", [])
    }

    for node in graph.get("nodes", []):
        node_id = node.get("id")
        parent_id = node.get("parent_id")

        if parent_id and parent_id not in node_ids:
            issues.append(
                GraphValidationIssue(
                    code="invalid_parent_id",
                    severity="error",
                    message=f"Invalid parent id '{parent_id}' was removed.",
                    node_id=str(node_id),
                    repaired=True,
                )
            )
            node["parent_id"] = None

        edge_parent = parent_by_target.get(node_id)
        if edge_parent and node.get("parent_id") != edge_parent:
            node["parent_id"] = edge_parent


def _mark_uncited_ai_nodes(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    for node in graph.get("nodes", []):
        if node.get("source_refs"):
            continue
        if node.get("node_type") == "reference":
            continue
        if node.get("status") not in REVIEWABLE_AI_STATUSES:
            continue

        node["status"] = "needs_review"
        issues.append(
            GraphValidationIssue(
                code="missing_source_ref",
                severity="warning",
                message="AI-generated node is missing a source reference and was marked needs_review.",
                node_id=str(node.get("id", "")),
                repaired=True,
            )
        )

def _mark_low_confidence_ai_nodes(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    for node in graph.get("nodes", []):
        if node.get("node_type") == "reference":
            continue
        if node.get("status") not in REVIEWABLE_AI_STATUSES:
            continue

        confidence = _parse_confidence(node.get("confidence"))
        if confidence is None or confidence >= LOW_CONFIDENCE_THRESHOLD:
            continue

        node["status"] = "needs_review"
        issues.append(
            GraphValidationIssue(
                code="low_confidence",
                severity="warning",
                message=(
                    "AI-generated node confidence is below "
                    f"{int(LOW_CONFIDENCE_THRESHOLD * 100)}% and was marked needs_review."
                ),
                node_id=str(node.get("id", "")),
                repaired=True,
            )
        )


def _parse_confidence(value: Any) -> float | None:
    if value in (None, ""):
        return None

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        is_percent = cleaned.endswith("%")
        cleaned = cleaned.rstrip("%").strip()
    else:
        cleaned = value
        is_percent = False

    try:
        confidence = float(cleaned)
    except (TypeError, ValueError):
        return None

    if is_percent or confidence > 1:
        confidence = confidence / 100

    if confidence < 0:
        return None

    return confidence


def _validate_external_refs(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    for node in graph.get("nodes", []):
        node_id = str(node.get("id", ""))
        external_refs = node.get("external_refs", {})
        if not external_refs:
            continue

        if not isinstance(external_refs, dict):
            issues.append(
                GraphValidationIssue(
                    code="invalid_external_ref",
                    severity="warning",
                    message="External refs must be an object keyed by integration provider.",
                    node_id=node_id,
                    repaired=False,
                )
            )
            continue

        for provider, ref in external_refs.items():
            if not isinstance(ref, dict):
                issues.append(
                    GraphValidationIssue(
                        code="invalid_external_ref",
                        severity="warning",
                        message=f"{provider} external ref must be an object.",
                        node_id=node_id,
                        repaired=False,
                    )
                )
                continue

            required_fields = EXTERNAL_REF_REQUIRED_FIELDS.get(provider)
            if not required_fields:
                continue

            missing_fields = [
                field
                for field in required_fields
                if ref.get(field) in (None, "")
            ]
            if missing_fields:
                issues.append(
                    GraphValidationIssue(
                        code="invalid_external_ref",
                        severity="warning",
                        message=(
                            f"{provider} external ref is missing "
                            f"{', '.join(missing_fields)}."
                        ),
                        node_id=node_id,
                        repaired=False,
                    )
                )


def _validate_monday_selection_input(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> None:
    for node in graph.get("nodes", []):
        node_id = str(node.get("id", ""))
        selection = node.get("monday_selection_input", {})
        if not selection:
            continue

        if not isinstance(selection, dict):
            issues.append(
                GraphValidationIssue(
                    code="invalid_monday_selection_input",
                    severity="warning",
                    message="monday_selection_input must be an object.",
                    node_id=node_id,
                    repaired=False,
                )
            )
            continue

        if not selection.get("selected"):
            continue

        item = selection.get("item")
        if not isinstance(item, dict):
            issues.append(
                GraphValidationIssue(
                    code="invalid_monday_selection_input",
                    severity="warning",
                    message="Selected monday input is missing an item object.",
                    node_id=node_id,
                    repaired=False,
                )
            )
            continue

        item_node_id = item.get("node_id")
        if item_node_id and item_node_id != node_id:
            issues.append(
                GraphValidationIssue(
                    code="invalid_monday_selection_input",
                    severity="warning",
                    message="Selected monday input item node_id must match the graph node id.",
                    node_id=node_id,
                    repaired=False,
                )
            )

        if not item.get("name"):
            issues.append(
                GraphValidationIssue(
                    code="invalid_monday_selection_input",
                    severity="warning",
                    message="Selected monday input item is missing a name.",
                    node_id=node_id,
                    repaired=False,
                )
            )


def _enforce_one_root(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
) -> str:
    nodes = graph.get("nodes", [])
    if not nodes:
        root = _synthetic_root(graph)
        graph["nodes"] = [root]
        issues.append(
            GraphValidationIssue(
                code="missing_root",
                severity="error",
                message="Empty graph was repaired with a workspace root node.",
                node_id=root["id"],
                repaired=True,
            )
        )
        return root["id"]

    node_ids = {node["id"] for node in nodes}
    targeted = {
        edge["target_node_id"]
        for edge in graph.get("edges", [])
        if edge.get("target_node_id") in node_ids
    }
    roots = [node for node in nodes if node["id"] not in targeted]

    if len(roots) == 1:
        roots[0]["parent_id"] = None
        return roots[0]["id"]

    root = _synthetic_root(graph, node_ids)
    graph["nodes"].insert(0, root)

    if roots:
        root_targets = roots
        issue_code = "multiple_roots"
        issue_message = "Multiple roots were attached under a synthetic workspace root."
    else:
        root_targets = nodes
        issue_code = "missing_root"
        issue_message = "No root was found, so nodes were attached under a synthetic workspace root."

    for target in root_targets:
        target["parent_id"] = root["id"]
        graph["edges"].append(
            {
                "id": f"{root['id']}-{target['id']}",
                "source_node_id": root["id"],
                "target_node_id": target["id"],
                "relationship_type": "contains",
                "metadata": {"synthetic": True},
            }
        )

    issues.append(
        GraphValidationIssue(
            code=issue_code,
            severity="error",
            message=issue_message,
            node_id=root["id"],
            repaired=True,
        )
    )
    return root["id"]


def _synthetic_root(
    graph: dict[str, Any],
    existing_node_ids: set[str] | None = None,
) -> dict[str, Any]:
    existing_node_ids = existing_node_ids or set()
    root_id = SYNTHETIC_ROOT_ID
    suffix = 2

    while root_id in existing_node_ids:
        root_id = f"{SYNTHETIC_ROOT_ID}-{suffix}"
        suffix += 1

    workspace = graph.get("workspace", {})
    return {
        "id": root_id,
        "parent_id": None,
        "title": workspace.get("title") or "Workspace",
        "summary": workspace.get("summary", ""),
        "node_type": "workspace",
        "status": "system_generated",
        "priority": "",
        "owner_id": "",
        "due_date": "",
        "confidence": "",
        "source_refs": [],
        "external_refs": {},
        "metadata": {"synthetic": True},
    }


def _rebuild_tasks(graph: dict[str, Any]) -> None:
    task_node_ids = {
        task.get("node_id")
        for task in graph.get("tasks", [])
    }
    node_ids = {node.get("id") for node in graph.get("nodes", [])}
    graph["tasks"] = [
        task
        for task in graph.get("tasks", [])
        if task.get("node_id") in node_ids and task.get("node_id") in task_node_ids
    ]


def _schema_report(
    graph: dict[str, Any],
    issues: list[GraphValidationIssue],
    root_node_id: str,
) -> GraphValidationReport:
    try:
        WorkspaceGraph.model_validate({**graph, "validation_report": {}})
    except GraphSchemaError as exc:
        for error in exc.errors:
            issues.append(
                GraphValidationIssue(
                    code="schema_validation_error",
                    severity="error",
                    message=error,
                    repaired=False,
                )
            )

    has_errors = any(issue.severity == "error" and not issue.repaired for issue in issues)
    return GraphValidationReport(
        is_valid=not has_errors,
        repaired=any(issue.repaired for issue in issues),
        root_node_id=root_node_id,
        issues=issues,
    )
