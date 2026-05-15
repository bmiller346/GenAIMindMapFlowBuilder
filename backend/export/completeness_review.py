from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


COMPLETENESS_REVIEW_CONTRACT_VERSION = "1"
STALE_SIGNALS = {
    "deprecated",
    "obsolete",
    "superseded",
    "retired",
    "legacy",
    "archived",
    "outdated",
    "old standard",
}
CONFLICT_SIGNALS = {
    "conflict",
    "contradict",
    "duplicate",
    "overlap",
    "inconsistent",
    "superseded",
}
STOPWORDS = {"and", "or", "the", "a", "an", "of", "for", "to", "in", "on"}


REVIT_BIM_EXPECTATIONS = [
    "Templates",
    "Families and content library",
    "Shared parameters",
    "Views and view templates",
    "Sheets and titleblocks",
    "Worksharing and model coordination",
    "Naming conventions",
    "QA/QC review process",
    "Content ownership",
    "Training and support",
]

STANDARDS_EXPECTATIONS = [
    "Governance and ownership",
    "Naming conventions",
    "Procedures and workflows",
    "QA/QC review process",
    "Exceptions and approvals",
    "Version and change management",
    "Training and support",
]


def build_completeness_review(
    graph: dict[str, Any],
    *,
    domain_profile: dict[str, Any] | None = None,
    expected_coverage: list[Any] | None = None,
) -> dict[str, Any]:
    """Project a source-backed completeness review from graph and source-library signals."""
    nodes = [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("node_type") != "reference"
    ]
    source_library = graph.get("source_library", {})
    documents = (
        source_library.get("documents", [])
        if isinstance(source_library, dict) and isinstance(source_library.get("documents"), list)
        else []
    )
    failures = (
        source_library.get("failures", [])
        if isinstance(source_library, dict) and isinstance(source_library.get("failures"), list)
        else []
    )
    expectations = _domain_expectations(
        graph,
        domain_profile=domain_profile,
        expected_coverage=expected_coverage,
    )
    evidence = _evidence_index(nodes, documents)

    covered: list[dict[str, Any]] = []
    partial: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    for expectation in expectations:
        item = _area_item(expectation, evidence)
        if item["coverage_status"] == "covered":
            covered.append(item)
        elif item["coverage_status"] == "partial":
            partial.append(item)
        else:
            missing.append(item)

    duplicate_conflicting = _duplicate_conflicting_candidates(nodes, documents, evidence)
    stale_deprecated = _stale_deprecated_candidates(nodes, documents)
    sme_questions = _sme_questions(missing, partial, duplicate_conflicting, stale_deprecated)
    roadmap = _roadmap(
        missing,
        partial,
        duplicate_conflicting,
        stale_deprecated,
        failures,
    )

    source_backed_count = len(covered) + sum(1 for item in partial if item.get("source_refs"))
    title = graph.get("workspace", {}).get("title") or "Workspace"
    summary = (
        f"{len(expectations)} expected area(s), {len(covered)} covered, "
        f"{len(partial)} partial, {len(missing)} missing, "
        f"{len(duplicate_conflicting)} duplicate/conflicting candidate(s), and "
        f"{len(stale_deprecated)} stale/deprecated candidate(s)."
    )

    return {
        "contract_version": COMPLETENESS_REVIEW_CONTRACT_VERSION,
        "title": f"{title} Completeness Review",
        "summary": summary,
        "covered_areas": covered,
        "missing_areas": missing,
        "partial_areas": partial,
        "duplicate_conflicting_areas": duplicate_conflicting,
        "stale_deprecated_candidates": stale_deprecated,
        "sme_questions": sme_questions,
        "recommended_roadmap": roadmap,
        "checklist_suggestions": _checklist_suggestions(roadmap),
        "metadata": {
            "expected_area_count": len(expectations),
            "source_document_count": len(documents),
            "source_failure_count": len(failures),
            "source_backed_area_count": source_backed_count,
            "expectation_sources": sorted(
                {source for item in expectations for source in item.get("expectation_sources", [])}
            ),
            "projection_source": "workspace_graph_source_library",
        },
    }


