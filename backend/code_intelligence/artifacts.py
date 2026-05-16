from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def build_code_intelligence_artifacts(
    graph: dict[str, Any],
    *,
    changed_paths: list[str] | None = None,
) -> dict[str, Any]:
    """Project a code graph into reviewable engineering handoff artifacts."""

    normalized_changed_paths = _normalize_paths(changed_paths or [])
    issue_candidates = _github_issue_candidates(graph)
    pr_impact = _pr_impact_report(graph, normalized_changed_paths)
    artifacts = {
        "artifact_type": "code_intelligence_artifact_bundle",
        "title": f"{graph.get('repo', {}).get('name', 'Repository')} Engineering Intelligence",
        "status": "source_backed",
        "source_type": graph.get("source_type", ""),
        "repo": graph.get("repo", {}),
        "artifacts": [
            _artifact(
                "code_knowledge_graph",
                graph.get("title") or "Code Knowledge Graph",
                {
                    "nodes": graph.get("nodes", []),
                    "edges": graph.get("edges", []),
                    "files": graph.get("files", []),
                    "source_documents": graph.get("source_documents", []),
                    "document_chunks": graph.get("document_chunks", []),
                },
                source_refs=[],
            ),
            _artifact(
                "repo_architecture_map",
                "Repo Architecture Map",
                graph.get("reports", {}).get("repo_architecture_map", {"sections": []}),
                source_refs=_source_refs_from_files(graph.get("files", [])[:12]),
            ),
            _artifact(
                "weak_spot_report",
                "Weak Spot Report",
                {"findings": graph.get("reports", {}).get("weak_spot_report", [])},
                source_refs=_source_refs_from_findings(graph.get("reports", {}).get("weak_spot_report", [])),
            ),
            _artifact(
                "test_gap_report",
                "Missing Test Report",
                {"findings": graph.get("reports", {}).get("test_gap_report", [])},
                source_refs=_source_refs_from_findings(graph.get("reports", {}).get("test_gap_report", [])),
            ),
            _artifact(
                "documentation_gap_report",
                "Documentation Gap Report",
                {"findings": graph.get("reports", {}).get("documentation_gap_report", [])},
                source_refs=_source_refs_from_findings(graph.get("reports", {}).get("documentation_gap_report", [])),
            ),
            _artifact(
                "dependency_risk_report",
                "Dependency Risk Report",
                _dependency_risk_report(graph),
                source_refs=_source_refs_from_dependency_nodes(graph),
            ),
            _artifact(
                "pr_impact_report",
                "PR Impact Report",
                pr_impact,
                source_refs=pr_impact.get("source_refs", []),
                review_state="source_backed" if normalized_changed_paths else "needs_review",
            ),
            _artifact(
                "refactor_roadmap",
                "Refactor Roadmap",
                _refactor_roadmap(graph, issue_candidates),
                source_refs=_source_refs_from_findings(graph.get("findings", [])[:8]),
            ),
            _artifact(
                "developer_onboarding_map",
                "Developer Onboarding Map",
                _developer_onboarding_map(graph),
                source_refs=_source_refs_from_files(graph.get("files", [])[:12]),
            ),
            _artifact(
                "github_issue_candidates",
                "GitHub Issue Candidates",
                {"issues": issue_candidates},
                source_refs=_source_refs_from_findings(graph.get("findings", [])),
            ),
            _artifact(
                "implementation_handoff_package",
                "Implementation Handoff Package",
                _implementation_handoff_package(graph, issue_candidates, pr_impact),
                source_refs=_source_refs_from_findings(graph.get("findings", [])[:12]),
            ),
        ],
        "metadata": {
            "deterministic": True,
            "ai_interpretation": False,
            "visibility": "hidden_capability",
            "domain": "code",
            "changed_paths": normalized_changed_paths,
        },
    }
    return artifacts


def _artifact(
    artifact_type: str,
    title: str,
    data: dict[str, Any],
    *,
    source_refs: list[dict[str, Any]],
    review_state: str = "source_backed",
) -> dict[str, Any]:
    return {
        "id": _stable_id("code-artifact", f"{artifact_type}:{title}"),
        "artifact_type": artifact_type,
        "title": title,
        "review_state": review_state if source_refs or artifact_type in {"code_knowledge_graph", "pr_impact_report"} else "needs_review",
        "source_refs": source_refs,
        "data": data,
        "metadata": {
            "domain": "code",
            "visibility": "hidden_capability",
            "generated_by": "deterministic_code_intelligence",
        },
    }


