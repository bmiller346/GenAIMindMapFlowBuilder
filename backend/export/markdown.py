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
    evidence = _evidence_line(output)
    evidence_block = f"{evidence}\n\n" if evidence else ""
    return f"# {title}\n\n{evidence_block}{body}\n"


def export_executive_summary_markdown(summary: dict) -> str:
    sections = [
        ("Summary", summary.get("summary", "")),
        ("Key Points", _roadmap_item_lines(summary.get("key_points", []))),
        ("Recommended Actions", _roadmap_item_lines(summary.get("recommended_actions", []))),
        ("Risks", _roadmap_item_lines(summary.get("risks", []))),
        ("Source-backed Appendix", _appendix_lines(summary.get("source_backed_appendix", []))),
        ("Assumptions", _plain_list(summary.get("assumptions", []))),
    ]
    title = summary.get("title") or "Executive Summary"
    body = "\n\n".join(
        f"## {heading}\n\n{content or '_No items projected._'}"
        for heading, content in sections
    )
    evidence = _evidence_line(summary)
    evidence_block = f"{evidence}\n\n" if evidence else ""
    return f"# {title}\n\n{evidence_block}{body}\n"


def export_news_article_markdown(article: dict) -> str:
    title = article.get("headline") or article.get("title") or "News Article"
    opening = [
        str(article.get("dek") or "").strip(),
        str(article.get("lede") or "").strip(),
        str(article.get("body") or "").strip(),
    ]
    body_parts = [part for part in opening if part]
    section_lines = _article_section_lines(article.get("sections", []))
    if section_lines:
        body_parts.append(section_lines)
    review_notes = _article_review_lines(
        list(article.get("fact_checks", []) or [])
        + list(article.get("sections", []) or [])
        + list(article.get("quotes", []) or [])
    )
    if review_notes:
        body_parts.append(f"## Evidence and Review Notes\n\n{review_notes}")
    quote_lines = _roadmap_item_lines(article.get("quotes", []))
    if quote_lines:
        body_parts.append(f"## Source Notes\n\n{quote_lines}")
    appendix_items = list(article.get("source_backed_appendix", []) or [])
    if not appendix_items:
        appendix_items = (
            list(article.get("sections", []) or [])
            + list(article.get("quotes", []) or [])
            + list(article.get("fact_checks", []) or [])
            + [{"title": title, "source_refs": article.get("source_refs", [])}]
        )
    appendix = _appendix_lines(appendix_items)
    if appendix:
        body_parts.append(f"## Source-backed Appendix\n\n{appendix}")
    assumptions = _plain_list(article.get("assumptions", []))
    if assumptions:
        body_parts.append(f"## Assumptions\n\n{assumptions}")
    evidence = _evidence_line(article)
    if evidence:
        body_parts.insert(0, evidence)
    return f"# {title}\n\n" + "\n\n".join(body_parts) + "\n"


def export_newsletter_markdown(newsletter: dict) -> str:
    title = newsletter.get("title") or "Newsletter"
    opening = [
        str(newsletter.get("issue_label") or "").strip(),
        str(newsletter.get("audience") or "").strip(),
        str(newsletter.get("cadence") or "").strip(),
        str(newsletter.get("opening_note") or "").strip(),
    ]
    body_parts = [part for part in opening if part]
    for heading, key in (
        ("Top Highlights", "highlights"),
        ("In This Issue", "sections"),
        ("Upcoming", "upcoming"),
        ("Risks and Watch Items", "risks"),
        ("Decisions Needed", "decisions_needed"),
        ("Visual Blocks", "visual_blocks"),
    ):
        content = _article_section_lines(newsletter.get(key, []))
        if content:
            body_parts.append(f"## {heading}\n\n{content}")
    review_notes = _article_review_lines(
        list(newsletter.get("highlights", []) or [])
        + list(newsletter.get("sections", []) or [])
        + list(newsletter.get("upcoming", []) or [])
        + list(newsletter.get("risks", []) or [])
        + list(newsletter.get("decisions_needed", []) or [])
        + list(newsletter.get("visual_blocks", []) or [])
    )
    if review_notes:
        body_parts.append(f"## Editor Notes\n\n{review_notes}")
    appendix_items = list(newsletter.get("source_backed_appendix", []) or [])
    if not appendix_items:
        appendix_items = (
            list(newsletter.get("highlights", []) or [])
            + list(newsletter.get("sections", []) or [])
            + list(newsletter.get("upcoming", []) or [])
            + list(newsletter.get("risks", []) or [])
            + list(newsletter.get("decisions_needed", []) or [])
            + list(newsletter.get("visual_blocks", []) or [])
            + [{"title": title, "source_refs": newsletter.get("source_refs", [])}]
        )
    appendix = _appendix_lines(appendix_items)
    if appendix:
        body_parts.append(f"## Source-backed Appendix\n\n{appendix}")
    assumptions = _plain_list(newsletter.get("assumptions", []))
    if assumptions:
        body_parts.append(f"## Assumptions\n\n{assumptions}")
    evidence = _evidence_line(newsletter)
    if evidence:
        body_parts.insert(0, evidence)
    return f"# {title}\n\n" + "\n\n".join(body_parts) + "\n"


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


