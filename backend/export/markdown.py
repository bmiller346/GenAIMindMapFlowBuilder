def export_outline_markdown(root_title: str, lines: list[str]) -> str:
    body = "\n".join(lines)
    return f"# {root_title}\n\n{body}\n"


def export_executive_output_markdown(output: dict) -> str:
    sections = [
        ("Summary", output.get("summary", "")),
        ("Key Findings", _item_lines(output.get("key_findings", []))),
        ("Recommended Actions", _item_lines(output.get("recommended_actions", []))),
        ("Risks", _item_lines(output.get("risks", []))),
        ("Required Decisions", _item_lines(output.get("required_decisions", []))),
        ("Source-backed Appendix", _appendix_lines(output.get("source_backed_appendix", []))),
    ]
    title = output.get("title") or "Executive Output"
    body = "\n\n".join(
        f"## {heading}\n\n{content or '_No items projected._'}"
        for heading, content in sections
    )
    return f"# {title}\n\n{body}\n"


def export_team_roadmap_markdown(roadmap: dict) -> str:
    sections = [
        ("Context", roadmap.get("context", "")),
        ("Workstreams", _roadmap_item_lines(roadmap.get("workstreams", []))),
        ("Milestones", _roadmap_item_lines(roadmap.get("milestones", []))),
        ("Dependencies", _roadmap_item_lines(roadmap.get("dependencies", []))),
        ("Risks", _roadmap_item_lines(roadmap.get("risks", []))),
        ("Required Decisions", _roadmap_item_lines(roadmap.get("required_decisions", []))),
        ("Recommended Next Actions", _roadmap_item_lines(roadmap.get("recommended_next_actions", []))),
        ("Source Appendix", _appendix_lines(roadmap.get("source_backed_appendix", []))),
    ]
    title = roadmap.get("title") or "Team Roadmap"
    body = "\n\n".join(
        f"## {heading}\n\n{content or '_No items projected._'}"
        for heading, content in sections
    )
    return f"# {title}\n\n{body}\n"


def _item_lines(items: list[dict]) -> str:
    lines = []
    for item in items:
        detail = item.get("description") or ""
        badges = [
            item.get("status"),
            f"priority: {item.get('priority')}" if item.get("priority") else "",
            f"owner: {item.get('owner_id')}" if item.get("owner_id") else "",
            f"due: {item.get('due_date')}" if item.get("due_date") else "",
            "source-backed" if item.get("source_backed") else "needs review",
        ]
        suffix = " | ".join(str(badge) for badge in badges if badge)
        lines.append(f"- **{item.get('title', 'Untitled')}**")
        if detail:
            lines.append(f"  {detail}")
        if suffix:
            lines.append(f"  _{suffix}_")
    return "\n".join(lines)


def _roadmap_item_lines(items: list[dict]) -> str:
    lines = []
    for item in items:
        detail = item.get("description") or item.get("summary") or ""
        badges = [
            item.get("status"),
            f"priority: {item.get('priority')}" if item.get("priority") else "",
            f"owner: {item.get('owner_id')}" if item.get("owner_id") else "",
            f"due: {item.get('due_date')}" if item.get("due_date") else "",
            item.get("relationship_type"),
            "source-backed" if item.get("source_backed") else "needs review",
        ]
        suffix = " | ".join(str(badge) for badge in badges if badge)
        title = item.get("title") or item.get("label") or "Untitled"
        lines.append(f"- **{title}**")
        if detail:
            lines.append(f"  {detail}")
        if suffix:
            lines.append(f"  _{suffix}_")
    return "\n".join(lines)


def _appendix_lines(items: list[dict]) -> str:
    lines = []
    for item in items:
        for ref in item.get("source_refs", []):
            if not ref.get("document_id"):
                continue
            location = " | ".join(
                str(value)
                for value in [
                    ref.get("document_id"),
                    f"p. {ref.get('page')}" if ref.get("page") else "",
                    ref.get("section") or "",
                ]
                if value
            )
            quote = ref.get("quote_snippet") or item.get("description") or ""
            lines.append(f"- **{item.get('title', 'Untitled')}** - {location}")
            if quote:
                lines.append(f"  {quote}")
    return "\n".join(lines)
