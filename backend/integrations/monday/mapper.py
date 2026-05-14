def map_task_node_to_monday_item(node: dict) -> dict:
    """Return a neutral monday item payload from an internal task-like node."""
    source_ref = node.get("source_refs", [{}])[0] if node.get("source_refs") else {}
    return {
        "name": node.get("title", ""),
        "node_id": node.get("id", ""),
        "status": node.get("status", "AI Generated"),
        "priority": node.get("priority", ""),
        "source_document": source_ref.get("document_id", ""),
        "source_page": source_ref.get("page", ""),
        "node_type": node.get("node_type", "task"),
    }