def _github_issue_candidates(graph: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for index, finding in enumerate(graph.get("findings", []), start=1):
        category = finding.get("category", "code-gap")
        severity = finding.get("severity", "medium")
        title = finding.get("title") or category.replace("-", " ").title()
        source_label = _first_source_label(finding)
        body_lines = [
            finding.get("summary", ""),
            "",
            f"Recommendation: {finding.get('recommendation', 'Review and decide the next implementation step.')}",
        ]
        if source_label:
            body_lines.extend(["", f"Evidence: {source_label}"])
        issues.append(
            {
                "id": _stable_id("github-issue", f"{index}:{title}:{source_label}"),
                "title": f"[TraceSpace] {title}",
                "body": "\n".join(line for line in body_lines if line is not None).strip(),
                "labels": ["tracespace", "code-intelligence", category, f"severity:{severity}"],
                "severity": severity,
                "category": category,
                "source_refs": finding.get("source_refs", []),
                "review_state": finding.get("review_state", "needs_review"),
                "create_policy": "preview_required",
            }
        )
    return issues


def _pr_impact_report(graph: dict[str, Any], changed_paths: list[str]) -> dict[str, Any]:
    node_by_id = {node.get("id"): node for node in graph.get("nodes", [])}
    file_nodes = [
        node
        for node in graph.get("nodes", [])
        if node.get("node_type") in {"file", "test"} and _path_from_node(node) in changed_paths
    ]
    changed_file_ids = {node.get("id") for node in file_nodes}
    affected_symbol_ids = {
        edge.get("target_node_id")
        for edge in graph.get("edges", [])
        if edge.get("relationship_type") == "contains" and edge.get("source_node_id") in changed_file_ids
    }
    related_test_ids = {
        edge.get("target_node_id")
        for edge in graph.get("edges", [])
        if edge.get("relationship_type") == "tested_by"
        and (edge.get("source_node_id") in changed_file_ids or edge.get("source_node_id") in affected_symbol_ids)
    }
    related_gap_ids = {
        edge.get("source_node_id")
        for edge in graph.get("edges", [])
        if edge.get("relationship_type") == "missing_test_for"
        and (edge.get("target_node_id") in changed_file_ids or edge.get("target_node_id") in affected_symbol_ids)
    }
    related_findings = [
        finding
        for finding in graph.get("findings", [])
        if any(_normalize_path(ref.get("path", "")) in changed_paths for ref in finding.get("source_refs", []))
    ]
    risk_score = min(
        100,
        len(file_nodes) * 12
        + len(affected_symbol_ids) * 8
        + len(related_findings) * 10
        + len(related_gap_ids) * 12,
    )
    return {
        "changed_paths": changed_paths,
        "changed_files": [_node_summary(node) for node in file_nodes],
        "affected_symbols": [_node_summary(node_by_id[node_id]) for node_id in affected_symbol_ids if node_id in node_by_id],
        "related_tests": [_node_summary(node_by_id[node_id]) for node_id in related_test_ids if node_id in node_by_id],
        "missing_tests": [_node_summary(node_by_id[node_id]) for node_id in related_gap_ids if node_id in node_by_id],
        "related_findings": related_findings,
        "risk_score": risk_score,
        "risk_level": _risk_level(risk_score),
        "source_refs": _source_refs_from_nodes(file_nodes) + _source_refs_from_findings(related_findings),
        "review_state": "source_backed" if changed_paths else "needs_review",
    }


def _dependency_risk_report(graph: dict[str, Any]) -> dict[str, Any]:
    dependencies = [node for node in graph.get("nodes", []) if node.get("node_type") == "dependency"]
    return {
        "dependencies": [
            {
                "name": node.get("title", ""),
                "version": node.get("metadata", {}).get("version", ""),
                "group": node.get("metadata", {}).get("dependency_group", ""),
                "source_refs": node.get("source_refs", []),
                "risk_level": "needs_review" if not node.get("source_refs") else "low",
            }
            for node in sorted(dependencies, key=lambda item: item.get("title", ""))
        ],
        "review_note": "Version and vulnerability checks require a dependency advisory feed; this report is manifest-backed only.",
    }


def _refactor_roadmap(graph: dict[str, Any], issues: list[dict[str, Any]]) -> dict[str, Any]:
    findings = graph.get("findings", [])
    return {
        "phases": [
            {
                "id": "phase-1-tests",
                "title": "Close source-backed test gaps",
                "items": [issue for issue in issues if issue.get("category") == "missing-test"][:12],
            },
            {
                "id": "phase-2-docs",
                "title": "Document shared entry points and public contracts",
                "items": [issue for issue in issues if issue.get("category") == "missing-docs"][:12],
            },
            {
                "id": "phase-3-structure",
                "title": "Split large or mixed-responsibility files",
                "items": [issue for issue in issues if issue.get("category") == "large-file"][:12],
            },
        ],
        "finding_count": len(findings),
        "source_backed_count": len([finding for finding in findings if finding.get("review_state") == "source_backed"]),
    }


def _developer_onboarding_map(graph: dict[str, Any]) -> dict[str, Any]:
    sections = graph.get("reports", {}).get("repo_architecture_map", {}).get("sections", [])
    entrypoint_edges = [
        edge for edge in graph.get("edges", []) if edge.get("relationship_type") == "entrypoint_for"
    ]
    node_by_id = {node.get("id"): node for node in graph.get("nodes", [])}
    return {
        "architecture_sections": sections,
        "entrypoints": [
            {
                "title": node_by_id.get(edge.get("source_node_id"), {}).get("title", ""),
                "kind": edge.get("metadata", {}).get("entrypoint_kind", ""),
                "command": edge.get("metadata", {}).get("command", ""),
                "source_refs": node_by_id.get(edge.get("source_node_id"), {}).get("source_refs", []),
            }
            for edge in entrypoint_edges
        ],
        "first_review_targets": [
            {
                "title": finding.get("title", ""),
                "summary": finding.get("summary", ""),
                "source_refs": finding.get("source_refs", []),
            }
            for finding in graph.get("findings", [])[:8]
        ],
    }


def _implementation_handoff_package(
    graph: dict[str, Any],
    issues: list[dict[str, Any]],
    pr_impact: dict[str, Any],
) -> dict[str, Any]:
    return {
        "summary": (
            f"{graph.get('repo', {}).get('name', 'Repository')} has "
            f"{len(graph.get('files', []))} scanned files, {len(graph.get('nodes', []))} graph nodes, "
            f"and {len(graph.get('findings', []))} deterministic findings."
        ),
        "ready_items": issues[:12],
        "blocked_items": [
            {
                "title": "Confirm repo ownership and priority",
                "reason": "Code intelligence can propose tasks, but ownership and scheduling require team review.",
                "review_state": "needs_review",
            }
        ],
        "pr_impact": pr_impact,
        "handoff_targets": ["github_issue_preview", "markdown_report", "monday_task_export", "miro_architecture_map"],
        "write_policy": "no_external_writes_without_preview_confirmation",
    }


def _normalize_paths(paths: list[str]) -> list[str]:
    normalized: list[str] = []
    for path in paths:
        value = _normalize_path(path)
        if value and value not in normalized:
            normalized.append(value)
    return normalized


def _normalize_path(path: str) -> str:
    return str(path or "").strip().replace("\\", "/").strip("/")


def _path_from_node(node: dict[str, Any]) -> str:
    return _normalize_path(node.get("metadata", {}).get("path", "") or node.get("title", ""))


def _source_refs_from_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [entry["source_ref"] for entry in files if isinstance(entry.get("source_ref"), dict)]


def _source_refs_from_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for node in nodes:
        refs.extend(ref for ref in node.get("source_refs", []) if isinstance(ref, dict))
    return refs


def _source_refs_from_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for finding in findings:
        for ref in finding.get("source_refs", []):
            key = f"{ref.get('document_id')}:{ref.get('line_start')}:{ref.get('line_end')}"
            if key not in seen:
                refs.append(ref)
                seen.add(key)
    return refs


def _source_refs_from_dependency_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return _source_refs_from_nodes([node for node in graph.get("nodes", []) if node.get("node_type") == "dependency"])


def _node_summary(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node.get("id", ""),
        "title": node.get("title", ""),
        "node_type": node.get("node_type", ""),
        "path": _path_from_node(node),
        "source_refs": node.get("source_refs", []),
    }


def _first_source_label(item: dict[str, Any]) -> str:
    refs = item.get("source_refs", [])
    if not refs:
        return ""
    ref = refs[0]
    path = ref.get("path") or ref.get("section") or ref.get("document_id", "")
    line_start = ref.get("line_start")
    line_end = ref.get("line_end")
    if line_start and line_end:
        return f"{path}:L{line_start}-L{line_end}"
    if line_start:
        return f"{path}:L{line_start}"
    return path


def _risk_level(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 35:
        return "medium"
    if score > 0:
        return "low"
    return "none"


def _stable_id(kind: str, value: str) -> str:
    digest = hashlib.sha256(f"{kind}:{value}".encode("utf-8")).hexdigest()
    return f"{kind}_{digest[:16]}"
