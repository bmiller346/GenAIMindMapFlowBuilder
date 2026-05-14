import json
from collections import defaultdict
from html import escape as html_escape
from xml.sax.saxutils import escape as xml_escape


TASK_CAPABLE_TYPES = {"task", "procedure", "workflow", "needs_review"}


def build_workspace_graph(flow: dict) -> dict:
    flow_object = _parse_flow_json(flow.get("flow_json", ""))
    raw_nodes = flow_object.get("nodes", [])
    raw_edges = flow_object.get("edges", [])
    parent_by_node = _build_parent_map(raw_edges)

    nodes = [
        _normalize_node(raw_node, parent_by_node.get(raw_node.get("id")))
        for raw_node in raw_nodes
    ]

    return {
        "workspace": {
            "id": str(flow.get("_id", "")),
            "title": flow.get("flow_name", "Untitled Workspace"),
            "summary": flow.get("summary", ""),
            "flow_type": flow.get("flow_type", ""),
        },
        "nodes": nodes,
        "edges": [_normalize_edge(edge) for edge in raw_edges],
        "tasks": [_node_to_task(node) for node in nodes if _is_task_capable(node)],
        "views": {
            "react_flow": {
                "viewport": flow_object.get("viewport", {}),
            }
        },
    }


def select_branch(graph: dict, node_id: str) -> dict:
    descendants = _descendant_ids(graph.get("edges", []), node_id)
    selected_ids = {node_id, *descendants}

    return {
        **graph,
        "nodes": [node for node in graph["nodes"] if node["id"] in selected_ids],
        "edges": [
            edge
            for edge in graph["edges"]
            if edge["source_node_id"] in selected_ids
            and edge["target_node_id"] in selected_ids
        ],
        "tasks": [
            task
            for task in graph["tasks"]
            if task["node_id"] in selected_ids
        ],
    }


def graph_to_markdown(graph: dict) -> str:
    roots, children = _tree_index(graph)
    lines = []

    for root in roots:
        _append_markdown_node(lines, root, children, 0)

    title = graph["workspace"]["title"]
    body = "\n".join(lines)
    return f"# {title}\n\n{body}\n"


def graph_to_task_rows(graph: dict) -> list[dict]:
    rows = []
    node_lookup = {node["id"]: node for node in graph["nodes"]}

    for task in graph.get("tasks", []):
        node = node_lookup.get(task["node_id"], {})
        source_ref = _first_source_ref(node)
        rows.append(
            {
                "Title": task["title"],
                "Node ID": task["node_id"],
                "Status": task["status"],
                "Priority": task["priority"],
                "Node Type": node.get("node_type", ""),
                "Source Document": source_ref.get("document_id", ""),
                "Source Page": source_ref.get("page", ""),
                "App Link": "",
            }
        )

    return rows


def graph_to_opml(graph: dict) -> str:
    roots, children = _tree_index(graph)
    outlines = []

    for root in roots:
        outlines.append(_node_to_opml(root, children))

    title = xml_escape(graph["workspace"]["title"])
    body = "".join(outlines)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<opml version="2.0"><head><title>{title}</title></head>'
        f"<body>{body}</body></opml>"
    )


def graph_to_mmd_json(graph: dict) -> dict:
    roots, children = _tree_index(graph)

    if not roots:
        return {"text": graph["workspace"]["title"], "links": [], "children": []}

    if len(roots) == 1:
        return _node_to_mmd_json(roots[0], children)

    return {
        "text": graph["workspace"]["title"],
        "links": [],
        "children": [_node_to_mmd_json(root, children) for root in roots],
    }


def graph_to_mermaid(graph: dict) -> str:
    lines = ["graph TD"]
    node_lookup = {node["id"]: node for node in graph["nodes"]}

    for edge in graph["edges"]:
        source = edge["source_node_id"]
        target = edge["target_node_id"]
        source_label = _mermaid_label(node_lookup.get(source, {}).get("title", source))
        target_label = _mermaid_label(node_lookup.get(target, {}).get("title", target))
        lines.append(f'  {source}["{source_label}"] --> {target}["{target_label}"]')

    return "\n".join(lines) + "\n"


def _parse_flow_json(flow_json: str) -> dict:
    if not flow_json:
        return {"nodes": [], "edges": [], "viewport": {}}

    try:
        parsed = json.loads(flow_json)
    except json.JSONDecodeError:
        return {"nodes": [], "edges": [], "viewport": {}}

    if not isinstance(parsed, dict):
        return {"nodes": [], "edges": [], "viewport": {}}

    return parsed


def _build_parent_map(edges: list[dict]) -> dict[str, str]:
    parent_by_node = {}

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source and target and target not in parent_by_node:
            parent_by_node[target] = source

    return parent_by_node


def _normalize_node(raw_node: dict, parent_id: str | None) -> dict:
    data = raw_node.get("data", {})
    nested_data = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
    node_type = _semantic_node_type(raw_node, data, nested_data)

    return {
        "id": raw_node.get("id", ""),
        "parent_id": parent_id,
        "title": _node_title(raw_node, data, nested_data),
        "summary": nested_data.get("summ") or data.get("summ") or "",
        "node_type": node_type,
        "status": data.get("status") or _default_status(node_type),
        "priority": data.get("priority", ""),
        "owner_id": data.get("owner_id", ""),
        "due_date": data.get("due_date", ""),
        "confidence": data.get("confidence", ""),
        "source_refs": _source_refs(data, nested_data),
        "external_refs": data.get("external_refs", {}),
        "metadata": {
            "react_flow_type": raw_node.get("type", ""),
            "position": raw_node.get("position", {}),
            "component_id": data.get("component_id") or nested_data.get("component_id", ""),
            "component_type": data.get("name") or nested_data.get("component_type", ""),
        },
    }


