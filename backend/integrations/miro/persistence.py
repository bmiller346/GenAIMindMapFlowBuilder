import json


def miro_item_refs_from_result(
    board_id: str,
    execution_result: dict,
    pushed_at: str,
) -> dict[str, dict]:
    """Extract node external refs from a Miro frame execution result."""
    refs = {}
    export_batch = execution_result.get("export_batch", {})
    export_batch_id = (
        execution_result.get("batch_id")
        or export_batch.get("id", "")
    )

    for item in execution_result.get("responses", []):
        client_key = item.get("client_key", "")
        if not client_key.startswith("shape-"):
            continue

        response = item.get("response", {})
        item_id = response.get("id")
        if not item_id:
            continue

        node_id = client_key.removeprefix("shape-")
        refs[node_id] = {
            "board_id": board_id,
            "item_id": item_id,
            "url": _miro_item_url(board_id, item_id, response),
            "export_batch_id": export_batch_id,
            "last_pushed_at": pushed_at,
        }

    return refs


def apply_miro_external_refs_to_flow_json(
    flow_json: str,
    refs_by_node_id: dict[str, dict],
) -> str:
    """Return flow JSON with Miro refs merged onto matching React Flow nodes."""
    if not refs_by_node_id:
        return flow_json

    try:
        flow_object = json.loads(flow_json)
    except json.JSONDecodeError:
        return flow_json

    if not isinstance(flow_object, dict):
        return flow_json

    nodes = flow_object.get("nodes", [])
    if not isinstance(nodes, list):
        return flow_json

    for node in nodes:
        node_id = node.get("id") if isinstance(node, dict) else None
        ref = refs_by_node_id.get(node_id)
        if not ref:
            continue

        data = node.setdefault("data", {})
        if not isinstance(data, dict):
            continue

        external_refs = data.setdefault("external_refs", {})
        if not isinstance(external_refs, dict):
            external_refs = {}
            data["external_refs"] = external_refs

        external_refs["miro"] = {
            **external_refs.get("miro", {}),
            **ref,
        }

    return json.dumps(flow_object)


def _miro_item_url(board_id: str, item_id: str, response: dict) -> str:
    links = response.get("links", {})
    if isinstance(links, dict) and links.get("self"):
        return links["self"]

    return f"https://miro.com/app/board/{board_id}/?moveToWidget={item_id}"
