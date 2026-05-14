from dataclasses import dataclass


@dataclass(slots=True)
class SourceRef:
    document_id: str
    page: int | None = None
    section: str | None = None
    quote_snippet: str | None = None
