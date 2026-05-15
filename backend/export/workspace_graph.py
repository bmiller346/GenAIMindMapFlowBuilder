import json
from collections import defaultdict
from html import escape as html_escape
from xml.sax.saxutils import escape as xml_escape

from ai.schemas import EXECUTIVE_OUTPUT_CONTRACT_VERSION
from export.completeness_review import (
    build_completeness_review,
    export_completeness_review_markdown,
)
from export.markdown import (
    export_executive_output_markdown,
    export_team_roadmap_markdown,
)
from export.source_library import build_source_library
from graph.enterprise_scoring import build_enterprise_scoring
from graph.validation import validate_and_repair_graph


TASK_CAPABLE_TYPES = {"task", "procedure", "workflow", "needs_review"}
RISK_TYPES = {"risk", "blocker", "issue", "dependency", "needs_review"}
DECISION_TYPES = {"decision", "question", "approval", "needs_review"}
WORKSTREAM_TYPES = {"workstream", "workflow", "procedure", "category", "concept"}
MILESTONE_TYPES = {"milestone", "phase", "checkpoint", "release"}
DEPENDENCY_NODE_TYPES = {"dependency", "blocker"}
DEPENDENCY_RELATIONSHIP_TYPES = {
    "depends_on",
    "dependency",
    "requires",
    "blocked_by",
    "blocks",
    "prerequisite",
}
TEAM_ROADMAP_CONTRACT_VERSION = "1"


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
    graph["views"]["enterprise_readiness"] = build_enterprise_scoring(graph)
    graph["views"]["completeness_review"] = build_completeness_review(
        graph,
        domain_profile=_flow_domain_profile(flow_object),
        expected_coverage=_flow_expected_coverage(flow_object),
    )
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
    branch.setdefault("views", {})["enterprise_readiness"] = build_enterprise_scoring(branch)
    branch.setdefault("views", {})["completeness_review"] = build_completeness_review(branch)
    return branch


def graph_to_markdown(graph: dict) -> str:
    roots, children = _tree_index(graph)
    lines = []

    for root in roots:
        _append_markdown_node(lines, root, children, 0)

    title = graph["workspace"]["title"]
    body = "\n".join(lines)
    return f"# {title}\n\n{body}\n"


def graph_to_executive_output(graph: dict) -> dict:
    nodes = [node for node in graph.get("nodes", []) if node.get("node_type") != "reference"]
    sourced_nodes = [node for node in nodes if _has_source_ref(node)]
    needs_review_nodes = [node for node in nodes if _needs_review(node)]
    tasks = graph.get("tasks", [])
    title = graph.get("workspace", {}).get("title") or "Executive Output"

    key_findings = [_executive_item(node, "finding") for node in _top_nodes(sourced_nodes or nodes)]
    recommended_actions = [
        _executive_item(_task_node(graph, task), "recommended_action", task=task)
        for task in tasks[:8]
    ]
    risks = [
        _executive_item(node, "risk")
        for node in nodes
        if node.get("node_type") in RISK_TYPES or _needs_review(node) or _low_confidence(node)
    ][:8]
    required_decisions = [
        _executive_item(node, "required_decision")
        for node in nodes
        if node.get("node_type") in DECISION_TYPES
        or "decision" in _node_text(node)
        or "approve" in _node_text(node)
    ][:8]
    appendix = [_executive_item(node, "source_appendix") for node in sourced_nodes]

    assumptions = []
    if nodes and not sourced_nodes:
        assumptions.append("No source-backed graph nodes are available; executive sections require review.")
    if needs_review_nodes:
        assumptions.append(f"{len(needs_review_nodes)} graph node(s) are marked needs_review.")

    return {
        "contract_version": EXECUTIVE_OUTPUT_CONTRACT_VERSION,
        "title": f"{title} Executive Output",
        "summary": _executive_summary(graph, nodes, sourced_nodes, tasks, needs_review_nodes),
        "key_findings": key_findings,
        "recommended_actions": recommended_actions,
        "risks": risks,
        "required_decisions": required_decisions,
        "source_backed_appendix": appendix,
        "assumptions": assumptions,
        "metadata": {
            "node_count": len(nodes),
            "source_backed_node_count": len(sourced_nodes),
            "needs_review_count": len(needs_review_nodes),
            "task_count": len(tasks),
        },
    }


def graph_to_executive_markdown(graph: dict) -> str:
    return export_executive_output_markdown(graph_to_executive_output(graph))