def export_completeness_review_markdown(review: dict[str, Any]) -> str:
    sections = [
        ("Summary", review.get("summary", "")),
        ("Covered Areas", _area_lines(review.get("covered_areas", []))),
        ("Missing Areas", _area_lines(review.get("missing_areas", []))),
        ("Partial Areas", _area_lines(review.get("partial_areas", []))),
        (
            "Duplicate Or Conflicting Candidates",
            _area_lines(review.get("duplicate_conflicting_areas", [])),
        ),
        (
            "Stale Or Deprecated Candidates",
            _area_lines(review.get("stale_deprecated_candidates", [])),
        ),
        ("SME Questions", _question_lines(review.get("sme_questions", []))),
        ("Roadmap", _roadmap_lines(review.get("recommended_roadmap", []))),
        ("Checklist Suggestions", _roadmap_lines(review.get("checklist_suggestions", []))),
    ]
    body = "\n\n".join(
        f"## {heading}\n\n{content or '_No items projected._'}"
        for heading, content in sections
    )
    return f"# {review.get('title') or 'Completeness Review'}\n\n{body}\n"


def _domain_expectations(
    graph: dict[str, Any],
    *,
    domain_profile: dict[str, Any] | None,
    expected_coverage: list[Any] | None,
) -> list[dict[str, Any]]:
    expectations: list[dict[str, Any]] = []
    expectations.extend(_normalize_expectations(expected_coverage, "explicit_expected_coverage"))
    expectations.extend(_profile_expectations(domain_profile))

    brief = graph.get("workspace", {}).get("brief", {})
    if isinstance(brief, dict):
        expectations.extend(
            _normalize_expectations(brief.get("expected_coverage"), "workspace_brief")
        )
        expectations.extend(_normalize_expectations(brief.get("coverage_areas"), "workspace_brief"))
        expectations.extend(_review_rule_expectations(brief.get("review_rules")))

    if not expectations:
        domain_text = " ".join(
            str(value or "")
            for value in [
                brief.get("domain_context", "") if isinstance(brief, dict) else "",
                brief.get("goal", "") if isinstance(brief, dict) else "",
                graph.get("workspace", {}).get("title", ""),
                graph.get("workspace", {}).get("summary", ""),
            ]
        ).lower()
        if any(term in domain_text for term in ("revit", "bim", "building information model")):
            expectations.extend(_normalize_expectations(REVIT_BIM_EXPECTATIONS, "revit_bim_fallback"))
        elif "standard" in domain_text or "compliance" in domain_text:
            expectations.extend(_normalize_expectations(STANDARDS_EXPECTATIONS, "standards_fallback"))

    if not expectations:
        expectations.extend(_node_expectations(graph.get("nodes", [])))

    return _dedupe_expectations(expectations)


