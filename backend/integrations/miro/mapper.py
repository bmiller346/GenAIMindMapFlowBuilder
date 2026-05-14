def map_workspace_node_to_miro_shape(node: dict) -> dict:
    """Return a neutral Miro-shape export payload from an internal node."""
    source_ref = node.get("source_refs", [{}])[0] if node.get("source_refs") else {}
    return {
        "title": node.get("title", ""),
        "node_id": node.get("id", ""),
        "node_type": node.get("node_type", "concept"),
        "review_state": node.get("status", "ai_generated"),
        "source": {
            "document_id": source_ref.get("document_id", ""),
            "page": source_ref.get("page", ""),
            "section": source_ref.get("section", ""),
        },
        "metadata": node.get("metadata", {}),
    }