def graph_to_completeness_review(graph: dict) -> dict:
    return build_completeness_review(graph)


def graph_to_completeness_markdown(graph: dict) -> str:
    review = graph.get("views", {}).get("completeness_review")
    if not isinstance(review, dict):
        review = graph_to_completeness_review(graph)
    return export_completeness_review_markdown(review)


def graph_to_team_roadmap(graph: dict) -> dict:
    nodes = [node for node in graph.get("nodes", []) if node.get("node_type") != "reference"]
    sourced_nodes = [node for node in nodes if _has_source_ref(node)]
    tasks = graph.get("tasks", [])
    title = graph.get("workspace", {}).get("title") or "Team Roadmap"
    workstreams = _team_roadmap_workstreams(graph, nodes, tasks)
    milestones = _team_roadmap_milestones(graph, nodes, tasks)
    dependencies = _team_roadmap_dependencies(graph, nodes)
    risks = [
        _team_roadmap_node_item(node, "risk")
        for node in nodes
        if node.get("node_type") in RISK_TYPES or _needs_review(node) or _low_confidence(node)
    ][:8]
    required_decisions = [
        _team_roadmap_node_item(node, "required_decision")
        for node in nodes
        if node.get("node_type") in DECISION_TYPES
        or "decision" in _node_text(node)
        or "approve" in _node_text(node)
    ][:8]
    recommended_next_actions = _team_roadmap_next_actions(graph, tasks, required_decisions, risks)
    appendix = [_team_roadmap_node_item(node, "source_appendix") for node in sourced_nodes]

    assumptions = []
    if nodes and not sourced_nodes:
        assumptions.append("No source-backed graph nodes are available; roadmap sections require review.")
    if dependencies and any(not item["source_backed"] for item in dependencies):
        assumptions.append("Some dependencies are inferred from graph relationships and need confirmation.")

    return {
        "contract_version": TEAM_ROADMAP_CONTRACT_VERSION,
        "title": f"{title} Team Roadmap",
        "context": _team_roadmap_context(
            graph,
            nodes,
            sourced_nodes,
            workstreams,
            dependencies,
            risks,
            required_decisions,
            milestones,
        ),
        "workstreams": workstreams,
        "dependencies": dependencies,
        "risks": risks,
        "required_decisions": required_decisions,
        "milestones": milestones,
        "recommended_next_actions": recommended_next_actions,
        "source_backed_appendix": appendix,
        "assumptions": assumptions,
        "metadata": {
            "node_count": len(nodes),
            "source_backed_node_count": len(sourced_nodes),
            "workstream_count": len(workstreams),
            "dependency_count": len(dependencies),
            "risk_count": len(risks),
            "required_decision_count": len(required_decisions),
            "milestone_count": len(milestones),
            "recommended_next_action_count": len(recommended_next_actions),
        },
    }


def graph_to_team_roadmap_markdown(graph: dict) -> str:
    return export_team_roadmap_markdown(graph_to_team_roadmap(graph))


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


def _flow_domain_profile(flow_object: dict) -> dict:
    workspace_brief = (
        flow_object.get("workspace_brief", {})
        if isinstance(flow_object.get("workspace_brief"), dict)
        else {}
    )
    for candidate in (
        flow_object.get("domain_profile"),
        workspace_brief.get("domain_profile"),
    ):
        if isinstance(candidate, dict):
            return candidate
    return {}


def _flow_expected_coverage(flow_object: dict) -> list:
    workspace_brief = (
        flow_object.get("workspace_brief", {})
        if isinstance(flow_object.get("workspace_brief"), dict)
        else {}
    )
    for candidate in (
        flow_object.get("expected_coverage"),
        flow_object.get("coverage_areas"),
        workspace_brief.get("expected_coverage"),
        workspace_brief.get("coverage_areas"),
    ):
        if isinstance(candidate, list):
            return candidate
    return []


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

    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    enterprise_fields = _enterprise_fields(data, nested_data)
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
            **metadata,
            "react_flow_type": raw_node.get("type", ""),
            "position": raw_node.get("position", {}),
            "component_id": data.get("component_id") or nested_data.get("component_id", ""),
            "component_type": data.get("name") or nested_data.get("component_type", ""),
            "task_fields": {
                "priority": _first_value(data, nested_data, "priority"),
                "owner_id": _first_value(data, nested_data, "owner_id", "assignee", "owner"),
                "due_date": _first_value(data, nested_data, "due_date"),
            },
            **({"enterprise_fields": enterprise_fields} if enterprise_fields else {}),
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


