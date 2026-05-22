import csv
import io
import json
import re
from copy import deepcopy
from typing import Any

from integrations.miro.exporter import export_branch_to_miro_payload
from integrations.monday.exporter import export_tasks_to_monday_payload


def connected_package_json_export(
    package: dict[str, Any],
    workspace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    package_data = _package_data(package)
    evidence_rows = connected_package_evidence_rows(package_data)
    return {
        "export_type": "connected_picture_package",
        "export_version": "1",
        "package_id": _text(package_data.get("package_id") or package.get("package_id") or package.get("id")),
        "title": _title(package_data, package),
        "status": _text(package_data.get("status") or package_data.get("review_state") or package.get("status")),
        "workspace": {
            "id": _text((workspace or {}).get("id") or package_data.get("workspace_id")),
            "title": _text((workspace or {}).get("title") or package_data.get("workspace_title")),
        },
        "package": deepcopy(package_data),
        "evidence_rows": evidence_rows,
        "source_refs": _unique_refs(_all_source_refs(package_data)),
        "handoff_candidates": connected_package_handoff_candidates(package_data, workspace),
        "metadata": {
            "source": "accepted_connected_picture_package",
            "deferred_backend_fields": [],
        },
    }


def connected_package_markdown_export(package: dict[str, Any]) -> str:
    package_data = _package_data(package)
    graph = _graph_items(package_data)
    evidence_rows = connected_package_evidence_rows(package_data)
    task_rows = _task_nodes(package_data)
    lines = [
        f"# {_title(package_data, package)}",
        "",
        f"Package ID: {_text(package_data.get('package_id'))}",
        f"Status: {_text(package_data.get('status') or package_data.get('review_state'))}",
        "",
        "## Primary Nodes",
        "",
    ]
    lines.extend(
        f"- **{node['title']}** ({node['node_type']}) - {node['status']}"
        for node in graph["nodes"]
    )
    if not graph["nodes"]:
        lines.append("_No primary nodes._")
    lines.extend(["", "## Relationships", ""])
    node_titles = {node["id"]: node["title"] for node in graph["nodes"]}
    for edge in graph["edges"]:
        source = node_titles.get(edge["source_node_id"], edge["source_node_id"])
        target = node_titles.get(edge["target_node_id"], edge["target_node_id"])
        lines.append(f"- **{source}** -> **{target}**: {edge['relationship_type']}")
    if not graph["edges"]:
        lines.append("_No relationship edges._")
    lines.extend(["", "## Evidence Rows", ""])
    for row in evidence_rows:
        source = row["Source Document"]
        lines.append(
            f"- **{row['Title']}** - {row['Review State']}"
            + (f" ({source})" if source else "")
        )
        if row["Source Quote"]:
            lines.append(f"  {row['Source Quote']}")
    if not evidence_rows:
        lines.append("_No evidence rows._")
    lines.extend(["", "## Handoff Tasks", ""])
    for task in task_rows:
        lines.append(f"- **{task['title']}** - {task['status']}")
    if not task_rows:
        lines.append("_No task rows._")
    return "\n".join(lines) + "\n"


def connected_package_evidence_rows(package: dict[str, Any]) -> list[dict[str, Any]]:
    package_data = _package_data(package)
    rows = []
    for item_type, collection in (
        ("structured_evidence", package_data.get("structured_evidence", [])),
        ("evidence_link", package_data.get("evidence_links", [])),
    ):
        for index, item in enumerate(collection if isinstance(collection, list) else []):
            if not isinstance(item, dict):
                continue
            source = _source_fields(item.get("source_refs", []))
            rows.append(
                {
                    "Package ID": _text(package_data.get("package_id")),
                    "Item ID": _item_id(item, f"{item_type}-{index}"),
                    "Item Type": item_type,
                    "Title": _text(
                        item.get("title")
                        or item.get("label")
                        or item.get("evidence_type")
                        or item.get("target_item_id")
                        or _item_id(item, f"{item_type}-{index}")
                    ),
                    "Review State": _text(
                        item.get("citation_status")
                        or item.get("review_state")
                        or item.get("status")
                        or ("source_backed" if source["Source Document"] else "needs_source")
                    ),
                    "Needs Review": str(not bool(source["Source Document"])).lower(),
                    "Target Item ID": _text(item.get("target_item_id") or item.get("target_id")),
                    "Source Item ID": _text(item.get("source_item_id") or item.get("source_id")),
                    **source,
                }
            )
    return rows


def connected_package_evidence_csv_export(package: dict[str, Any]) -> str:
    rows = connected_package_evidence_rows(package)
    if not rows:
        return ""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def connected_package_mermaid_export(package: dict[str, Any]) -> str:
    graph = _graph_items(_package_data(package))
    lines = ["flowchart TD"]
    for node in graph["nodes"]:
        lines.append(f'  {_mermaid_id(node["id"])}["{_mermaid_label(node["title"])}"]')
    for edge in graph["edges"]:
        source = _mermaid_id(edge["source_node_id"])
        target = _mermaid_id(edge["target_node_id"])
        label = _mermaid_label(edge["relationship_type"])
        lines.append(f"  {source} -->|{label}| {target}" if label else f"  {source} --> {target}")
    return "\n".join(lines) + "\n"


def connected_package_handoff_candidates(
    package: dict[str, Any],
    workspace: dict[str, Any] | None = None,
    batch_id: str = "",
) -> dict[str, Any]:
    package_data = _package_data(package)
    graph = _graph_items(package_data)
    task_nodes = _task_nodes(package_data)
    package_id = _text(package_data.get("package_id") or "connected-package")
    base_batch_id = batch_id or f"package-{package_id}-handoff"
    return {
        "miro": export_branch_to_miro_payload(
            graph["nodes"],
            graph["edges"],
            workspace,
            target="connected_picture_package_board",
            batch_id=f"{base_batch_id}-miro",
        ),
        "monday": export_tasks_to_monday_payload(
            task_nodes,
            workspace,
            confirmed=False,
            batch_id=f"{base_batch_id}-monday",
            scope="connected_picture_package",
        ),
        "deferred_backend_fields": [
            "confirmed monday board_id/group_id",
            "live Miro board_id",
            "executed external_refs.last_pushed_at",
        ],
    }


def connected_package_export_bundle(
    package: dict[str, Any],
    workspace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "json": connected_package_json_export(package, workspace),
        "markdown": connected_package_markdown_export(package),
        "evidence_rows": connected_package_evidence_rows(package),
        "evidence_csv": connected_package_evidence_csv_export(package),
        "mermaid": connected_package_mermaid_export(package),
        "handoff_candidates": connected_package_handoff_candidates(package, workspace),
    }


def _package_data(package: dict[str, Any]) -> dict[str, Any]:
    data = package.get("data") if isinstance(package.get("data"), dict) else {}
    if data.get("package_id") or any(isinstance(data.get(key), list) for key in ("primary_nodes", "acceptance_groups")):
        return data
    return package


def _graph_items(package: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    nodes = []
    for index, item in enumerate(package.get("primary_nodes", []) if isinstance(package.get("primary_nodes"), list) else []):
        if not isinstance(item, dict):
            continue
        node_id = _text(item.get("node_id") or item.get("id") or item.get("item_id") or f"node-{index}")
        nodes.append(
            {
                "id": node_id,
                "title": _text(item.get("title") or item.get("label") or node_id),
                "node_type": _text(item.get("node_type") or item.get("type") or "concept"),
                "status": _text(item.get("review_state") or item.get("status") or "needs_review"),
                "priority": _text(item.get("priority")),
                "owner_id": _text(item.get("owner_id") or item.get("owner")),
                "due_date": _text(item.get("due_date") or item.get("deadline")),
                "confidence": item.get("confidence", ""),
                "source_refs": deepcopy(item.get("source_refs", [])) if isinstance(item.get("source_refs"), list) else [],
                "metadata": {"package_item_id": _item_id(item, node_id)},
                "external_refs": deepcopy(item.get("external_refs", {})) if isinstance(item.get("external_refs"), dict) else {},
            }
        )
    edges = []
    for index, item in enumerate(package.get("relationship_edges", []) if isinstance(package.get("relationship_edges"), list) else []):
        if not isinstance(item, dict):
            continue
        source = _text(item.get("source_node_id") or item.get("source") or item.get("from"))
        target = _text(item.get("target_node_id") or item.get("target") or item.get("to"))
        if not source or not target:
            continue
        edges.append(
            {
                "id": _text(item.get("edge_id") or item.get("id") or item.get("item_id") or f"edge-{index}"),
                "source_node_id": source,
                "target_node_id": target,
                "relationship_type": _text(item.get("label") or item.get("relationship_type") or item.get("type") or "related"),
                "metadata": {"package_item_id": _item_id(item, f"edge-{index}")},
            }
        )
    return {"nodes": nodes, "edges": edges}


def _task_nodes(package: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = []
    for index, item in enumerate(package.get("tasks", []) if isinstance(package.get("tasks"), list) else []):
        if not isinstance(item, dict):
            continue
        node_id = _text(item.get("id") or item.get("node_id") or item.get("item_id") or f"task-{index}")
        tasks.append(
            {
                "id": node_id,
                "title": _text(item.get("title") or item.get("label") or node_id),
                "node_type": "task",
                "status": _text(item.get("status") or item.get("review_state") or "needs_review"),
                "priority": _text(item.get("priority")),
                "owner_id": _text(item.get("owner_id") or item.get("owner") or item.get("assignee")),
                "due_date": _text(item.get("due_date") or item.get("deadline")),
                "confidence": item.get("confidence", ""),
                "source_refs": deepcopy(item.get("source_refs", [])) if isinstance(item.get("source_refs"), list) else [],
                "metadata": {"package_item_id": _item_id(item, node_id)},
                "external_refs": deepcopy(item.get("external_refs", {})) if isinstance(item.get("external_refs"), dict) else {},
            }
        )
    return tasks


def _source_fields(refs: list[dict[str, Any]]) -> dict[str, Any]:
    ref = refs[0] if isinstance(refs, list) and refs and isinstance(refs[0], dict) else {}
    return {
        "Source Document": _text(ref.get("document_id") or ref.get("document_title") or ref.get("source_id") or ref.get("url")),
        "Source Page": ref.get("page", ""),
        "Source Section": _text(ref.get("section")),
        "Source Quote": _text(ref.get("quote_snippet") or ref.get("quote")),
    }


def _all_source_refs(package: dict[str, Any]) -> list[dict[str, Any]]:
    refs = []
    for key in (
        "source_refs",
        "primary_nodes",
        "relationship_edges",
        "view_lenses",
        "structured_evidence",
        "evidence_links",
        "tasks",
        "repair_targets",
        "acceptance_groups",
    ):
        value = package.get(key)
        if key == "source_refs" and isinstance(value, list):
            refs.extend(ref for ref in value if isinstance(ref, dict))
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and isinstance(item.get("source_refs"), list):
                    refs.extend(ref for ref in item["source_refs"] if isinstance(ref, dict))
    return refs


def _unique_refs(refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    unique = []
    for ref in refs:
        key = json.dumps(ref, sort_keys=True)
        if key not in seen:
            seen.add(key)
            unique.append(deepcopy(ref))
    return unique


def _item_id(item: dict[str, Any], fallback: str) -> str:
    return _text(
        item.get("item_id")
        or item.get("id")
        or item.get("node_id")
        or item.get("edge_id")
        or item.get("target_id")
        or item.get("group_id")
        or fallback
    )


def _title(package_data: dict[str, Any], artifact: dict[str, Any]) -> str:
    return _text(artifact.get("title") or package_data.get("title") or package_data.get("package_id") or "Connected package")


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _mermaid_id(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_]", "_", _text(value)).strip("_") or "node"
    return normalized if normalized[0].isalpha() else f"item_{normalized}"


def _mermaid_label(value: str) -> str:
    return _text(value).replace('"', " ").replace("\n", " ").replace("\r", " ").strip()
