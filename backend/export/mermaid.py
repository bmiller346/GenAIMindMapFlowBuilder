def export_mermaid(lines: list[str]) -> str:
    body = "\n".join(lines)
    return f"graph TD\n{body}\n"