def _enterprise_fields(data: dict, nested_data: dict) -> dict:
    fields = {}
    field_aliases = {
        "business_impact": ("business_impact", "impact", "value_score"),
        "implementation_effort": (
            "implementation_effort",
            "effort",
            "complexity",
        ),
        "risk_severity": ("risk_severity", "severity", "risk_level"),
    }

    for field, aliases in field_aliases.items():
        value = _first_value(data, nested_data, *aliases)
        if value not in (None, ""):
            fields[field] = value

    return fields


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


def _top_nodes(nodes: list[dict], limit: int = 8) -> list[dict]:
    return sorted(
        nodes,
        key=lambda node: (
            not _has_source_ref(node),
            _needs_review(node),
            str(node.get("title", "")).lower(),
        ),
    )[:limit]


def _task_node(graph: dict, task: dict) -> dict:
    lookup = {node.get("id"): node for node in graph.get("nodes", [])}
    return lookup.get(task.get("node_id"), {}) or {
        "id": task.get("node_id", task.get("id", "")),
        "title": task.get("title", "Untitled task"),
        "summary": task.get("description", ""),
        "node_type": "task",
        "status": task.get("status", ""),
        "priority": task.get("priority", ""),
        "owner_id": task.get("assignee", ""),
        "due_date": task.get("due_date", ""),
        "source_refs": task.get("source_refs", []),
        "metadata": {},
    }


def _executive_item(node: dict, item_type: str, task: dict | None = None) -> dict:
    source_refs = node.get("source_refs", []) if isinstance(node.get("source_refs"), list) else []
    source_backed = any(ref.get("document_id") for ref in source_refs if isinstance(ref, dict))
    needs_review = _needs_review(node) or not source_backed
    title = node.get("title") or (task or {}).get("title") or "Untitled"
    return {
        "id": f"{item_type}-{node.get('id', 'item')}",
        "title": title,
        "description": node.get("summary") or (task or {}).get("description", ""),
        "status": (task or {}).get("status") or node.get("status", ""),
        "priority": (task or {}).get("priority") or node.get("priority", ""),
        "owner_id": (task or {}).get("assignee") or node.get("owner_id", ""),
        "due_date": (task or {}).get("due_date") or node.get("due_date", ""),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "metadata": {
            "source": "workspace_graph_projection",
            "scope": "workspace",
            "artifact_type": "executive_output",
            "layout_hint": item_type,
            "rationale": _executive_rationale(node, item_type, source_backed, needs_review),
            "review_reason": "" if source_backed and not needs_review else "Confirm source support before executive use.",
            "source_signal": "explicit_source_ref" if source_backed else "graph_projection",
        },
    }


def _executive_summary(
    graph: dict,
    nodes: list[dict],
    sourced_nodes: list[dict],
    tasks: list[dict],
    needs_review_nodes: list[dict],
) -> str:
    workspace = graph.get("workspace", {})
    base = workspace.get("summary") or workspace.get("brief", {}).get("goal") or ""
    metrics = (
        f"{len(nodes)} content node(s), {len(sourced_nodes)} source-backed node(s), "
        f"{len(tasks)} action candidate(s), and {len(needs_review_nodes)} review item(s)."
    )
    return f"{base} {metrics}".strip() if base else metrics


def _executive_rationale(node: dict, item_type: str, source_backed: bool, needs_review: bool) -> str:
    parts = [f"Projected from {node.get('node_type', 'node')} as {item_type}."]
    parts.append("Source-backed." if source_backed else "No source reference available.")
    if needs_review:
        parts.append("Requires review before external distribution.")
    return " ".join(parts)


def _team_roadmap_context(
    graph: dict,
    nodes: list[dict],
    sourced_nodes: list[dict],
    workstreams: list[dict],
    dependencies: list[dict],
    risks: list[dict],
    decisions: list[dict],
    milestones: list[dict],
) -> str:
    workspace = graph.get("workspace", {})
    brief = workspace.get("brief", {}) if isinstance(workspace.get("brief"), dict) else {}
    base = workspace.get("summary") or brief.get("goal") or ""
    metrics = (
        f"Projected from {len(nodes)} content node(s), {len(sourced_nodes)} source-backed node(s), "
        f"{len(workstreams)} workstream(s), {len(dependencies)} dependency item(s), "
        f"{len(risks)} risk item(s), {len(decisions)} required decision(s), "
        f"and {len(milestones)} milestone(s)."
    )
    return f"{base} {metrics}".strip() if base else metrics


