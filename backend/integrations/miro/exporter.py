from .mapper import map_workspace_node_to_miro_shape


def export_branch_to_miro_payload(branch_nodes: list[dict]) -> dict:
    """Build a transport-neutral Miro export payload for later API delivery."""
    return {
        "items": [map_workspace_node_to_miro_shape(node) for node in branch_nodes]
    }
