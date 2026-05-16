from __future__ import annotations

from typing import Any

from .artifacts import build_code_intelligence_artifacts


def code_intelligence_to_markdown(graph: dict[str, Any]) -> str:
    title = graph.get("title") or "Code Intelligence Report"
    repo = graph.get("repo", {})
    lines = [
        f"# {title}",
        "",
        f"- Repository: {repo.get('name', '')}",
        f"- Source type: {graph.get('source_type', '')}",
        f"- Files scanned: {repo.get('file_count', 0)}",
        "",
    ]

    lines.extend(_architecture_section(graph))
    lines.extend(_relationship_section(graph))
    lines.extend(_finding_section("Weak Spots", graph.get("reports", {}).get("weak_spot_report", [])))
    lines.extend(_finding_section("Missing Tests", graph.get("reports", {}).get("test_gap_report", [])))
    lines.extend(_finding_section("Documentation Gaps", graph.get("reports", {}).get("documentation_gap_report", [])))
    lines.extend(_dependency_section(graph))
    lines.extend(_entrypoint_section(graph))
    lines.extend(_handoff_section(graph))
    return "\n".join(lines).rstrip() + "\n"


def _architecture_section(graph: dict[str, Any]) -> list[str]:
    lines = ["## Architecture Map", ""]
    sections = graph.get("reports", {}).get("repo_architecture_map", {}).get("sections", [])
    if not sections:
        return lines + ["No architecture sections detected.", ""]
    for section in sections:
        lines.append(f"- {section.get('name', '')}: {section.get('file_count', 0)} files")
    return lines + [""]


def _relationship_section(graph: dict[str, Any]) -> list[str]:
    counts: dict[str, int] = {}
    for edge in graph.get("edges", []):
        relationship = edge.get("relationship_type", "")
        counts[relationship] = counts.get(relationship, 0) + 1
    lines = ["## Relationship Summary", ""]
    for relationship, count in sorted(counts.items()):
        lines.append(f"- {relationship}: {count}")
    return lines + [""]


def _finding_section(title: str, findings: list[dict[str, Any]]) -> list[str]:
    lines = [f"## {title}", ""]
    if not findings:
        return lines + ["No findings.", ""]
    for finding in findings:
        source = _first_source_label(finding)
        lines.append(f"- [{finding.get('severity', 'medium')}] {finding.get('title', '')}: {finding.get('summary', '')}")
        if source:
            lines.append(f"  Source: {source}")
        recommendation = finding.get("recommendation", "")
        if recommendation:
            lines.append(f"  Recommendation: {recommendation}")
    return lines + [""]


def _dependency_section(graph: dict[str, Any]) -> list[str]:
    dependencies = [node for node in graph.get("nodes", []) if node.get("node_type") == "dependency"]
    lines = ["## Dependencies", ""]
    if not dependencies:
        return lines + ["No dependencies detected.", ""]
    for node in sorted(dependencies, key=lambda item: item.get("title", "")):
        metadata = node.get("metadata", {})
        version = metadata.get("version", "")
        group = metadata.get("dependency_group", "")
        suffix = f" ({group} {version})".strip() if group or version else ""
        lines.append(f"- {node.get('title', '')}{suffix}")
    return lines + [""]


def _entrypoint_section(graph: dict[str, Any]) -> list[str]:
    node_by_id = {node.get("id"): node for node in graph.get("nodes", [])}
    entrypoints = [edge for edge in graph.get("edges", []) if edge.get("relationship_type") == "entrypoint_for"]
    lines = ["## Entrypoints", ""]
    if not entrypoints:
        return lines + ["No entrypoints detected.", ""]
    for edge in entrypoints:
        source = node_by_id.get(edge.get("source_node_id"), {})
        metadata = edge.get("metadata", {})
        command = metadata.get("command", "")
        suffix = f" - {command}" if command else ""
        lines.append(f"- {source.get('title', edge.get('source_node_id', ''))}: {metadata.get('entrypoint_kind', '')}{suffix}")
    return lines + [""]


def _handoff_section(graph: dict[str, Any]) -> list[str]:
    bundle = build_code_intelligence_artifacts(graph)
    artifacts = {
        artifact.get("artifact_type"): artifact
        for artifact in bundle.get("artifacts", [])
        if isinstance(artifact, dict)
    }
    issues = artifacts.get("github_issue_candidates", {}).get("data", {}).get("issues", [])
    roadmap = artifacts.get("refactor_roadmap", {}).get("data", {}).get("phases", [])
    lines = ["## Developer Handoff", ""]
    lines.append(f"- GitHub issue candidates: {len(issues)}")
    lines.append(f"- Roadmap phases: {len(roadmap)}")
    lines.append("- External writes: preview required")
    lines.append("")
    if issues:
        lines.append("### Top Issue Candidates")
        lines.append("")
        for issue in issues[:8]:
            source = _first_source_label(issue)
            suffix = f" ({source})" if source else ""
            lines.append(f"- {issue.get('title', '')}{suffix}")
        lines.append("")
    if roadmap:
        lines.append("### Refactor Roadmap")
        lines.append("")
        for phase in roadmap:
            lines.append(f"- {phase.get('title', '')}: {len(phase.get('items', []))} items")
        lines.append("")
    return lines


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