def _team_roadmap_workstreams(graph: dict, nodes: list[dict], tasks: list[dict]) -> list[dict]:
    roots, children = _tree_index(graph)
    content_roots = [
        node
        for node in roots
        if node.get("node_type") in WORKSTREAM_TYPES
        and node.get("id") in {item.get("id") for item in nodes}
    ]
    typed_workstreams = [node for node in nodes if node.get("node_type") in WORKSTREAM_TYPES]
    candidates = _dedupe_nodes([*content_roots, *typed_workstreams])
    if not candidates:
        candidates = _top_nodes(nodes, 6)
    tasks_by_node_id = {task.get("node_id"): task for task in tasks}
    workstreams = []

    for node in candidates[:8]:
        child_ids = [child.get("id", "") for child in children.get(node.get("id"), [])]
        task_node_ids = [
            child_id
            for child_id in child_ids
            if child_id in tasks_by_node_id
        ]
        item = _team_roadmap_node_item(node, "workstream")
        item["child_node_ids"] = child_ids
        item["task_node_ids"] = task_node_ids
        workstreams.append(item)

    return workstreams


def _team_roadmap_milestones(graph: dict, nodes: list[dict], tasks: list[dict]) -> list[dict]:
    milestone_nodes = [
        _team_roadmap_node_item(node, "milestone")
        for node in nodes
        if node.get("node_type") in MILESTONE_TYPES
    ]
    due_task_nodes = [
        _team_roadmap_node_item(_task_node(graph, task), "milestone", task=task)
        for task in tasks
        if task.get("due_date")
    ]
    return sorted(
        _dedupe_items([*milestone_nodes, *due_task_nodes]),
        key=lambda item: (not bool(item.get("due_date")), str(item.get("due_date", "")), item["title"]),
    )[:8]


def _team_roadmap_dependencies(graph: dict, nodes: list[dict]) -> list[dict]:
    node_lookup = {node.get("id"): node for node in nodes}
    dependencies = []

    for edge in graph.get("edges", []):
        relationship_type = str(edge.get("relationship_type") or "").lower()
        if relationship_type not in DEPENDENCY_RELATIONSHIP_TYPES:
            continue
        source = node_lookup.get(edge.get("source_node_id"))
        target = node_lookup.get(edge.get("target_node_id"))
        if not source or not target:
            continue
        dependencies.append(_team_roadmap_edge_item(edge, source, target))

    dependencies.extend(
        _team_roadmap_node_item(node, "dependency")
        for node in nodes
        if node.get("node_type") in DEPENDENCY_NODE_TYPES
    )

    return _dedupe_items(dependencies)[:8]


def _team_roadmap_next_actions(
    graph: dict,
    tasks: list[dict],
    decisions: list[dict],
    risks: list[dict],
) -> list[dict]:
    actions = [
        _team_roadmap_node_item(_task_node(graph, task), "recommended_next_action", task=task)
        for task in tasks
    ]
    actions.extend(
        _derived_team_roadmap_item(
            source_item=decision,
            item_type="recommended_next_action",
            title=f"Resolve decision: {decision['title']}",
            description=decision.get("description", ""),
        )
        for decision in decisions[:3]
    )
    actions.extend(
        _derived_team_roadmap_item(
            source_item=risk,
            item_type="recommended_next_action",
            title=f"Mitigate risk: {risk['title']}",
            description=risk.get("description", ""),
        )
        for risk in risks[:3]
    )
    return _dedupe_items(actions)[:10]


def _team_roadmap_node_item(
    node: dict,
    item_type: str,
    task: dict | None = None,
) -> dict:
    source_refs = node.get("source_refs", []) if isinstance(node.get("source_refs"), list) else []
    source_backed = any(ref.get("document_id") for ref in source_refs if isinstance(ref, dict))
    needs_review = _needs_review(node) or not source_backed
    title = node.get("title") or (task or {}).get("title") or "Untitled"
    return {
        "id": f"{item_type}-{node.get('id', 'item')}",
        "node_id": node.get("id", ""),
        "title": title,
        "description": node.get("summary") or (task or {}).get("description", ""),
        "status": (task or {}).get("status") or node.get("status", ""),
        "priority": (task or {}).get("priority") or node.get("priority", ""),
        "owner_id": (task or {}).get("assignee") or node.get("owner_id", ""),
        "due_date": (task or {}).get("due_date") or node.get("due_date", ""),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "metadata": _team_roadmap_metadata(node, item_type, source_backed, needs_review),
    }


