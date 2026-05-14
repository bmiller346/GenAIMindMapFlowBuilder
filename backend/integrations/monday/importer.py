def import_monday_items(items: list[dict]) -> list[dict]:
    """Convert monday-like items into a neutral task-node shape."""
    return [
        {
            "id": item.get("node_id", ""),
            "title": item.get("name", ""),
            "node_type": "task",
            "status": item.get("status", ""),
        }
        for item in items
    ]
