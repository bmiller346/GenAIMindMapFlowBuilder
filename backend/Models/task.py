from dataclasses import dataclass


@dataclass(slots=True)
class WorkspaceTask:
    id: str
    node_id: str
    title: str
    status: str = "AI Generated"