def _team_roadmap_edge_item(edge: dict, source: dict, target: dict) -> dict:
    source_refs = _merge_source_refs(source.get("source_refs", []), target.get("source_refs", []))
    source_backed = any(ref.get("document_id") for ref in source_refs if isinstance(ref, dict))
    relationship_type = edge.get("relationship_type", "dependency")
    title = f"{source.get('title', 'Source')} -> {target.get('title', 'Target')}"
    needs_review = not source_backed
    return {
        "id": f"dependency-{edge.get('id') or source.get('id', 'source') + '-' + target.get('id', 'target')}",
        "source_node_id": source.get("id", ""),
        "target_node_id": target.get("id", ""),
        "title": title,
        "description": f"{target.get('title', 'Target')} is linked by {relationship_type}.",
        "relationship_type": relationship_type,
        "status": target.get("status", ""),
        "priority": target.get("priority", ""),
        "owner_id": target.get("owner_id", ""),
        "due_date": target.get("due_date", ""),
        "source_refs": source_refs,
        "source_backed": source_backed,
        "needs_review": needs_review,
        "metadata": _team_roadmap_metadata(target, "dependency", source_backed, needs_review),
    }


def _derived_team_roadmap_item(
    *,
    source_item: dict,
    item_type: str,
    title: str,
    description: str,
) -> dict:
    source_backed = source_item.get("source_backed", False)
    needs_review = source_item.get("needs_review", True)
    return {
        **source_item,
        "id": f"{item_type}-{source_item.get('id', 'item')}",
        "title": title,
        "description": description,
        "metadata": {
            **source_item.get("metadata", {}),
            "layout_hint": item_type,
            "rationale": "Projected as a recommended roadmap action from the accepted graph.",
        },
        "source_backed": source_backed,
        "needs_review": needs_review,
    }


def _team_roadmap_metadata(
    node: dict,
    item_type: str,
    source_backed: bool,
    needs_review: bool,
) -> dict:
    return {
        "source": "workspace_graph_projection",
        "scope": "workspace",
        "artifact_type": "team_roadmap",
        "layout_hint": item_type,
        "rationale": _team_roadmap_rationale(node, item_type, source_backed, needs_review),
        "review_reason": "" if source_backed and not needs_review else "Confirm source support before roadmap use.",
        "source_signal": "explicit_source_ref" if source_backed else "graph_projection",
    }


def _team_roadmap_rationale(
    node: dict,
    item_type: str,
    source_backed: bool,
    needs_review: bool,
) -> str:
    parts = [f"Projected from {node.get('node_type', 'node')} as {item_type}."]
    parts.append("Source-backed." if source_backed else "No source reference available.")
    if needs_review:
        parts.append("Requires review before team handoff.")
    return " ".join(parts)


def _merge_source_refs(*source_ref_lists: list[dict]) -> list[dict]:
    merged = []
    seen = set()
    for refs in source_ref_lists:
        if not isinstance(refs, list):
            continue
        for ref in refs:
            if not isinstance(ref, dict) or not ref.get("document_id"):
                continue
            key = (
                ref.get("document_id"),
                ref.get("page"),
                ref.get("section"),
                ref.get("quote_snippet"),
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(ref)
    return merged


def _dedupe_nodes(nodes: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for node in nodes:
        node_id = node.get("id")
        if not node_id or node_id in seen:
            continue
        seen.add(node_id)
        deduped.append(node)
    return deduped


def _dedupe_items(items: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for item in items:
        item_id = item.get("id")
        if not item_id or item_id in seen:
            continue
        seen.add(item_id)
        deduped.append(item)
    return deduped


def _node_text(node: dict) -> str:
    return f"{node.get('title', '')} {node.get('summary', '')}".lower()


def _has_source_ref(node: dict) -> bool:
    refs = node.get("source_refs", [])
    return any(isinstance(ref, dict) and ref.get("document_id") for ref in refs)


def _needs_review(node: dict) -> bool:
    return node.get("status") == "needs_review" or node.get("node_type") == "needs_review"


def _low_confidence(node: dict) -> bool:
    value = node.get("confidence")
    if value in (None, ""):
        return False
    try:
        numeric = float(str(value).replace("%", ""))
    except ValueError:
        return False
    if numeric > 1:
        numeric = numeric / 100
    return numeric < 0.6


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
