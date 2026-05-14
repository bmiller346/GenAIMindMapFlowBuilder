from __future__ import annotations

from collections import defaultdict
from typing import Any


MAX_SNIPPET_CHARS = 360


def build_source_library(
    flow_object: dict[str, Any],
    *,
    nodes: list[dict[str, Any]] | None = None,
    source_components: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a compact, durable source library projection for a workspace graph."""
    nodes = nodes or []
    source_components = source_components or []
    existing_library = flow_object.get("source_library", {})
    existing_documents = _existing_documents(existing_library)
    component_documents = _component_documents(source_components)
    document_records: dict[str, dict[str, Any]] = {
        **existing_documents,
        **component_documents,
    }
    citations = _collect_citations(nodes)

    for node in nodes:
        if node.get("node_type") != "reference":
            continue
        refs = node.get("source_refs", [])
        if not refs:
            continue
        document_id = str(refs[0].get("document_id", "")).strip()
        if not document_id:
            continue
        record = document_records.setdefault(
            document_id,
            _empty_document(document_id),
        )
        if node.get("id") not in record["source_node_ids"]:
            record["source_node_ids"].append(node.get("id"))
        if not record.get("filename") or record["filename"] == document_id:
            record["filename"] = node.get("title") or document_id

    for citation in citations:
        document_id = citation["document_id"]
        record = document_records.setdefault(
            document_id,
            _empty_document(document_id),
        )
        record["citation_count"] += 1
        if citation["node_id"] not in record["cited_node_ids"]:
            record["cited_node_ids"].append(citation["node_id"])
        chunk_id = citation.get("chunk_id")
        if chunk_id:
            record["_cited_chunk_ids"].add(chunk_id)
        page = citation.get("page")
        if page not in (None, ""):
            record["_cited_pages"].add(str(page))

    documents = [_finalize_document(record) for record in document_records.values()]
    documents.sort(key=lambda item: (item.get("filename", ""), item.get("id", "")))

    return {
        "documents": documents,
        "citations": citations,
        "failures": _source_failures(existing_library, source_components),
        "summary": {
            "document_count": len(documents),
            "citation_count": len(citations),
            "failure_count": len(_source_failures(existing_library, source_components)),
        },
    }


def _existing_documents(source_library: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if not isinstance(source_library, dict):
        return {}

    documents = {}
    for document in source_library.get("documents", []):
        if not isinstance(document, dict):
            continue
        document_id = str(document.get("id", "") or document.get("document_id", "")).strip()
        if not document_id:
            continue
        documents[document_id] = _normalize_document_record(document)
    return documents


def _component_documents(components: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    documents = {}
    for component in components:
        source_document = component.get("source_document")
        document_id = str(
            component.get("source_document_id")
            or (source_document or {}).get("id")
            or component.get("_id")
            or ""
        ).strip()
        if not document_id:
            continue

        document = dict(source_document) if isinstance(source_document, dict) else {}
        document.setdefault("id", document_id)
        document.setdefault("filename", component.get("name") or document_id)
        document.setdefault("original_filename", component.get("original_name") or document["filename"])
        document.setdefault("type", component.get("type", ""))
        document.setdefault("file_hash", component.get("file_hash", ""))
        document.setdefault("status", component.get("status", "uploaded"))

        record = _normalize_document_record(document)
        record["chunks"] = _normalize_chunks(component.get("document_chunks", []))
        record["source_segments"] = _normalize_segments(component.get("source_segments", []))
        documents[document_id] = record
    return documents


def _normalize_document_record(document: dict[str, Any]) -> dict[str, Any]:
    document_id = str(document.get("id") or document.get("document_id") or "").strip()
    record = _empty_document(document_id)
    record.update(
        {
            "id": document_id,
            "filename": str(document.get("filename") or document.get("name") or document_id),
            "original_filename": str(
                document.get("original_filename")
                or document.get("original_name")
                or document.get("filename")
                or document_id
            ),
            "type": str(document.get("type") or ""),
            "file_hash": str(document.get("file_hash") or ""),
            "size": document.get("size", 0) or 0,
            "version": document.get("version", 1) or 1,
            "status": str(document.get("status") or "uploaded"),
            "source_node_ids": _string_list(document.get("source_node_ids", [])),
            "cited_node_ids": _string_list(document.get("cited_node_ids", [])),
            "chunks": _normalize_chunks(document.get("chunks", [])),
            "source_segments": _normalize_segments(document.get("source_segments", [])),
        }
    )
    return record


def _empty_document(document_id: str) -> dict[str, Any]:
    return {
        "id": document_id,
        "filename": document_id,
        "original_filename": document_id,
        "type": "",
        "file_hash": "",
        "size": 0,
        "version": 1,
        "status": "referenced",
        "source_node_ids": [],
        "cited_node_ids": [],
        "citation_count": 0,
        "chunks": [],
        "source_segments": [],
        "_cited_chunk_ids": set(),
        "_cited_pages": set(),
    }


def _normalize_chunks(chunks: Any) -> list[dict[str, Any]]:
    if not isinstance(chunks, list):
        return []

    normalized = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        text = str(chunk.get("text") or "")
        normalized.append(
            {
                "id": str(chunk.get("id") or ""),
                "document_id": str(chunk.get("document_id") or ""),
                "index": chunk.get("index", len(normalized)),
                "page": chunk.get("page"),
                "heading": chunk.get("heading") or "",
                "start_char": chunk.get("start_char", 0) or 0,
                "end_char": chunk.get("end_char", 0) or 0,
                "snippet": _snippet(text),
            }
        )
    return normalized


def _string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if value not in (None, "")]


def _normalize_segments(segments: Any) -> list[dict[str, Any]]:
    if not isinstance(segments, list):
        return []

    normalized = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text") or "")
        normalized.append(
            {
                "page": segment.get("page"),
                "heading": segment.get("heading") or "",
                "start_char": segment.get("start_char", 0) or 0,
                "end_char": segment.get("end_char", 0) or 0,
                "snippet": _snippet(text),
            }
        )
    return normalized


def _collect_citations(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    citations = []
    seen = set()
    for node in nodes:
        node_id = str(node.get("id", "")).strip()
        if not node_id:
            continue
        for ref in node.get("source_refs", []):
            if not isinstance(ref, dict):
                continue
            document_id = str(ref.get("document_id", "")).strip()
            if not document_id:
                continue
            citation = {
                "node_id": node_id,
                "node_title": node.get("title", ""),
                "document_id": document_id,
                "chunk_id": str(ref.get("chunk_id") or ""),
                "page": ref.get("page"),
                "section": ref.get("section", ""),
                "quote_snippet": ref.get("quote_snippet", ""),
                "confidence": ref.get("confidence", ""),
            }
            key = tuple(citation.items())
            if key in seen:
                continue
            seen.add(key)
            citations.append(citation)
    return citations


def _finalize_document(record: dict[str, Any]) -> dict[str, Any]:
    cited_chunk_ids = record.pop("_cited_chunk_ids", set())
    cited_pages = record.pop("_cited_pages", set())
    chunks = record.get("chunks", [])
    chunk_lookup = {chunk.get("id"): chunk for chunk in chunks if chunk.get("id")}
    for chunk in chunks:
        chunk["cited_by_count"] = 1 if chunk.get("id") in cited_chunk_ids else 0

    all_pages = {
        str(chunk.get("page"))
        for chunk in chunks
        if chunk.get("page") not in (None, "")
    }
    record["chunk_count"] = len(chunks)
    record["segment_count"] = len(record.get("source_segments", []))
    record["coverage"] = {
        "cited_chunks": len(cited_chunk_ids & set(chunk_lookup)),
        "total_chunks": len(chunks),
        "cited_pages": len(cited_pages),
        "total_pages": len(all_pages),
    }
    return record


def _source_failures(
    existing_library: dict[str, Any],
    source_components: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    failures = []
    if isinstance(existing_library, dict):
        for failure in existing_library.get("failures", []):
            if isinstance(failure, dict):
                failures.append(failure)

    for component in source_components:
        status = str(component.get("status") or "")
        error = component.get("error") or component.get("failure") or component.get("failure_reason")
        if status not in {"failed", "error"} and not error:
            continue
        failures.append(
            {
                "document_id": str(component.get("source_document_id") or ""),
                "filename": component.get("name") or component.get("original_name") or "",
                "status": status or "failed",
                "message": str(error or "Source processing failed."),
            }
        )
    return failures


def _snippet(text: str) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= MAX_SNIPPET_CHARS:
        return normalized
    return normalized[: MAX_SNIPPET_CHARS - 1].rstrip() + "..."
