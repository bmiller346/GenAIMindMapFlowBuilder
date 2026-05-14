from .mapper import map_task_node_to_monday_item


def export_tasks_to_monday_payload(task_nodes: list[dict]) -> dict:
    """Build a transport-neutral monday export payload for later API delivery."""
    return {
        "items": [map_task_node_to_monday_item(node) for node in task_nodes]
    }
