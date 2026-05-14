from collections import defaultdict, deque
from uuid import uuid4

from graph.schemas import ExportBatch

from .mapper import (
    map_workspace_edge_to_miro_connector,
    map_workspace_node_to_miro_shape,
)


def export_branch_to_miro_payload(
    branch_nodes: list[dict],
    branch_edges: list[dict] | None = None,
    workspace: dict | None = None,
    target: str = "selected_branch_frame",
    batch_id: str | None = None,
) -> dict:
    """Build a transport-neutral Miro export payload for later API delivery."""
    branch_edges = branch_edges or []
    batch_id = batch_id or f"miro-export-{uuid4()}"
    export_batch = ExportBatch.from_payload(
        batch_id=batch_id,
        integration="miro",
        target=target,
        mode="dry_run",
        workspace=workspace,
        scope="branch" if target == "selected_branch_frame" else "workspace",
        item_count=len(branch_nodes) + len(branch_edges),
    ).model_dump()
    layout = _build_dry_run_layout(branch_nodes, branch_edges)

    return {
        "integration": "miro",
        "batch_id": batch_id,
        "export_batch": export_batch,
        "mode": "dry_run",
        "target": target,
        "workspace": workspace or {},
        "summary": {
            "shape_count": len(branch_nodes),
            "connector_count": len(branch_edges),
        },
        "layout": {
            "strategy": "tree_grid",
            "frame": _frame_for_layout(layout, workspace),
        },
        "items": [
            map_workspace_node_to_miro_shape(
                node,
                layout.get(node.get("id", "")),
                export_batch,
            )
            for node in branch_nodes
        ],
        "connectors": [
            map_workspace_edge_to_miro_connector(edge, export_batch)
            for edge in branch_edges
        ],
    }


def export_sme_review_board_payload(
    graph: dict,
    batch_id: str | None = None,
) -> dict:
    review_nodes = [
        node
        for node in graph.get("nodes", [])
        if node.get("status") == "needs_review"
        or node.get("node_type") == "needs_review"
    ]
    review_node_ids = {node.get("id", "") for node in review_nodes}
    review_edges = [
        edge
        for edge in graph.get("edges", [])
        if edge.get("source_node_id") in review_node_ids
        and edge.get("target_node_id") in review_node_ids
    ]
    payload = export_branch_to_miro_payload(
        review_nodes,
        review_edges,
        graph.get("workspace", {}),
        target="sme_review_board",
        batch_id=batch_id,
    )
    payload["summary"] = {
        **payload["summary"],
        "review_node_count": len(review_nodes),
    }
    payload["layout"] = {
        **payload["layout"],
        "strategy": "sme_review_grid",
        "frame": {
            **payload["layout"]["frame"],
            "title": f"{graph.get('workspace', {}).get('title', 'DocMap')} SME Review",
        },
    }
    payload["review"] = {
        "mode": "sme_review",
        "included_statuses": ["needs_review"],
        "source_required": True,
    }
    payload["export_batch"] = {
        **payload["export_batch"],
        "target": "sme_review_board",
        "scope": "workspace",
        "item_count": len(review_nodes) + len(review_edges),
    }
    return payload


def _build_dry_run_layout(nodes: list[dict], edges: list[dict]) -> dict[str, dict]:
    node_ids = [node.get("id", "") for node in nodes]
    if not node_ids:
        return {}

    children_by_parent = defaultdict(list)
    targeted = set()
    for edge in edges:
        source = edge.get("source_node_id", "")
        target = edge.get("target_node_id", "")
        if source and target:
            children_by_parent[source].append(target)
            targeted.add(target)

    roots = [node_id for node_id in node_ids if node_id not in targeted] or node_ids[:1]
    depth_by_node = {}
    order_by_node = {}
    queue = deque((root, 0) for root in roots)
    next_order = 0

    while queue:
        node_id, depth = queue.popleft()
        if node_id in depth_by_node:
            continue
        depth_by_node[node_id] = depth
        order_by_node[node_id] = next_order
        next_order += 1
        for child_id in children_by_parent.get(node_id, []):
            queue.append((child_id, depth + 1))

    for node_id in node_ids:
        if node_id not in depth_by_node:
            depth_by_node[node_id] = 0
            order_by_node[node_id] = next_order
            next_order += 1

    return {
        node_id: {
            "x": depth_by_node[node_id] * 360,
            "y": order_by_node[node_id] * 160,
        }
        for node_id in node_ids
    }


def _frame_for_layout(layout: dict[str, dict], workspace: dict | None) -> dict:
    if not layout:
        return {
            "title": (workspace or {}).get("title", "DocMap export preview"),
            "x": 0,
            "y": 0,
            "width": 480,
            "height": 240,
        }

    xs = [position["x"] for position in layout.values()]
    ys = [position["y"] for position in layout.values()]
    padding = 180
    return {
        "title": (workspace or {}).get("title", "DocMap export preview"),
        "x": min(xs) - padding,
        "y": min(ys) - padding,
        "width": max(xs) - min(xs) + padding * 2 + 320,
        "height": max(ys) - min(ys) + padding * 2 + 120,
    }
