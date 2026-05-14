from xml.sax.saxutils import escape


def export_opml(title: str, outlines: list[str]) -> str:
    body = "\n".join(outlines)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<opml version="2.0"><head><title>{escape(title)}</title></head>'
        f"<body>{body}</body></opml>"
    )