def _profile_expectations(profile: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(profile, dict):
        return []
    values: list[dict[str, Any]] = []
    for key in (
        "expected_coverage",
        "coverage_areas",
        "required_sections",
        "expectations",
    ):
        values.extend(_normalize_expectations(profile.get(key), f"domain_profile.{key}"))
    completeness = profile.get("completeness_review")
    if isinstance(completeness, dict):
        for key in ("expected_coverage", "coverage_areas", "required_sections"):
            values.extend(
                _normalize_expectations(completeness.get(key), f"domain_profile.completeness_review.{key}")
            )
    return values


def _normalize_expectations(values: Any, source: str) -> list[dict[str, Any]]:
    if not isinstance(values, list):
        return []
    normalized = []
    for index, value in enumerate(values):
        if isinstance(value, str):
            title = value.strip()
            aliases: list[str] = []
            description = ""
            priority = ""
        elif isinstance(value, dict):
            title = str(
                value.get("title")
                or value.get("name")
                or value.get("label")
                or value.get("area")
                or ""
            ).strip()
            aliases = _string_list(value.get("aliases", []))
            description = str(value.get("description") or value.get("rationale") or "")
            priority = str(value.get("priority") or "")
        else:
            continue
        if not title:
            continue
        normalized.append(
            {
                "id": _stable_id("expected", title or str(index)),
                "title": title,
                "description": description,
                "priority": priority,
                "aliases": aliases,
                "expectation_sources": [source],
            }
        )
    return normalized


def _review_rule_expectations(review_rules: Any) -> list[dict[str, Any]]:
    if not isinstance(review_rules, str) or not review_rules.strip():
        return []
    lines = [
        re.sub(r"^[-*0-9.\s]+", "", line).strip()
        for line in review_rules.splitlines()
    ]
    candidates = [line for line in lines if 4 <= len(line) <= 80]
    return _normalize_expectations(candidates, "workspace_brief.review_rules")


def _node_expectations(nodes: Any) -> list[dict[str, Any]]:
    if not isinstance(nodes, list):
        return []
    candidates = []
    for node in nodes:
        if not isinstance(node, dict) or node.get("node_type") == "reference":
            continue
        if node.get("parent_id") not in (None, ""):
            continue
        title = str(node.get("title") or "").strip()
        if title:
            candidates.append(title)
    return _normalize_expectations(candidates[:12], "graph_root_nodes")


def _dedupe_expectations(expectations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for expectation in expectations:
        key = _canonical(expectation.get("title", ""))
        if not key:
            continue
        existing = deduped.get(key)
        if not existing:
            deduped[key] = expectation
            continue
        existing["aliases"] = sorted({*existing.get("aliases", []), *expectation.get("aliases", [])})
        existing["expectation_sources"] = sorted(
            {
                *existing.get("expectation_sources", []),
                *expectation.get("expectation_sources", []),
            }
        )
    return list(deduped.values())


def _evidence_index(nodes: list[dict[str, Any]], documents: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "nodes": nodes,
        "documents": [document for document in documents if isinstance(document, dict)],
        "document_lookup": {
            str(document.get("id") or document.get("document_id") or ""): document
            for document in documents
            if isinstance(document, dict)
        },
    }


def _area_item(expectation: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    tokens = _expectation_tokens(expectation)
    matched_nodes = [
        node for node in evidence["nodes"] if _matches_text(tokens, _node_text(node))
    ]
    matched_sources = [
        source
        for source in _source_evidence(evidence["documents"])
        if _matches_text(tokens, source["text"])
    ]
    source_refs = _source_refs(matched_nodes, evidence["document_lookup"])
    complete_refs = [ref for ref in source_refs if ref.get("document_id") and (ref.get("page") or ref.get("section"))]
    confidence = _coverage_confidence(matched_nodes, matched_sources, complete_refs)
    if complete_refs and confidence >= 0.72:
        status = "covered"
    elif matched_nodes or matched_sources or source_refs:
        status = "partial"
    else:
        status = "missing"

    return {
        "id": expectation["id"],
        "title": expectation["title"],
        "description": expectation.get("description", ""),
        "coverage_status": status,
        "priority": expectation.get("priority", ""),
        "confidence": round(confidence, 2),
        "source_refs": source_refs[:6],
        "matched_node_ids": [node.get("id", "") for node in matched_nodes[:6]],
        "matched_documents": _matched_documents(matched_sources),
        "rationale": _area_rationale(status, matched_nodes, matched_sources, complete_refs),
        "needs_review": status != "covered",
        "metadata": {
            "expectation_sources": expectation.get("expectation_sources", []),
            "aliases": expectation.get("aliases", []),
        },
    }


def _duplicate_conflicting_candidates(
    nodes: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    evidence: dict[str, Any],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    title_groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        key = _canonical(node.get("title", ""))
        if key:
            title_groups[key].append(node)
    for key, group in title_groups.items():
        if len(group) < 2:
            continue
        candidates.append(
            {
                "id": f"duplicate-node-{key}",
                "title": group[0].get("title") or key,
                "candidate_type": "duplicate_node",
                "severity": "medium",
                "source_refs": _source_refs(group, evidence["document_lookup"])[:6],
                "matched_node_ids": [node.get("id", "") for node in group],
                "rationale": f"{len(group)} graph nodes use the same normalized title.",
                "needs_review": True,
            }
        )

    file_hash_groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    filename_groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for document in documents:
        if not isinstance(document, dict):
            continue
        file_hash = str(document.get("file_hash") or "").strip()
        if file_hash:
            file_hash_groups[file_hash].append(document)
        name_key = _canonical(document.get("filename") or document.get("original_filename") or "")
        if name_key:
            filename_groups[name_key].append(document)
    for group_key, group in {**file_hash_groups, **filename_groups}.items():
        if len(group) < 2:
            continue
        title = group[0].get("filename") or group[0].get("id") or group_key
        candidates.append(
            {
                "id": f"duplicate-source-{_stable_key(group_key)}",
                "title": title,
                "candidate_type": "duplicate_source",
                "severity": "medium",
                "source_refs": [_document_ref(document) for document in group],
                "matched_documents": [document.get("id") or document.get("document_id") for document in group],
                "rationale": f"{len(group)} source records appear to represent the same file or filename.",
                "needs_review": True,
            }
        )

    for source in _source_evidence(documents):
        text = source["text"].lower()
        if any(signal in text for signal in CONFLICT_SIGNALS):
            candidates.append(
                {
                    "id": f"conflict-{_stable_key(source['document_id'] + source['text'][:40])}",
                    "title": source["heading"] or source["filename"] or "Potential conflict",
                    "candidate_type": "conflict_signal",
                    "severity": "high",
                    "source_refs": [source["source_ref"]],
                    "matched_documents": [source["document_id"]],
                    "rationale": "Source text contains overlap, duplicate, superseded, or conflict language.",
                    "needs_review": True,
                }
            )
    return candidates[:20]


def _stale_deprecated_candidates(
    nodes: list[dict[str, Any]],
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for node in nodes:
        text = _node_text(node)
        if any(signal in text for signal in STALE_SIGNALS):
            candidates.append(
                {
                    "id": f"stale-node-{node.get('id', 'item')}",
                    "title": node.get("title") or "Stale graph item",
                    "candidate_type": "stale_node",
                    "severity": "medium",
                    "source_refs": [
                        ref for ref in node.get("source_refs", []) if isinstance(ref, dict)
                    ],
                    "matched_node_ids": [node.get("id", "")],
                    "rationale": "Graph node includes stale or deprecated language.",
                    "needs_review": True,
                }
            )
    for document in documents:
        if not isinstance(document, dict):
            continue
        doc_text = " ".join(
            str(value or "")
            for value in [
                document.get("filename"),
                document.get("original_filename"),
                document.get("status"),
            ]
        ).lower()
        snippets = [
            source
            for source in _source_evidence([document])
            if any(signal in source["text"].lower() for signal in STALE_SIGNALS)
        ]
        if any(signal in doc_text for signal in STALE_SIGNALS) or snippets:
            candidates.append(
                {
                    "id": f"stale-source-{_stable_key(str(document.get('id') or document.get('document_id') or 'source'))}",
                    "title": document.get("filename") or document.get("id") or "Stale source",
                    "candidate_type": "stale_source",
                    "severity": "medium",
                    "source_refs": [_document_ref(document), *[snippet["source_ref"] for snippet in snippets[:3]]],
                    "matched_documents": [document.get("id") or document.get("document_id")],
                    "rationale": "Source metadata or text includes stale or deprecated language.",
                    "needs_review": True,
                }
            )
    return candidates[:20]


def _sme_questions(
    missing: list[dict[str, Any]],
    partial: list[dict[str, Any]],
    duplicates: list[dict[str, Any]],
    stale: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    questions = []
    for item in missing[:8]:
        questions.append(
            _question(
                item,
                f"Should '{item['title']}' be part of the expected standard, and who owns the source of truth?",
                "missing_area",
            )
        )
    for item in partial[:8]:
        questions.append(
            _question(
                item,
                f"What source, page, or section completes coverage for '{item['title']}'?",
                "partial_area",
            )
        )
    for item in duplicates[:5]:
        questions.append(
            _question(
                item,
                f"Which item is authoritative for '{item['title']}', and should duplicates be merged or retired?",
                "duplicate_or_conflict",
            )
        )
    for item in stale[:5]:
        questions.append(
            _question(
                item,
                f"Is '{item['title']}' current guidance, or should it be updated or deprecated?",
                "stale_or_deprecated",
            )
        )
    return questions[:20]


def _roadmap(
    missing: list[dict[str, Any]],
    partial: list[dict[str, Any]],
    duplicates: list[dict[str, Any]],
    stale: list[dict[str, Any]],
    failures: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    roadmap = []
    order = 1
    for item in duplicates[:5]:
        roadmap.append(_roadmap_item(order, item, "Resolve conflicting or duplicate guidance", "high"))
        order += 1
    for item in stale[:5]:
        roadmap.append(_roadmap_item(order, item, "Review stale or deprecated guidance", "high"))
        order += 1
    for item in missing[:8]:
        roadmap.append(_roadmap_item(order, item, "Create or attach missing source coverage", "medium"))
        order += 1
    for item in partial[:8]:
        roadmap.append(_roadmap_item(order, item, "Strengthen partial coverage with precise citations", "medium"))
        order += 1
    for failure in failures[:5]:
        title = failure.get("filename") or failure.get("document_id") or "Failed source"
        roadmap.append(
            {
                "id": f"roadmap-{order}-source-failure",
                "order": order,
                "title": f"Reprocess source: {title}",
                "action": "Repair failed source ingestion before final completeness signoff.",
                "priority": "high",
                "status": "needs_review",
                "area_id": "",
                "checklist": [
                    "Confirm the source file can be opened.",
                    "Re-upload or reprocess the source.",
                    "Rerun completeness review after ingestion succeeds.",
                ],
                "source_refs": [],
            }
        )
        order += 1
    return roadmap[:25]


def _checklist_suggestions(roadmap: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"checklist-{item.get('id', index)}",
            "label": item.get("title", "Review completeness item"),
            "note": item.get("action", ""),
            "priority": item.get("priority", ""),
            "review_required": True,
            "source_refs": item.get("source_refs", []),
        }
        for index, item in enumerate(roadmap, start=1)
    ]


def _source_evidence(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evidence = []
    for document in documents:
        document_id = str(document.get("id") or document.get("document_id") or "")
        filename = str(document.get("filename") or document.get("original_filename") or document_id)
        for collection_key in ("chunks", "source_segments"):
            values = document.get(collection_key, [])
            if not isinstance(values, list):
                continue
            for value in values:
                if not isinstance(value, dict):
                    continue
                text = str(value.get("snippet") or value.get("text") or "")
                if not text:
                    continue
                evidence.append(
                    {
                        "document_id": document_id,
                        "filename": filename,
                        "heading": value.get("heading", ""),
                        "text": " ".join([filename, str(value.get("heading") or ""), text]),
                        "source_ref": {
                            "document_id": document_id,
                            "chunk_id": str(value.get("id") or value.get("chunk_id") or ""),
                            "page": value.get("page"),
                            "section": value.get("heading") or "",
                            "quote_snippet": text[:280],
                        },
                    }
                )
    return evidence


def _source_refs(nodes: list[dict[str, Any]], document_lookup: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    refs = []
    seen = set()
    for node in nodes:
        for ref in node.get("source_refs", []):
            if not isinstance(ref, dict) or not ref.get("document_id"):
                continue
            document = document_lookup.get(str(ref.get("document_id")), {})
            normalized = {
                "document_id": ref.get("document_id", ""),
                "document_title": document.get("filename") or document.get("original_filename") or "",
                "page": ref.get("page"),
                "section": ref.get("section", ""),
                "chunk_id": ref.get("chunk_id", ""),
                "quote_snippet": ref.get("quote_snippet", ""),
                "confidence": ref.get("confidence", node.get("confidence", "")),
                "node_id": node.get("id", ""),
            }
            key = tuple(normalized.items())
            if key not in seen:
                seen.add(key)
                refs.append(normalized)
    return refs


def _matched_documents(matched_sources: list[dict[str, Any]]) -> list[dict[str, str]]:
    docs = {}
    for source in matched_sources:
        docs[source["document_id"]] = {
            "document_id": source["document_id"],
            "title": source["filename"],
        }
    return list(docs.values())[:6]


def _coverage_confidence(
    matched_nodes: list[dict[str, Any]],
    matched_sources: list[dict[str, Any]],
    complete_refs: list[dict[str, Any]],
) -> float:
    if not matched_nodes and not matched_sources and not complete_refs:
        return 0.0
    score = 0.2
    if matched_sources:
        score += 0.25
    if matched_nodes:
        score += 0.2
    if complete_refs:
        score += 0.25
    confidences = [_parse_confidence(ref.get("confidence")) for ref in complete_refs]
    confidences = [value for value in confidences if value is not None]
    if confidences:
        score += min(0.1, sum(confidences) / len(confidences) * 0.1)
    return max(0.0, min(1.0, score))


def _area_rationale(
    status: str,
    matched_nodes: list[dict[str, Any]],
    matched_sources: list[dict[str, Any]],
    complete_refs: list[dict[str, Any]],
) -> str:
    if status == "covered":
        return "Graph nodes and precise source references cover this expected area."
    if matched_nodes and not complete_refs:
        return "Graph mentions this area, but citations are missing or too imprecise."
    if matched_sources and not matched_nodes:
        return "Source text appears to mention this area, but no graph node has accepted coverage."
    if matched_sources or complete_refs:
        return "Some source evidence exists, but coverage needs SME confirmation."
    return "No graph or source-library evidence matched this expected area."


def _question(item: dict[str, Any], text: str, reason: str) -> dict[str, Any]:
    return {
        "id": f"question-{reason}-{_stable_key(item.get('id', item.get('title', 'item')))}",
        "question": text,
        "target_area_id": item.get("id", ""),
        "target_title": item.get("title", ""),
        "reason": reason,
        "priority": item.get("priority") or item.get("severity") or "medium",
        "source_refs": item.get("source_refs", []),
    }


def _roadmap_item(order: int, item: dict[str, Any], action: str, priority: str) -> dict[str, Any]:
    return {
        "id": f"roadmap-{order}-{_stable_key(item.get('id', item.get('title', 'item')))}",
        "order": order,
        "title": item.get("title", "Completeness item"),
        "action": action,
        "priority": item.get("priority") or item.get("severity") or priority,
        "status": "needs_review",
        "area_id": item.get("id", ""),
        "checklist": [
            "Confirm the expected coverage area with an SME.",
            "Attach source document, page, section, and quote evidence.",
            "Mark the area reviewed after conflicts and stale guidance are resolved.",
        ],
        "source_refs": item.get("source_refs", []),
    }


def _area_lines(items: list[dict[str, Any]]) -> str:
    lines = []
    for item in items:
        suffix = " | ".join(
            str(value)
            for value in [
                item.get("coverage_status") or item.get("candidate_type") or item.get("status"),
                f"confidence: {item.get('confidence')}" if item.get("confidence") not in (None, "") else "",
                item.get("priority") or item.get("severity") or "",
            ]
            if value
        )
        lines.append(f"- **{item.get('title', 'Untitled')}**")
        if item.get("rationale"):
            lines.append(f"  {item['rationale']}")
        if suffix:
            lines.append(f"  _{suffix}_")
    return "\n".join(lines)


def _question_lines(items: list[Any]) -> str:
    lines = []
    for item in items:
        if isinstance(item, str):
            lines.append(f"- {item}")
            continue
        if isinstance(item, dict):
            lines.append(f"- {item.get('question') or item.get('title') or 'Review question'}")
    return "\n".join(lines)


def _roadmap_lines(items: list[Any]) -> str:
    lines = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, str):
            lines.append(f"{index}. {item}")
            continue
        if isinstance(item, dict):
            title = item.get("title") or item.get("label") or "Completeness action"
            action = item.get("action") or item.get("note") or ""
            lines.append(f"{item.get('order', index)}. **{title}**")
            if action:
                lines.append(f"   {action}")
    return "\n".join(lines)


def _document_ref(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "document_id": document.get("id") or document.get("document_id") or "",
        "document_title": document.get("filename") or document.get("original_filename") or "",
        "page": "",
        "section": "",
        "quote_snippet": "",
    }


def _expectation_tokens(expectation: dict[str, Any]) -> set[str]:
    values = [expectation.get("title", ""), *expectation.get("aliases", [])]
    tokens = set()
    for value in values:
        tokens.update(_tokens(value))
    return {token for token in tokens if len(token) > 2 and token not in STOPWORDS}


def _matches_text(tokens: set[str], text: str) -> bool:
    if not tokens:
        return False
    text_tokens = _tokens(text)
    if tokens & text_tokens:
        return True
    joined = " ".join(text_tokens)
    return any(token in joined for token in tokens if len(token) >= 7)


def _node_text(node: dict[str, Any]) -> str:
    return f"{node.get('title', '')} {node.get('summary', '')}".lower()


def _tokens(value: Any) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", str(value or "").lower()))


def _canonical(value: Any) -> str:
    tokens = [token for token in _tokens(value) if token not in STOPWORDS]
    return "-".join(tokens)


def _stable_id(prefix: str, value: str) -> str:
    return f"{prefix}-{_stable_key(value)}"


def _stable_key(value: str) -> str:
    key = _canonical(value)
    return key[:72] or "item"


def _string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value or "").strip()]


def _parse_confidence(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        value = value.strip().rstrip("%")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed / 100 if parsed > 1 else parsed
