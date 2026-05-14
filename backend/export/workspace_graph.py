import json
from collections import defaultdict
from html import escape as html_escape
from xml.sax.saxutils import escape as xml_escape

from export.source_library import build_source_library
from graph.validation import validate_and_repair_graph


TASK_CAPABLE_TYPES = {"task", "procedure", "workflow", "needs_review"}


def build_workspace_graph(flow: dict, source_components: list[dict] | None = None) -> dict:
    flow_object = _parse_flow_json(flow.get("flow_json", ""))
    raw_nodes = flow_object.get("nodes", [])
    raw_edges = flow_object.get("edges", [])
    parent_by_node = _build_parent_map(raw_edges)

    nodes = [
        _normalize_node(raw_node, parent_by_node.get(raw_node.get("id")))
        for raw_node in raw_nodes
    ]

    graph = {
        "workspace": {
            "id": str(flow.get("_id", "")),
            "title": flow.get("flow_name", "Untitled Workspace"),
            "summary": flow.get("summary", ""),
            "flow_type": flow.get("flow_type", ""),
            "brief": flow_object.get("workspace_brief", {}),
        },
        "nodes": nodes,
        "edges": [_normalize_edge(edge) for edge in raw_edges],
        "tasks": [],
        "source_library": {},
        "views": {
            "react_flow": {
                "viewport": flow_object.get("viewport", {}),
            }
        },
    }
    graph = validate_and_repair_graph(graph)
    graph["source_library"] = build_source_library(
        flow_object,
        nodes=graph["nodes"],
        source_components=source_components or [],
    )
    graph["tasks"] = [
        _node_to_task(node)
        for node in graph["nodes"]
        if _is_task_capable(node)
    ]
    return graph


def select_branch(graph: dict, node_id: str) -> dict:
    descendants = _descendant_ids(graph.get("edges", []), node_id)
    selected_ids = {node_id, *descendants}
    branch = {
        **graph,
        "nodes": [
            {**node, "parent_id": None if node["id"] == node_id else node.get("parent_id")}
            for node in graph["nodes"]
            if node["id"] in selected_ids
        ],
        "edges": [
            edge
            for edge in graph["edges"]
            if edge["source_node_id"] in selected_ids
            and edge["target_node_id"] in selected_ids
        ],
        "tasks": [],
    }
    branch = validate_and_repair_graph(branch)
    branch["tasks"] = [
        _node_to_task(node)
        for node in branch["nodes"]
        if _is_task_capable(node)
    ]
    return branch


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
                "Owner": task["assignee"],
                "Due Date": task["due_date"],
                "Confidence": node.get("confidence", ""),
                "Node Type": node.get("node_type", ""),
                "Source Document": source_ref.get("document_id", ""),
                "Source Page": source_ref.get("page", ""),
                "Source Section": source_ref.get("section", ""),
                "Source Quote": source_ref.get("quote_snippet", ""),
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
    source_refs = _source_refs(data, nested_data)
    monday_selection_input = _monday_selection_input(data, nested_data)

    node = {
        "id": raw_node.get("id", ""),
        "parent_id": parent_id,
        "title": _node_title(raw_node, data, nested_data),
        "summary": nested_data.get("summ") or data.get("summ") or data.get("summary", ""),
        "node_type": node_type,
        "status": _first_value(data, nested_data, "status") or _default_status(node_type),
        "priority": _first_value(data, nested_data, "priority"),
        "owner_id": _first_value(data, nested_data, "owner_id", "assignee", "owner"),
        "due_date": _first_value(data, nested_data, "due_date"),
        "confidence": _first_value(data, nested_data, "confidence") or _first_source_confidence(source_refs),
        "source_refs": source_refs,
        "external_refs": _external_refs(data, nested_data),
        "metadata": {
            "react_flow_type": raw_node.get("type", ""),
            "position": raw_node.get("position", {}),
            "component_id": data.get("component_id") or nested_data.get("component_id", ""),
            "component_type": data.get("name") or nested_data.get("component_type", ""),
            "task_fields": {
                "priority": _first_value(data, nested_data, "priority"),
                "owner_id": _first_value(data, nested_data, "owner_id", "assignee", "owner"),
                "due_date": _first_value(data, nested_data, "due_date"),
            },
        },
    }
    if monday_selection_input:
        node["monday_selection_input"] = monday_selection_input

    return node


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


def _external_refs(data: dict, nested_data: dict) -> dict:
    refs = data.get("external_refs") or nested_data.get("external_refs")
    return refs if isinstance(refs, dict) else {}


def _monday_selection_input(data: dict, nested_data: dict) -> dict:
    selection_input = data.get("monday_selection_input") or nested_data.get(
        "monday_selection_input"
    )
    return selection_input if isinstance(selection_input, dict) else {}


def _first_value(*sources_and_keys) -> str:
    sources = [source for source in sources_and_keys[:2] if isinstance(source, dict)]
    keys = sources_and_keys[2:]

    for source in sources:
        for key in keys:
            value = source.get(key)
            if value not in (None, ""):
                return value

    return ""


def _first_source_confidence(source_refs: list[dict]) -> str:
    source_ref = source_refs[0] if source_refs else {}
    if isinstance(source_ref, dict):
        return source_ref.get("confidence", "")
    return ""


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
        "confidence": node.get("confidence", ""),
        "source_refs": node.get("source_refs", []),
        "external_refs": node.get("external_refs", {}),
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
        "priority": node.get("priority", ""),
        "owner_id": node.get("owner_id", ""),
        "due_date": node.get("due_date", ""),
        "confidence": node.get("confidence", ""),
    }
    external_refs = node.get("external_refs", {})
    if external_refs.get("miro"):
        attrs["miro_board_id"] = external_refs["miro"].get("board_id", "")
        attrs["miro_item_id"] = external_refs["miro"].get("item_id", "")
    if external_refs.get("monday"):
        attrs["monday_board_id"] = external_refs["monday"].get("board_id", "")
        attrs["monday_item_id"] = external_refs["monday"].get("item_id", "")

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