def _article_section_lines(items: list[dict]) -> str:
    lines = []
    for item in items:
        if not isinstance(item, dict):
            continue
        heading = item.get("title") or item.get("label")
        detail = item.get("description") or item.get("summary") or item.get("body") or ""
        if heading:
            lines.append(f"## {heading}")
            lines.append("")
        if detail:
            lines.append(str(detail))
            lines.append("")
    return "\n".join(lines).strip()


def _article_review_lines(items: list[dict]) -> str:
    lines = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or item.get("label") or "Untitled"
        key = (item.get("id"), title, item.get("description"))
        if key in seen:
            continue
        seen.add(key)
        notes = []
        if item.get("source_backed") is True:
            notes.append("source-backed")
        elif item.get("source_backed") is False or item.get("needs_review"):
            notes.append("needs review")
        if item.get("confidence") not in (None, ""):
            notes.append(f"confidence: {item.get('confidence')}")
        source_signal = item.get("source_signal") or _metadata_value(item, "source_signal")
        if source_signal:
            notes.append(f"source signal: {source_signal}")
        review_state = item.get("review_state") or item.get("status")
        if review_state:
            notes.append(f"review: {review_state}")
        lines.append(f"- **{title}**")
        if notes:
            lines.append(f"  _{' | '.join(str(note) for note in notes if note)}_")
        rationale = item.get("rationale") or _metadata_value(item, "rationale")
        if rationale:
            lines.append(f"  {rationale}")
        assumptions = item.get("assumptions") if isinstance(item.get("assumptions"), list) else []
        for assumption in assumptions:
            if str(assumption or "").strip():
                lines.append(f"  Assumption: {assumption}")
    return "\n".join(lines)


def _metadata_value(item: dict, key: str) -> str:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    value = metadata.get(key, "")
    return str(value) if value not in (None, "") else ""


def _plain_list(items: list) -> str:
    lines = []
    for item in items:
        if isinstance(item, dict):
            value = item.get("title") or item.get("description") or item.get("summary") or item.get("label")
        else:
            value = item
        if str(value or "").strip():
            lines.append(f"- {value}")
    return "\n".join(lines)


def _evidence_line(payload: dict) -> str:
    provenance = payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    evidence_mode = (
        metadata.get("evidence_mode")
        or metadata.get("evidenceMode")
        or provenance.get("evidence_mode")
        or provenance.get("evidenceMode")
    )
    citation_policy = (
        metadata.get("citation_policy")
        or metadata.get("citationPolicy")
        or provenance.get("citation_policy")
        or provenance.get("citationPolicy")
    )
    source_refs = payload.get("source_refs") if isinstance(payload.get("source_refs"), list) else []
    input_source_refs = (
        provenance.get("input_source_refs")
        if isinstance(provenance.get("input_source_refs"), list)
        else []
    )
    if not any([evidence_mode, citation_policy, source_refs, input_source_refs]):
        return ""
    evidence_labels = {
        "workspace": "Workspace inference",
        "uploaded_sources": "Uploaded sources",
        "general_knowledge": "General knowledge",
        "web_sources": "Web/current sources",
        "sharepoint": "SharePoint/internal",
    }
    citation_labels = {
        "required": "Citations required",
        "preferred": "Citations preferred",
        "not_required": "Citations not required",
    }
    evidence_label = evidence_labels.get(str(evidence_mode or "workspace"), "Workspace inference")
    citation_label = citation_labels.get(str(citation_policy or "preferred"), "Citations preferred")
    cited_count = len(source_refs or input_source_refs)
    assumptions = payload.get("assumptions") if isinstance(payload.get("assumptions"), list) else []
    assumption_count = len(assumptions)
    parts = [
        evidence_label,
        citation_label,
        f"{cited_count} cited {'ref' if cited_count == 1 else 'refs'}",
    ]
    if assumption_count:
        parts.append(f"{assumption_count} {'assumption' if assumption_count == 1 else 'assumptions'}")
    return f"Evidence: {' | '.join(parts)}"


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
