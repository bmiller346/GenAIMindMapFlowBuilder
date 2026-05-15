from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass(slots=True)
class DocMapGenerationRequest:
    model: str
    instructions: str
    input: str | list[dict[str, Any]]
    response_schema: dict[str, Any] | None = None
    schema_name: str = "docmap_generation"
    metadata: dict[str, str] = field(default_factory=dict)
    store: bool = False


@dataclass(slots=True)
class DocMapGenerationResult:
    text: str
    provider: str
    raw_response: Any | None = None
    model: str = ""


class DocMapAIProvider(Protocol):
    def generate_json(self, request: DocMapGenerationRequest) -> DocMapGenerationResult:
        """Generate a JSON string for a DocMap request."""


class FixtureDocMapAIProvider:
    def __init__(
        self,
        response_text: str | None = None,
        response_factory: Callable[[DocMapGenerationRequest], str] | None = None,
    ):
        self.response_text = response_text
        self.response_factory = response_factory
        self.requests: list[DocMapGenerationRequest] = []

    def generate_json(self, request: DocMapGenerationRequest) -> DocMapGenerationResult:
        self.requests.append(request)
        response_text = (
            self.response_factory(request)
            if self.response_factory is not None
            else self.response_text
        )
        return DocMapGenerationResult(
            text=response_text or "{}",
            provider="fixture",
            raw_response={"fixture": True, "model": request.model},
            model=request.model,
        )
