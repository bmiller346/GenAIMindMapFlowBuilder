import json
import re
from copy import deepcopy
from typing import Any

from .business_ontology import (
    BUSINESS_ONTOLOGY_CONTRACT,
    KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES,
)
from .schemas import GraphSchemaError


ALLOWED_AI_NODE_TYPES = {"dataSource", "question", "response", "followUp"}
AI_GRAPH_CONTRACT_VERSION = "1"
KNOWLEDGE_GRAPH_SOURCE_SIGNALS = {
    "explicit_text",
    "shared_source",
    "semantic_similarity",
    "user_created",
    "ai_inferred",
    "external_ref",
}
AI_GRAPH_PROMPT_CONTRACT = f"""
Canonical AI graph contract:
- Return exactly one JSON object. Do not wrap it in prose or markdown.
- The top-level object must include nodes, edges, and viewport when artifact_type is mind_map.
- Mind map is one supported artifact type, not the only TraceSpace output. Use registered artifact_type/output_shape instructions when a user requests another artifact.
- nodes must be an array of objects with non-empty string id, type, data, and position.
- Valid node types are dataSource, question, response, and followUp.
- response nodes must include title, question, summ, or summary text.
- edges must be an array of objects with source and target node IDs that already exist in nodes.
- Do not create duplicate node IDs, duplicate edge IDs, self-loop edges, or edges to missing nodes.
- source_refs, when present, must be an array. Each source ref needs a non-empty document_id.
- If a generated node has no grounded source reference, set source_refs to [] and status to needs_review.
- knowledge_graph relationship_edges must follow the TraceSpace relationship contract: source_node_id, target_node_id, relationship_type, source_signal, confidence, rationale, source_refs or assumptions, and review_state.
- Enterprise business maps should use registered business ontology entity types and relationship types when applicable.
- Include metadata.ai_graph_contract_version as "{AI_GRAPH_CONTRACT_VERSION}" when possible.

{BUSINESS_ONTOLOGY_CONTRACT.strip()}
"""


def validate_knowledge_graph_relationship_edge(edge: Any, path: str = "relationship_edge") -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(edge, dict):
        raise GraphSchemaError([f"{path}: must be an object"])

    normalized = deepcopy(edge)
    for key in ("source_node_id", "target_node_id", "relationship_type", "source_signal", "rationale", "review_state"):
        _require_stringish(normalized, key, path, errors)

    if normalized.get("relationship_type") not in KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES:
        errors.append(f"{path}.relationship_type: must be a registered relationship type")
    if normalized.get("source_signal") not in KNOWLEDGE_GRAPH_SOURCE_SIGNALS:
        errors.append(f"{path}.source_signal: must be a registered source signal")
    if normalized.get("source_node_id") == normalized.get("target_node_id"):
        errors.append(f"{path}: source_node_id and target_node_id must be different")

    confidence = normalized.get("confidence")
    if not isinstance(confidence, (int, float, str)):
        errors.append(f"{path}.confidence: must be a number or string")
    elif isinstance(confidence, (int, float)) and not 0 <= confidence <= 1:
        errors.append(f"{path}.confidence: must be between 0 and 1")

    source_refs = normalized.get("source_refs", [])
    assumptions = normalized.get("assumptions", [])
    if source_refs is None:
        source_refs = []
    if assumptions is None:
        assumptions = []
    if not isinstance(source_refs, list):
        errors.append(f"{path}.source_refs: must be a list when provided")
        source_refs = []
    if not isinstance(assumptions, list) or not all(isinstance(item, str) for item in assumptions):
        errors.append(f"{path}.assumptions: must be a list of strings when provided")
        assumptions = []
    for index, source_ref in enumerate(source_refs):
        _validate_source_ref(source_ref, f"{path}.source_refs.{index}", errors)
    if not source_refs and not assumptions:
        errors.append(f"{path}: must include source_refs or assumptions")

    if normalized.get("source_signal") in {"ai_inferred", "semantic_similarity"} and normalized.get("review_state") != "needs_review":
        normalized["review_state"] = "needs_review"

    if errors:
        raise GraphSchemaError(errors)

    normalized["source_refs"] = source_refs
    normalized["assumptions"] = assumptions
    return normalized


