from __future__ import annotations

from typing import Any

import httpx

from ai.schemas import json_schema_response_format
from ai.providers import DocMapGenerationRequest, DocMapGenerationResult

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


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
    if isinstance(response, dict):
        output_text = response.get("output_text", "")
        if output_text:
            return str(output_text)

        output = response.get("output")
        if not isinstance(output, list):
            return ""

        text_parts: list[str] = []
        for item in output:
            content = item.get("content") if isinstance(item, dict) else None
            if not isinstance(content, list):
                continue
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text", "")
                    if text:
                        text_parts.append(str(text))
        return "".join(text_parts)

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


def response_usage(response: Any) -> dict[str, int]:
    usage = response.get("usage") if isinstance(response, dict) else getattr(response, "usage", None)
    if not usage:
        return {}

    def read_int(*keys: str) -> int:
        for key in keys:
            value = usage.get(key) if isinstance(usage, dict) else getattr(usage, key, None)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return int(value)
        return 0

    input_tokens = read_int("input_tokens", "prompt_tokens")
    output_tokens = read_int("output_tokens", "completion_tokens")
    total_tokens = read_int("total_tokens")
    if not total_tokens and (input_tokens or output_tokens):
        total_tokens = input_tokens + output_tokens
    result = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }
    return {key: value for key, value in result.items() if value}


def _response_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:1000]
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)
        detail = data.get("detail")
        if detail:
            return str(detail)
    return str(data)[:1000]


def post_openai_responses_json(api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = httpx.post(
        OPENAI_RESPONSES_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=90.0,
    )
    if response.status_code >= 400:
        detail = _response_error_detail(response)
        raise RuntimeError(
            f"OpenAI Responses API failed ({response.status_code}): {detail}"
        )
    return response.json()


class OpenAIResponsesDocMapProvider:
    provider = "openai_responses"

    def __init__(self, client: Any | None = None, api_key: str | None = None):
        self.api_key = api_key or ""
        if client is not None:
            self.client = client
            return
        try:
            from openai import OpenAI
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "The openai package is required for live Responses generation."
            ) from exc
        self.client = OpenAI(api_key=api_key)

    def generate_json(self, request: DocMapGenerationRequest) -> DocMapGenerationResult:
        payload = build_responses_create_payload(request)
        if hasattr(self.client, "responses"):
            response = self.client.responses.create(**payload)
        else:
            if not self.api_key:
                raise RuntimeError(
                    "Installed OpenAI SDK does not expose client.responses and no API key was provided for direct Responses API fallback."
                )
            response = post_openai_responses_json(self.api_key, payload)
        return DocMapGenerationResult(
            text=response_output_text(response),
            provider=self.provider,
            raw_response=response,
            model=(response.get("model") if isinstance(response, dict) else getattr(response, "model", "")) or request.model,
            usage=response_usage(response),
        )
