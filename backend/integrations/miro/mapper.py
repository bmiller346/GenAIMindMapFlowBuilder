def map_workspace_node_to_miro_shape(
    node: dict,
    position: dict | None = None,
    export_batch: dict | None = None,
) -> dict:
    """Return a neutral Miro-shape export payload from an internal node."""
    source_ref = node.get("source_refs", [{}])[0] if node.get("source_refs") else {}
    external_refs = node.get("external_refs", {})
    return {
        "id": f"shape-{node.get('id', '')}",
        "title": node.get("title", ""),
        "node_id": node.get("id", ""),
        "node_type": node.get("node_type", "concept"),
        "review_state": node.get("status", "ai_generated"),
        "shape": _shape_for_node_type(node.get("node_type", "concept")),
        "position": position or _node_position(node),
        "size": _shape_size(node),
        "style": _shape_style(node),
        "priority": node.get("priority", ""),
        "owner_id": node.get("owner_id", ""),
        "due_date": node.get("due_date", ""),
        "confidence": node.get("confidence", ""),
        "source": {
            "document_id": source_ref.get("document_id", ""),
            "page": source_ref.get("page", ""),
            "section": source_ref.get("section", ""),
            "quote_snippet": source_ref.get("quote_snippet", ""),
        },
        "external_refs": {
            "miro": external_refs.get("miro", {}),
        },
        "export_batch": export_batch or {},
        "export_batch_id": (export_batch or {}).get("id", ""),
        "metadata": node.get("metadata", {}),
    }


def map_workspace_edge_to_miro_connector(
    edge: dict,
    export_batch: dict | None = None,
) -> dict:
    """Return a neutral Miro connector payload from an internal graph edge."""
    source = edge.get("source_node_id", "")
    target = edge.get("target_node_id", "")
    return {
        "id": f"connector-{edge.get('id') or source + '-' + target}",
        "edge_id": edge.get("id", ""),
        "source_node_id": source,
        "target_node_id": target,
        "start_item": f"shape-{source}",
        "end_item": f"shape-{target}",
        "relationship_type": edge.get("relationship_type", "contains"),
        "style": {
            "strokeColor": "#6b7280",
            "strokeWidth": 2,
            "endStrokeCap": "arrow",
        },
        "metadata": edge.get("metadata", {}),
        "export_batch": export_batch or {},
        "export_batch_id": (export_batch or {}).get("id", ""),
    }


def _node_position(node: dict) -> dict:
    metadata = node.get("metadata", {})
    position = metadata.get("position", {}) if isinstance(metadata, dict) else {}
    return {
        "x": position.get("x", 0) if isinstance(position, dict) else 0,
        "y": position.get("y", 0) if isinstance(position, dict) else 0,
    }


def _shape_for_node_type(node_type: str) -> str:
    if node_type in {"task", "procedure", "workflow"}:
        return "round_rectangle"
    if node_type == "reference":
        return "document"
    if node_type == "question":
        return "parallelogram"
    return "rectangle"


def _shape_size(node: dict) -> dict:
    title_length = len(str(node.get("title", "")))
    return {
        "width": max(220, min(360, title_length * 8)),
        "height": 96,
    }


def _shape_style(node: dict) -> dict:
    node_type = node.get("node_type", "concept")
    fill_colors = {
        "task": "#e0f2fe",
        "procedure": "#dcfce7",
        "workflow": "#ede9fe",
        "reference": "#fef3c7",
        "question": "#fce7f3",
        "needs_review": "#fee2e2",
    }
    return {
        "fillColor": fill_colors.get(node_type, "#f8fafc"),
        "borderColor": "#334155",
        "borderWidth": 1,
        "fontFamily": "Arial",
        "fontSize": 16,
    }