def parse_ai_mindmap_response(raw_response: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw_response, dict):
        return validate_ai_mindmap_contract(raw_response)

    if not isinstance(raw_response, str):
        raise GraphSchemaError(["ai_mindmap: response must be a JSON object or string"])

    response_text = _strip_json_fence(raw_response)
    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise GraphSchemaError([f"ai_mindmap: invalid JSON at character {exc.pos}"]) from exc

    return validate_ai_mindmap_contract(parsed)


def append_ai_graph_prompt_contract(prompt: str) -> str:
    if "Canonical AI graph contract:" in prompt:
        return prompt
    return f"{prompt.rstrip()}\n\n{AI_GRAPH_PROMPT_CONTRACT.strip()}\n"


def validate_ai_mindmap_contract(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["ai_mindmap: must be an object"])

    normalized = deepcopy(_unwrap_graph_payload(payload))

    if not isinstance(normalized, dict):
        raise GraphSchemaError(["ai_mindmap: graph must be an object"])

    nodes = normalized.get("nodes")
    edges = normalized.get("edges")
    viewport = normalized.get("viewport", {})

    if not isinstance(nodes, list):
        errors.append("ai_mindmap.nodes: must be a list")
        nodes = []
    if not isinstance(edges, list):
        errors.append("ai_mindmap.edges: must be a list")
        edges = []
    if not isinstance(viewport, dict):
        errors.append("ai_mindmap.viewport: must be an object")

    for index, node in enumerate(nodes):
        _validate_ai_node(node, index, errors)

    node_ids = _collect_node_ids(nodes, errors)

    for index, edge in enumerate(edges):
        _validate_ai_edge(edge, index, node_ids, errors)

    _validate_unique_edge_ids(edges, errors)

    if errors:
        raise GraphSchemaError(errors)

    normalized["nodes"] = nodes
    normalized["edges"] = edges
    normalized["viewport"] = viewport
    metadata = normalized.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
    metadata["ai_graph_contract_version"] = AI_GRAPH_CONTRACT_VERSION
    normalized["metadata"] = metadata
    return normalized


def _collect_node_ids(nodes: list[Any], errors: list[str]) -> set[str]:
    node_ids: set[str] = set()
    seen: set[str] = set()

    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            continue
        clean_id = node_id.strip()
        node_ids.add(clean_id)
        if clean_id in seen:
            errors.append(f"ai_mindmap.nodes.{index}.id: duplicate node id '{clean_id}'")
        seen.add(clean_id)

    return node_ids


def _unwrap_graph_payload(payload: dict[str, Any]) -> dict[str, Any]:
    graph = payload.get("graph")
    if isinstance(graph, dict):
        return graph
    if isinstance(graph, str) and graph.strip():
        try:
            parsed_graph = json.loads(_strip_json_fence(graph))
        except json.JSONDecodeError:
            return payload
        if isinstance(parsed_graph, dict):
            return parsed_graph
    return payload


def _validate_ai_node(node: Any, index: int, errors: list[str]) -> None:
    path = f"ai_mindmap.nodes.{index}"
    if not isinstance(node, dict):
        errors.append(f"{path}: must be an object")
        return

    node_id = node.get("id")
    if not isinstance(node_id, str) or not node_id.strip():
        errors.append(f"{path}.id: must be a non-empty string")

    node_type = node.get("type")
    if node_type not in ALLOWED_AI_NODE_TYPES:
        errors.append(
            f"{path}.type: must be one of {', '.join(sorted(ALLOWED_AI_NODE_TYPES))}"
        )

    data = node.get("data")
    if not isinstance(data, dict):
        errors.append(f"{path}.data: must be an object")
        return

    if node_type == "response":
        _validate_response_data(data, path, errors)
    elif node_type == "dataSource":
        _require_stringish(data, "content", f"{path}.data", errors)
    elif node_type == "question":
        _require_stringish(data, "question", f"{path}.data", errors)

    position = node.setdefault("position", {"x": 0, "y": 0})
    if not isinstance(position, dict):
        errors.append(f"{path}.position: must be an object")
    else:
        _normalize_number(position, "x")
        _normalize_number(position, "y")


