from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


MAX_SNIPPET_CHARS = 360
SOURCE_SET_INTELLIGENCE_CONTRACT_VERSION = "1"

DOCUMENT_CLASSIFICATIONS = (
    {
        "id": "standards_or_policy",
        "label": "Standards / policy",
        "keywords": ("standard", "policy", "guideline", "requirement", "compliance"),
    },
    {
        "id": "sop_or_workflow",
        "label": "SOP / workflow",
        "keywords": ("sop", "procedure", "workflow", "process", "playbook"),
    },
    {
        "id": "inventory_or_register",
        "label": "Inventory / register",
        "keywords": ("inventory", "register", "list", "catalog", "matrix"),
    },
    {
        "id": "training_or_onboarding",
        "label": "Training / onboarding",
        "keywords": ("training", "onboarding", "guide", "lesson", "tutorial"),
    },
    {
        "id": "roadmap_or_plan",
        "label": "Roadmap / plan",
        "keywords": ("roadmap", "plan", "milestone", "schedule", "timeline"),
    },
    {
        "id": "reference_material",
        "label": "Reference material",
        "keywords": ("reference", "manual", "handbook", "specification", "spec"),
    },
)


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
    source_set_review = _build_source_set_review(
        documents,
        citations,
        workspace_brief=flow_object.get("workspace_brief", {}),
    )

    return {
        "documents": documents,
        "citations": citations,
        "source_sets": [source_set_review["source_set"]],
        "source_set_review": source_set_review,
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
        component_id = str(component.get("_id") or component.get("component_id") or "").strip()
        document_id = str(
            component.get("source_document_id")
            or (source_document or {}).get("id")
            or component_id
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
        for field in ("relative_path", "path", "folder", "source_set_id", "source_set"):
            if field not in document and component.get(field) not in (None, ""):
                document[field] = component.get(field)

        record = _normalize_document_record(document)
        record["component_id"] = component_id
        record["source_document_id"] = document_id
        record["chunks"] = _normalize_chunks(component.get("document_chunks", []))
        record["source_segments"] = _normalize_segments(component.get("source_segments", []))
        documents[document_id] = record
    return documents


def _normalize_document_record(document: dict[str, Any]) -> dict[str, Any]:
    document_id = str(document.get("id") or document.get("document_id") or "").strip()
    record = _empty_document(document_id)
    source_set = document.get("source_set") if isinstance(document.get("source_set"), dict) else {}
    record.update(
        {
            "id": document_id,
            "document_id": str(document.get("document_id") or document_id),
            "source_document_id": str(document.get("source_document_id") or document_id),
            "component_id": str(document.get("component_id") or ""),
            "filename": str(document.get("filename") or document.get("name") or document_id),
            "original_filename": str(
                document.get("original_filename")
                or document.get("original_name")
                or document.get("filename")
                or document_id
            ),
            "type": str(document.get("type") or ""),
            "file_hash": str(document.get("file_hash") or ""),
            "path": str(
                document.get("path")
                or document.get("relative_path")
                or document.get("source_path")
                or ""
            ),
            "relative_path": str(
                document.get("relative_path")
                or document.get("path")
                or document.get("source_path")
                or ""
            ),
            "folder": str(document.get("folder") or ""),
            "source_set_id": str(document.get("source_set_id") or source_set.get("id") or ""),
            "source_set": dict(source_set),
            "size": document.get("size", 0) or 0,
            "version": document.get("version", 1) or 1,
            "status": str(document.get("status") or "uploaded"),
            "classification": str(
                document.get("classification")
                or document.get("document_classification")
                or ""
            ),
            "modified_at": str(
                document.get("modified_at")
                or document.get("last_modified_at")
                or ""
            ),
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
        "document_id": document_id,
        "source_document_id": document_id,
        "component_id": "",
        "filename": document_id,
        "original_filename": document_id,
        "type": "",
        "file_hash": "",
        "path": "",
        "relative_path": "",
        "folder": "",
        "source_set_id": "",
        "source_set": {},
        "size": 0,
        "version": 1,
        "status": "referenced",
        "classification": "",
        "modified_at": "",
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
        chunk_id = str(chunk.get("id") or chunk.get("chunk_id") or "")
        normalized.append(
            {
                "id": chunk_id,
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


def _build_source_set_review(
    documents: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    *,
    workspace_brief: dict[str, Any] | None = None,
) -> dict[str, Any]:
    workspace_brief = workspace_brief if isinstance(workspace_brief, dict) else {}
    duplicate_groups = _duplicate_source_groups(documents)
    duplicate_document_ids = {
        document_id
        for group in duplicate_groups
        for document_id in group["document_ids"]
    }
    classifications = [
        {
            "document_id": document["id"],
            **_classify_document(document),
        }
        for document in documents
    ]
    topic_coverage = _topic_coverage(citations)
    missing_expected_artifacts = [
        {
            "id": _stable_token(artifact),
            "artifact": artifact,
            "status": "missing_or_not_loaded",
            "review_state": "needs_review",
        }
        for artifact in _expected_artifacts(workspace_brief)
        if not any(_document_matches_expected_artifact(document, artifact) for document in documents)
    ]
    stale_sources = [
        {
            "document_id": document["id"],
            "title": document.get("filename") or document["id"],
            "signals": _stale_signals(document),
        }
        for document in documents
        if _stale_signals(document)
    ]
    review_flags = []
    if missing_expected_artifacts:
        review_flags.append(
            {
                "code": "missing_expected_artifacts",
                "severity": "medium",
                "count": len(missing_expected_artifacts),
            }
        )
    if duplicate_groups:
        review_flags.append(
            {
                "code": "possible_duplicate_sources",
                "severity": "medium",
                "count": len(duplicate_groups),
            }
        )
    if stale_sources:
        review_flags.append(
            {
                "code": "possible_stale_sources",
                "severity": "medium",
                "count": len(stale_sources),
            }
        )

    source_set = _source_set_projection(documents)
    return {
        "contract_version": SOURCE_SET_INTELLIGENCE_CONTRACT_VERSION,
        "source_set": source_set,
        "file_inventory": [
            {
                "document_id": document["id"],
                "title": document.get("filename") or document["id"],
                "type": document.get("type", ""),
                "path": document.get("path", ""),
                "relative_path": document.get("relative_path", ""),
                "folder": document.get("folder", ""),
                "source_set_id": document.get("source_set_id", ""),
                "size": document.get("size", 0),
                "file_hash": document.get("file_hash", ""),
                "status": document.get("status", ""),
                "classification": _classify_document(document)["classification"],
                "classification_label": _classify_document(document)["label"],
                "citation_count": document.get("citation_count", 0),
                "chunk_count": document.get("chunk_count", 0),
                "duplicate_group_id": _duplicate_group_id(duplicate_groups, document["id"])
                if document["id"] in duplicate_document_ids
                else "",
                "stale_signals": _stale_signals(document),
            }
            for document in documents
        ],
        "document_classification": classifications,
        "topic_coverage": topic_coverage,
        "stale_sources": stale_sources,
        "duplicate_sources": duplicate_groups,
        "missing_expected_artifacts": missing_expected_artifacts,
        "review_flags": review_flags,
    }


def _source_set_projection(documents: list[dict[str, Any]]) -> dict[str, Any]:
    source_sets = [
        document.get("source_set")
        for document in documents
        if isinstance(document.get("source_set"), dict) and document.get("source_set", {}).get("id")
    ]
    native_folder_upload = bool(source_sets)
    first_source_set = source_sets[0] if source_sets else {}
    source_set_ids = sorted(
        {
            str(document.get("source_set_id") or document.get("source_set", {}).get("id") or "")
            for document in documents
            if str(document.get("source_set_id") or document.get("source_set", {}).get("id") or "")
        }
    )
    root_folders = sorted(
        {
            str(document.get("source_set", {}).get("root_folder") or document.get("folder") or "")
            for document in documents
            if str(document.get("source_set", {}).get("root_folder") or document.get("folder") or "")
        }
    )
    return {
        "id": str(first_source_set.get("id") or "workspace-source-set"),
        "label": str(first_source_set.get("label") or "Loaded source set"),
        "scope_type": "source_set" if native_folder_upload else "loaded_sources",
        "upload_mode": "native_folder_upload" if native_folder_upload else "individual_sources",
        "native_folder_upload": native_folder_upload,
        "source_count": len(documents),
        "source_set_ids": source_set_ids,
        "root_folders": root_folders,
    }


def _classify_document(document: dict[str, Any]) -> dict[str, Any]:
    explicit = str(
        document.get("classification")
        or document.get("document_classification")
        or ""
    ).strip()
    if explicit:
        return {
            "classification": _stable_token(explicit),
            "label": explicit,
            "confidence": "explicit",
            "signals": ["metadata"],
        }

    text = _normalized_text(
        " ".join(
            str(value)
            for value in (
                document.get("filename"),
                document.get("original_filename"),
                document.get("path"),
                document.get("type"),
            )
            if value
        )
    )
    for classification in DOCUMENT_CLASSIFICATIONS:
        signals = [
            keyword
            for keyword in classification["keywords"]
            if keyword in text
        ]
        if signals:
            return {
                "classification": classification["id"],
                "label": classification["label"],
                "confidence": "inferred",
                "signals": signals,
            }

    return {
        "classification": "unclassified",
        "label": "Unclassified",
        "confidence": "unknown",
        "signals": [],
    }


def _topic_coverage(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    topics: dict[str, dict[str, Any]] = {}
    for citation in citations:
        topic_label = citation.get("section") or citation.get("node_title") or "Source coverage"
        topic_id = _stable_token(topic_label)
        entry = topics.setdefault(
            topic_id,
            {
                "id": topic_id,
                "topic": topic_label,
                "document_ids": set(),
                "cited_node_ids": set(),
                "evidence_count": 0,
            },
        )
        entry["document_ids"].add(citation.get("document_id", ""))
        entry["cited_node_ids"].add(citation.get("node_id", ""))
        entry["evidence_count"] += 1

    return [
        {
            "id": topic["id"],
            "topic": topic["topic"],
            "document_ids": sorted(document_id for document_id in topic["document_ids"] if document_id),
            "cited_node_ids": sorted(node_id for node_id in topic["cited_node_ids"] if node_id),
            "evidence_count": topic["evidence_count"],
            "coverage_status": "documented" if topic["evidence_count"] > 1 else "thin",
        }
        for topic in sorted(topics.values(), key=lambda item: item["topic"])
    ]


def _duplicate_source_groups(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for document in documents:
        key = (
            f"hash:{document['file_hash']}"
            if document.get("file_hash")
            else f"title:{_normalized_text(document.get('filename') or document['id'])}"
        )
        grouped[key].append(document)

    return [
        {
            "id": _stable_token(key),
            "reason": "matching_file_hash" if key.startswith("hash:") else "matching_title",
            "document_ids": [document["id"] for document in group],
            "titles": [document.get("filename") or document["id"] for document in group],
        }
        for key, group in grouped.items()
        if len(group) > 1
    ]


def _duplicate_group_id(groups: list[dict[str, Any]], document_id: str) -> str:
    for group in groups:
        if document_id in group["document_ids"]:
            return group["id"]
    return ""


def _stale_signals(document: dict[str, Any]) -> list[str]:
    text = _normalized_text(
        " ".join(
            str(value)
            for value in (
                document.get("filename"),
                document.get("path"),
                document.get("status"),
                document.get("version"),
            )
            if value not in (None, "")
        )
    )
    signals = []
    if re.search(r"\b(old|archive|archived|deprecated|obsolete|superseded|stale)\b", text):
        signals.append("name_or_status_suggests_stale")
    if document.get("superseded_by") or document.get("replaced_by"):
        signals.append("metadata_superseded")
    return signals


def _expected_artifacts(workspace_brief: dict[str, Any]) -> list[str]:
    explicit = workspace_brief.get("expected_artifacts", [])
    artifacts = [str(item).strip() for item in explicit if str(item).strip()] if isinstance(explicit, list) else []
    output_expectations = {
        "source_coverage_report": "source coverage report",
        "completeness_review": "completeness review",
        "source_set_review": "source-set review",
        "missing_info_report": "missing information report",
        "team_roadmap": "team roadmap",
        "tasks": "task list",
        "checklist": "checklist",
    }
    desired_outputs = workspace_brief.get("desired_outputs", [])
    if not isinstance(desired_outputs, list):
        desired_outputs = []
    for output in desired_outputs:
        expected = output_expectations.get(output)
        if expected:
            artifacts.append(expected)
    return list(dict.fromkeys(artifacts))


def _document_matches_expected_artifact(document: dict[str, Any], artifact: str) -> bool:
    generic_tokens = {"source", "set", "review", "report", "artifact"}
    artifact_tokens = [
        token
        for token in _normalized_text(artifact).split()
        if len(token) > 2 and token not in generic_tokens
    ]
    document_text = _normalized_text(
        " ".join(
            str(value)
            for value in (
                document.get("filename"),
                document.get("path"),
                document.get("classification"),
                document.get("type"),
            )
            if value
        )
    )
    return any(token in document_text for token in artifact_tokens)


def _normalized_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def _stable_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-") or "item"


def _snippet(text: str) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= MAX_SNIPPET_CHARS:
        return normalized
    return normalized[: MAX_SNIPPET_CHARS - 1].rstrip() + "..."
