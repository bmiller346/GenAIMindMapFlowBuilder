def import_miro_items(items: list[dict]) -> list[dict]:
    """Convert imported Miro-like items into the app's neutral node shape."""
    return [
        {
            "id": item.get("node_id", ""),
            "title": item.get("title", ""),
            "node_type": item.get("node_type", "concept"),
        }
        for item in items
    ]
