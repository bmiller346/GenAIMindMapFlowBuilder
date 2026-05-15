from __future__ import annotations

from copy import deepcopy
from typing import Any


AI_HELPER_PREVIEW_CONTRACT_VERSION = "1"
AI_ACTION_PREVIEW_CONTRACT_VERSION = "1"


def json_object_response_format() -> dict[str, Any]:
    return {"format": {"type": "json_object"}}


def json_schema_response_format(
    *,
    name: str,
    schema: dict[str, Any],
    strict: bool = True,
) -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": name,
            "strict": strict,
            "schema": deepcopy(schema),
        }
    }


AI_HELPER_PREVIEW_CONTRACT = f"""
Canonical AI helper preview contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- Top-level fields: preview_id, helper_id, action, scope, generated_by, preview_items, warnings, metadata.
- preview_items must be an array. Each item must include id, preview_type, node_id, title, rationale, confidence, source_refs, assumptions, and proposed_mutation.
- source_refs must be an array. If a proposed item is not source-backed, return source_refs: [] and add a plain-language assumption.
- proposed_mutation must be an object describing changes only. Do not rewrite the entire graph.
- Include metadata.ai_helper_preview_contract_version as "{AI_HELPER_PREVIEW_CONTRACT_VERSION}".
"""
