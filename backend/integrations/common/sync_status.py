from dataclasses import dataclass


@dataclass(slots=True)
class SyncStatus:
    platform: str
    state: str
    message: str = ""
