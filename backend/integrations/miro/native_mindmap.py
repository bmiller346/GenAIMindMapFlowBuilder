from collections import defaultdict, deque
from uuid import uuid4

from graph.schemas import ExportBatch


NATIVE_MINDMAP_EVALUATION = {
    "api_status": "experimental",
    "rest_endpoint": "/v2-experimental/boards/{board_id}/mindmap_nodes",
    "recommendation": "keep_shapes_connectors_as_default",
    "rationale": [
        "Native mind maps are experimental in Miro's REST API.",
        "The current native surface supports text-oriented mind map nodes.",
        "Auto-layout is useful for simple hierarchies but gives less control than shapes/connectors.",
    ],
}


def export_native_mindmap_payload(
    graph: dict,
    batch_id: str | None = None,
) -> dict:
    batch_id = batch_id or f"miro-native-mindmap-{uuid4()}"
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    workspace = graph.get("workspace", {})
    parent_by_node = _parent_by_node(edges)
    roots = [node for node in nodes if not parent_by_node.get(node.get("id", ""))]
    ordered_nodes = _topological_nodes(nodes, edges, roots)
    export_batch = ExportBatch.from_payload(
        batch_id=batch_id,
        integration="miro",
        target="native_mindmap_experimental",
        mode="dry_run",
        workspace=workspace,
        scope="workspace",
        item_count=len(ordered_nodes),
        status="experimental_preview",
    ).model_dump()

    return {
        "integration": "miro",
        "mode": "dry_run",
        "target": "native_mindmap_experimental",
        "batch_id": batch_id,
        "export_batch": export_batch,
        "evaluation": NATIVE_MINDMAP_EVALUATION,
        "workspace": workspace,
        "summary": {
            "node_count": len(ordered_nodes),
            "root_count": len(roots) or min(len(ordered_nodes), 1),
            "connector_count": 0,
        },
        "nodes": [
            _native_mindmap_node(node, parent_by_node.get(node.get("id", "")))
            for node in ordered_nodes
        ],
    }


def _parent_by_node(edges: list[dict]) -> dict[str, str]:
    parent_by_node = {}
    for edge in edges:
        source = edge.get("source_node_id", "")
        target = edge.get("target_node_id", "")
        if source and target and target not in parent_by_node:
            parent_by_node[target] = source
    return parent_by_node


def _topological_nodes(nodes: list[dict], edges: list[dict], roots: list[dict]) -> list[dict]:
    nodes_by_id = {node.get("id", ""): node for node in nodes}
    children_by_parent = defaultdict(list)
    for edge in edges:
        source = edge.get("source_node_id", "")
        target = edge.get("target_node_id", "")
        if source and target:
            children_by_parent[source].append(target)

    ordered = []
    seen = set()
    queue = deque(node.get("id", "") for node in roots)
    if not queue and nodes:
        queue.append(nodes[0].get("id", ""))

    while queue:
        node_id = queue.popleft()
        if node_id in seen or node_id not in nodes_by_id:
            continue
        seen.add(node_id)
        ordered.append(nodes_by_id[node_id])
        queue.extend(children_by_parent.get(node_id, []))

    for node in nodes:
        if node.get("id", "") not in seen:
            ordered.append(node)

    return ordered


def _native_mindmap_node(node: dict, parent_node_id: str | None) -> dict:
    source_ref = node.get("source_refs", [{}])[0] if node.get("source_refs") else {}
    return {
        "id": f"mindmap-{node.get('id', '')}",
        "node_id": node.get("id", ""),
        "parent_node_id": parent_node_id or "",
        "parent_item": f"mindmap-{parent_node_id}" if parent_node_id else "",
        "title": node.get("title", ""),
        "node_view": {
            "type": "text",
            "content": node.get("title", ""),
        },
        "metadata": {
            "node_id": node.get("id", ""),
            "node_type": node.get("node_type", ""),
            "review_state": node.get("status", ""),
            "source_document": source_ref.get("document_id", ""),
            "source_page": source_ref.get("page", ""),
            "source_quote": source_ref.get("quote_snippet", ""),
        },
    }
