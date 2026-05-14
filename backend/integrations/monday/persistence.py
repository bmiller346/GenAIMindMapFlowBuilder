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


def monday_status_updates_from_result(
    execution_result: dict,
    refs_by_node_id: dict[str, dict],
    pulled_at: str,
) -> dict[str, dict]:
    updates = {}
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
            updates[node_id] = {
                "status": _review_state_from_monday_status(status_text),
                "monday_status": status_text,
                "monday_item_id": item_id,
                "last_pulled_at": pulled_at,
            }
    return updates


def apply_monday_status_updates_to_flow_json(
    flow_json: str,
    status_updates_by_node_id: dict[str, dict],
) -> str:
    if not status_updates_by_node_id:
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
        update = status_updates_by_node_id.get(node_id)
        if not update:
            continue

        data = node.setdefault("data", {})
        if not isinstance(data, dict):
            data = {}
            node["data"] = data

        data["status"] = update["status"]
        nested_data = data.get("data")
        if isinstance(nested_data, dict):
            nested_data["status"] = update["status"]

        external_refs = data.setdefault("external_refs", {})
        if not isinstance(external_refs, dict):
            external_refs = {}
            data["external_refs"] = external_refs

        external_refs["monday"] = {
            **external_refs.get("monday", {}),
            "item_id": update.get("monday_item_id", ""),
            "status": update.get("monday_status", ""),
            "last_pulled_at": update.get("last_pulled_at", ""),
        }

    return json.dumps(flow)


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