def _normalize_edge(edge: dict) -> dict:
    return {
        "id": edge.get("id", ""),
        "source_node_id": edge.get("source", ""),
        "target_node_id": edge.get("target", ""),
        "relationship_type": edge.get("relationship_type", "contains"),
        "metadata": {
            "animated": edge.get("animated", False),
            "react_flow_type": edge.get("type", ""),
        },
    }


def _semantic_node_type(raw_node: dict, data: dict, nested_data: dict) -> str:
    explicit = data.get("node_type") or nested_data.get("node_type")
    if explicit:
        return explicit

    react_flow_type = raw_node.get("type", "")
    if react_flow_type == "dataSource":
        return "reference"
    if react_flow_type == "question":
        return "question"
    if react_flow_type == "followUp":
        return "needs_review"
    if "summ" in nested_data:
        return "concept"

    return react_flow_type or "concept"


def _node_title(raw_node: dict, data: dict, nested_data: dict) -> str:
    return (
        data.get("title")
        or nested_data.get("question")
        or data.get("question")
        or data.get("content")
        or data.get("prompt")
        or nested_data.get("summ")
        or raw_node.get("type")
        or "Untitled Node"
    )


def _default_status(node_type: str) -> str:
    if node_type == "needs_review":
        return "needs_review"
    return "ai_generated"


def _source_refs(data: dict, nested_data: dict) -> list[dict]:
    refs = data.get("source_refs") or nested_data.get("source_refs")
    if isinstance(refs, list):
        return refs

    component_id = data.get("component_id") or nested_data.get("component_id")
    if not component_id:
        return []

    return [
        {
            "document_id": component_id,
            "page": data.get("page", ""),
            "section": data.get("section", ""),
            "quote_snippet": data.get("quote_snippet", ""),
            "confidence": data.get("confidence", ""),
        }
    ]


def _is_task_capable(node: dict) -> bool:
    return node.get("node_type") in TASK_CAPABLE_TYPES


def _node_to_task(node: dict) -> dict:
    return {
        "id": f"task-{node['id']}",
        "node_id": node["id"],
        "title": node["title"],
        "description": node.get("summary", ""),
        "status": node.get("status", "AI Generated"),
        "priority": node.get("priority", ""),
        "due_date": node.get("due_date", ""),
        "assignee": node.get("owner_id", ""),
    }


def _tree_index(graph: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    node_lookup = {node["id"]: node for node in graph["nodes"]}
    child_ids = defaultdict(list)

    for edge in graph["edges"]:
        child_ids[edge["source_node_id"]].append(edge["target_node_id"])

    children = {
        node_id: [
            node_lookup[child_id]
            for child_id in ids
            if child_id in node_lookup
        ]
        for node_id, ids in child_ids.items()
    }
    targeted = {edge["target_node_id"] for edge in graph["edges"]}
    roots = [node for node in graph["nodes"] if node["id"] not in targeted]

    return roots, children


def _append_markdown_node(
    lines: list[str],
    node: dict,
    children: dict[str, list[dict]],
    depth: int,
) -> None:
    prefix = "  " * depth + "- "
    status = f" [{node['status']}]" if node.get("status") else ""
    lines.append(f"{prefix}{node['title']}{status}")

    for child in children.get(node["id"], []):
        _append_markdown_node(lines, child, children, depth + 1)


def _node_to_opml(node: dict, children: dict[str, list[dict]]) -> str:
    attrs = {
        "text": node["title"],
        "node_id": node["id"],
        "node_type": node.get("node_type", ""),
        "review_state": node.get("status", ""),
    }
    source_ref = _first_source_ref(node)
    if source_ref:
        attrs["source_doc"] = str(source_ref.get("document_id", ""))
        attrs["source_page"] = str(source_ref.get("page", ""))

    attr_text = " ".join(
        f'{key}="{xml_escape(str(value))}"'
        for key, value in attrs.items()
    )
    child_text = "".join(
        _node_to_opml(child, children) for child in children.get(node["id"], [])
    )

    if child_text:
        return f"<outline {attr_text}>{child_text}</outline>"

    return f"<outline {attr_text}/>"


def _node_to_mmd_json(node: dict, children: dict[str, list[dict]]) -> dict:
    return {
        "text": node["title"],
        "links": [],
        "children": [
            _node_to_mmd_json(child, children)
            for child in children.get(node["id"], [])
        ],
    }


def _descendant_ids(edges: list[dict], node_id: str) -> set[str]:
    children_by_parent = defaultdict(list)
    for edge in edges:
        children_by_parent[edge["source_node_id"]].append(edge["target_node_id"])

    descendants = set()
    stack = list(children_by_parent.get(node_id, []))

    while stack:
        current = stack.pop()
        if current in descendants:
            continue
        descendants.add(current)
        stack.extend(children_by_parent.get(current, []))

    return descendants


def _first_source_ref(node: dict) -> dict:
    refs = node.get("source_refs", [])
    if refs and isinstance(refs[0], dict):
        return refs[0]
    return {}


def _mermaid_label(value: str) -> str:
    return html_escape(str(value)).replace('"', "'")
