from __future__ import annotations

import copy
import re

MIN_MATCH_SCORE = 2
STOPWORDS = {
    "about",
    "after",
    "also",
    "and",
    "are",
    "for",
    "from",
    "into",
    "that",
    "the",
    "this",
    "with",
    "your",
}


def attach_source_refs_to_mindmap(mindmap_json: dict, source_document: dict, chunks: list[dict]) -> dict:
    if not isinstance(mindmap_json, dict):
        return mindmap_json

    grounded = copy.deepcopy(mindmap_json)
    nodes = grounded.get("nodes", [])
    if not isinstance(nodes, list):
        return grounded

    for node in nodes:
        if not isinstance(node, dict):
            continue

        data = node.get("data")
        if not isinstance(data, dict):
            continue

        if node.get("type") == "dataSource":
            data.setdefault("source_refs", [_document_level_ref(source_document)])
            continue

        target = data.get("data") if isinstance(data.get("data"), dict) else data
        if target.get("source_refs"):
            continue

        node_text = _node_text(node, data, target)
        source_ref = _best_source_ref(node_text, source_document, chunks)
        if source_ref:
            target["source_refs"] = [source_ref]
        elif _is_generated_node(node):
            target.setdefault("source_refs", [])
            target.setdefault("status", "needs_review")

    return grounded


def _document_level_ref(source_document: dict) -> dict:
    return {
        "document_id": source_document.get("id", ""),
        "page": None,
        "section": "",
        "chunk_id": "",
        "quote_snippet": "",
        "confidence": "document",
    }


def _node_text(node: dict, data: dict, target: dict) -> str:
    values = [
        data.get("title"),
        data.get("question"),
        data.get("content"),
        data.get("prompt"),
        target.get("question"),
        target.get("summ"),
        node.get("type"),
    ]
    return " ".join(str(value) for value in values if value)


def _is_generated_node(node: dict) -> bool:
    node_type = node.get("type")
    return node_type not in {"dataSource", "question"}


def _best_source_ref(node_text: str, source_document: dict, chunks: list[dict]) -> dict | None:
    node_terms = _terms(node_text)
    if not node_terms:
        return None

    best_chunk = None
    best_score = 0

    for chunk in chunks:
        chunk_terms = _terms(chunk.get("text", ""))
        score = len(node_terms.intersection(chunk_terms))
        if score > best_score:
            best_score = score
            best_chunk = chunk

    if not best_chunk or best_score < MIN_MATCH_SCORE:
        return None

    return {
        "document_id": source_document.get("id", best_chunk.get("document_id", "")),
        "page": best_chunk.get("page"),
        "section": best_chunk.get("heading") or "",
        "chunk_id": best_chunk.get("id", ""),
        "quote_snippet": _quote_snippet(best_chunk.get("text", "")),
        "confidence": "inferred",
    }


def _terms(text: str) -> set[str]:
    terms = set()
    for term in re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", text.lower()):
        if term not in STOPWORDS:
            terms.add(term)
    return terms


def _quote_snippet(text: str, limit: int = 240) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "..."
