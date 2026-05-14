import json


MONDAY_STATUS_TO_REVIEW_STATE = {
    "done": "accepted",
    "complete": "accepted",
    "completed": "accepted",
    "accepted": "accepted",
    "approved": "accepted",
    "working on it": "in_review",
    "in progress": "in_review",
    "in review": "in_review",
    "review": "in_review",
    "stuck": "needs_review",
    "blocked": "needs_review",
    "needs review": "needs_review",
    "needs_review": "needs_review",
    "changes requested": "needs_review",
    "rejected": "needs_review",
}


def monday_refs_from_flow_json(flow_json: str) -> dict[str, dict]:
    try:
        flow = json.loads(flow_json or "{}")
    except json.JSONDecodeError:
        return {}

    refs = {}
    for node in flow.get("nodes", []):
        node_id = node.get("id", "")
        data = node.get("data", {})
        external_refs = data.get("external_refs", {}) if isinstance(data, dict) else {}
        monday_ref = external_refs.get("monday", {}) if isinstance(external_refs, dict) else {}
        if node_id and monday_ref.get("item_id"):
            refs[node_id] = monday_ref
    return refs


def monday_item_refs_from_result(
    board_id: str,
    group_id: str,
    execution_result: dict,
    pushed_at: str,
) -> dict[str, dict]:
    refs = {}
    export_batch = execution_result.get("export_batch", {})
    for entry in execution_result.get("responses", []):
        node_id = entry.get("node_id", "")
        item = _created_item_from_response(entry.get("response", {}))
        item_id = item.get("id", "")
        if not node_id or not item_id:
            continue

        refs[node_id] = {
            "board_id": board_id,
            "group_id": group_id,
            "item_id": item_id,
            "url": item.get("url", ""),
            "export_batch_id": export_batch.get(
                "export_batch_id",
                execution_result.get("batch_id", ""),
            ),
            "last_pushed_at": pushed_at,
        }
    return refs


def monday_status_projections_from_result(
    execution_result: dict,
    refs_by_node_id: dict[str, dict],
    pulled_at: str,
) -> dict[str, dict]:
    projections = {}
    node_by_item_id = {
        str(ref.get("item_id", "")): node_id
        for node_id, ref in refs_by_node_id.items()
        if ref.get("item_id")
    }
    for entry in execution_result.get("responses", []):
        metadata_node_by_item = entry.get("metadata", {}).get("node_by_item_id", {})
        node_by_item_id = {**node_by_item_id, **metadata_node_by_item}
        for item in _items_from_status_response(entry.get("response", {})):
            item_id = str(item.get("id", ""))
            node_id = node_by_item_id.get(item_id)
            status_text = _status_text_from_item(item)
            if not node_id or not status_text:
                continue
            projections[node_id] = {
                "projected_status": _review_state_from_monday_status(status_text),
                "monday_status": status_text,
                "monday_item_id": item_id,
                "last_pulled_at": pulled_at,
            }
    return projections


def apply_monday_status_projection_to_flow_json(
    flow_json: str,
    status_projections_by_node_id: dict[str, dict],
) -> str:
    """Persist monday status as bridge metadata without changing canonical status."""
    if not status_projections_by_node_id:
        return flow_json

    try:
        flow = json.loads(flow_json or "{}")
    except json.JSONDecodeError:
        return flow_json

    nodes = flow.get("nodes", [])
    if not isinstance(nodes, list):
        return flow_json

    for node in nodes:
        node_id = node.get("id", "")
        projection = status_projections_by_node_id.get(node_id)
        if not projection:
            continue

        data = node.setdefault("data", {})
        if not isinstance(data, dict):
            data = {}
            node["data"] = data

        external_status_projections = data.setdefault(
            "external_status_projections",
            {},
        )
        if not isinstance(external_status_projections, dict):
            external_status_projections = {}
            data["external_status_projections"] = external_status_projections
        external_status_projections["monday"] = {
            "projected_status": projection.get("projected_status", ""),
            "status": projection.get("monday_status", ""),
            "item_id": projection.get("monday_item_id", ""),
            "last_pulled_at": projection.get("last_pulled_at", ""),
        }

        external_refs = data.setdefault("external_refs", {})
        if not isinstance(external_refs, dict):
            external_refs = {}
            data["external_refs"] = external_refs

        external_refs["monday"] = {
            **external_refs.get("monday", {}),
            "item_id": projection.get("monday_item_id", ""),
            "status": projection.get("monday_status", ""),
            "projected_status": projection.get("projected_status", ""),
            "last_pulled_at": projection.get("last_pulled_at", ""),
        }

    return json.dumps(flow)


def monday_status_updates_from_result(
    execution_result: dict,
    refs_by_node_id: dict[str, dict],
    pulled_at: str,
) -> dict[str, dict]:
    """Backward-compatible alias for monday status projection payloads."""
    return monday_status_projections_from_result(
        execution_result,
        refs_by_node_id,
        pulled_at,
    )


def apply_monday_status_updates_to_flow_json(
    flow_json: str,
    status_updates_by_node_id: dict[str, dict],
) -> str:
    """Backward-compatible alias that no longer mutates canonical node status."""
    return apply_monday_status_projection_to_flow_json(
        flow_json,
        status_updates_by_node_id,
    )


def apply_monday_external_refs_to_flow_json(
    flow_json: str,
    refs_by_node_id: dict[str, dict],
) -> str:
    if not refs_by_node_id:
        return flow_json

    try:
        flow = json.loads(flow_json or "{}")
    except json.JSONDecodeError:
        return flow_json

    nodes = flow.get("nodes", [])
    if not isinstance(nodes, list):
        return flow_json

    for node in nodes:
        node_id = node.get("id", "")
        ref = refs_by_node_id.get(node_id)
        if not ref:
            continue

        data = node.setdefault("data", {})
        if not isinstance(data, dict):
            data = {}
            node["data"] = data

        external_refs = data.setdefault("external_refs", {})
        if not isinstance(external_refs, dict):
            external_refs = {}
            data["external_refs"] = external_refs

        external_refs["monday"] = {
            **external_refs.get("monday", {}),
            **ref,
        }

    return json.dumps(flow)


def _created_item_from_response(response: dict) -> dict:
    data = response.get("data", {})
    item = data.get("create_item", {})
    if item:
        return item
    return response.get("create_item", response)


def _items_from_status_response(response: dict) -> list[dict]:
    data = response.get("data", {})
    items = data.get("items", [])
    return items if isinstance(items, list) else []


def _status_text_from_item(item: dict) -> str:
    for column in item.get("column_values", []):
        text = column.get("text", "")
        if text:
            return text
    return ""


def _review_state_from_monday_status(status_text: str) -> str:
    normalized = status_text.strip().lower().replace("-", " ").replace("_", " ")
    return MONDAY_STATUS_TO_REVIEW_STATE.get(normalized, "needs_review")
