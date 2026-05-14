from dataclasses import dataclass, field


@dataclass(slots=True)
class ExternalRef:
    platform: str
    container_id: str
    item_id: str
    url: str | None = None
    metadata: dict = field(default_factory=dict)
