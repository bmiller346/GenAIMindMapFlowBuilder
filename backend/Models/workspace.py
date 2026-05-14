from dataclasses import dataclass, field


@dataclass(slots=True)
class Workspace:
    id: str
    title: str
    document_ids: list[str] = field(default_factory=list)