def _validate_response_data(data: dict[str, Any], path: str, errors: list[str]) -> None:
    nested = data.get("data")
    target = nested if isinstance(nested, dict) else data

    has_title = _has_text(data.get("title"))
    has_question = _has_text(target.get("question"))
    has_summary = _has_text(target.get("summ")) or _has_text(target.get("summary"))
    if not (has_title or has_question or has_summary):
        errors.append(
            f"{path}.data: response nodes require title, question, summ, or summary text"
        )

    refs = target.get("source_refs", data.get("source_refs", []))
    if refs is not None and not isinstance(refs, list):
        errors.append(f"{path}.data.source_refs: must be a list when provided")
    elif isinstance(refs, list):
        for index, source_ref in enumerate(refs):
            _validate_source_ref(source_ref, f"{path}.data.source_refs.{index}", errors)

    external_refs = target.get("external_refs", data.get("external_refs", {}))
    if external_refs is not None and not isinstance(external_refs, dict):
        errors.append(f"{path}.data.external_refs: must be an object when provided")


def _validate_ai_edge(
    edge: Any,
    index: int,
    node_ids: set[str],
    errors: list[str],
) -> None:
    path = f"ai_mindmap.edges.{index}"
    if not isinstance(edge, dict):
        errors.append(f"{path}: must be an object")
        return

    source = edge.get("source")
    target = edge.get("target")
    _require_stringish(edge, "source", path, errors)
    _require_stringish(edge, "target", path, errors)
    if isinstance(source, str) and source.strip() and source not in node_ids:
        errors.append(f"{path}.source: must reference an existing node id")
    if isinstance(target, str) and target.strip() and target not in node_ids:
        errors.append(f"{path}.target: must reference an existing node id")
    if isinstance(source, str) and isinstance(target, str) and source and source == target:
        errors.append(f"{path}: source and target must be different node ids")
    edge_id = edge.get("id")
    if edge_id in (None, "") and isinstance(source, str) and isinstance(target, str):
        edge["id"] = _deterministic_edge_id(index, source, target)
    elif edge_id is not None and not isinstance(edge_id, str):
        errors.append(f"{path}.id: must be a string when provided")


def _validate_unique_edge_ids(edges: list[Any], errors: list[str]) -> None:
    seen: set[str] = set()

    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            continue
        edge_id = edge.get("id")
        if not isinstance(edge_id, str) or not edge_id.strip():
            continue
        if edge_id in seen:
            errors.append(f"ai_mindmap.edges.{index}.id: duplicate edge id '{edge_id}'")
        seen.add(edge_id)


def _deterministic_edge_id(index: int, source: str, target: str) -> str:
    source_id = _edge_id_token(source)
    target_id = _edge_id_token(target)
    return f"edge-{index + 1}-{source_id}-to-{target_id}"


def _edge_id_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip())
    return token.strip("-") or "node"


def _validate_source_ref(source_ref: Any, path: str, errors: list[str]) -> None:
    if not isinstance(source_ref, dict):
        errors.append(f"{path}: must be an object")
        return

    _require_stringish(source_ref, "document_id", path, errors)

    page = source_ref.get("page")
    if page is not None and not isinstance(page, (int, str)):
        errors.append(f"{path}.page: must be a string, number, or null when provided")

    for key in ("section", "chunk_id", "quote_snippet"):
        value = source_ref.get(key)
        if value is not None and not isinstance(value, str):
            errors.append(f"{path}.{key}: must be a string when provided")

    confidence = source_ref.get("confidence")
    if confidence is not None and not isinstance(confidence, (int, float, str)):
        errors.append(f"{path}.confidence: must be a string or number when provided")


def _require_stringish(
    payload: dict[str, Any],
    key: str,
    path: str,
    errors: list[str],
) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}.{key}: must be a non-empty string")


def _has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize_number(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key, 0)
    try:
        payload[key] = float(value)
    except (TypeError, ValueError):
        payload[key] = 0


def _strip_json_fence(value: str) -> str:
    stripped = value.strip()
    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped
