from dataclasses import dataclass, field


@dataclass(slots=True)
class WorkspaceNode:
    id: str
    title: str
    node_type: str
    parent_id: str | None = None
    status: str = "ai_generated"
    external_refs: dict = field(default_factory=dict)
