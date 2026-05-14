from dataclasses import dataclass


@dataclass(slots=True)
class WorkspaceEdge:
    source_node_id: str
    target_node_id: str
    relationship_type: str = "contains"
