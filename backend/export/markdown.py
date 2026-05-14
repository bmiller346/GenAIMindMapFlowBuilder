def export_outline_markdown(root_title: str, lines: list[str]) -> str:
    body = "\n".join(lines)
    return f"# {root_title}\n\n{body}\n"
