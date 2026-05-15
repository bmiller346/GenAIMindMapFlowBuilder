from __future__ import annotations

from typing import Any

from openai import OpenAI

from ai.schemas import json_schema_response_format
from ai.providers import DocMapGenerationRequest, DocMapGenerationResult


def build_responses_create_payload(request: DocMapGenerationRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": request.model,
        "instructions": request.instructions,
        "input": request.input,
        "store": request.store,
    }
    if request.metadata:
        payload["metadata"] = request.metadata
    if request.response_schema:
        payload["text"] = json_schema_response_format(
            name=request.schema_name,
            schema=request.response_schema,
        )
    return payload


def response_output_text(response: Any) -> str:
    output_text = getattr(response, "output_text", "")
    if output_text:
        return output_text

    output = getattr(response, "output", None)
    if not isinstance(output, list):
        return ""

    text_parts: list[str] = []
    for item in output:
        content = getattr(item, "content", None)
        if not isinstance(content, list):
            continue
        for part in content:
            text = getattr(part, "text", "")
            if text:
                text_parts.append(text)
    return "".join(text_parts)


class OpenAIResponsesDocMapProvider:
    provider = "openai_responses"

    def __init__(self, client: OpenAI | None = None, api_key: str | None = None):
        self.client = client or OpenAI(api_key=api_key)

    def generate_json(self, request: DocMapGenerationRequest) -> DocMapGenerationResult:
        response = self.client.responses.create(
            **build_responses_create_payload(request)
        )
        return DocMapGenerationResult(
            text=response_output_text(response),
            provider=self.provider,
            raw_response=response,
        )
