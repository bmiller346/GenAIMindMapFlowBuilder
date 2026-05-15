from uuid import uuid4

from graph.schemas import ExportBatch

from .mapper import map_task_node_to_monday_item
from .templates import resolve_monday_template

MONDAY_GROUP_CREATION_POLICY = {
    "mvp_scope": "existing_board_existing_group_only",
    "will_create_groups": False,
    "decision": (
        "MVP exports require the user to choose an existing monday board and group. "
        "Automatic group creation from TraceSpace categories is deferred until conflict "
        "handling and target-template governance exist."
    ),
}


def select_monday_task_nodes(graph: dict) -> list[dict]:
    staged_nodes = [
        node
        for node in graph["nodes"]
        if node.get("monday_selection_input", {}).get("selected")
    ]
    if staged_nodes:
        return staged_nodes

    task_node_ids = {task["node_id"] for task in graph["tasks"]}
    return [node for node in graph["nodes"] if node["id"] in task_node_ids]


def build_export_batch(
    batch_id: str,
    workspace: dict | None,
    target: str,
    scope: str,
    root_node_id: str = "",
    status: str = "previewed",
    external_target_id: str = "",
    item_count: int = 0,
    created_at: str = "",
    created_by: str = "",
) -> dict:
    workspace = workspace or {}
    mode = "confirmed_payload" if status == "confirmed" else "dry_run"
    batch = ExportBatch.from_payload(
        batch_id=batch_id,
        integration="monday",
        target=target,
        mode=mode,
        workspace=workspace,
        scope=scope,
        root_node_id=root_node_id,
        external_target_id=external_target_id,
        item_count=item_count,
        created_at=created_at,
        created_by=created_by,
        status=status,
    ).model_dump()
    return {
        **batch,
        "export_batch_id": batch_id,
        "workspace_id": workspace.get("id", ""),
    }


def export_tasks_to_monday_payload(
    task_nodes: list[dict],
    workspace: dict | None = None,
    confirmed: bool = False,
    batch_id: str | None = None,
    board_id: str = "",
    group_id: str = "",
    scope: str = "workspace",
    root_node_id: str = "",
    created_at: str = "",
    template_id: str = "",
) -> dict:
    """Build a transport-neutral monday export payload for later API delivery."""
    batch_id = batch_id or f"monday-export-{uuid4()}"
    template = resolve_monday_template(template_id)
    external_target_id = (
        f"board:{board_id}/group:{group_id}" if board_id or group_id else ""
    )
    export_batch = build_export_batch(
        batch_id,
        workspace,
        target="monday",
        scope=scope,
        root_node_id=root_node_id,
        status="previewed" if not confirmed else "confirmed",
        external_target_id=external_target_id,
        item_count=len(task_nodes),
        created_at=created_at,
    )
    return {
        "integration": "monday",
        "batch_id": batch_id,
        "export_batch": export_batch,
        "mode": "confirmed_payload" if confirmed else "dry_run",
        "target": {
            "board_id": board_id,
            "group_id": group_id,
            "existing_board": bool(board_id),
            "existing_group": bool(group_id),
        },
        "template": template,
        "workspace": workspace or {},
        "confirmation": {
            "required": True,
            "confirmed": confirmed,
            "message": (
                "Confirmation recorded; payload is ready for the monday client."
                if confirmed
                else "Confirm before creating monday items in the existing board/group."
            ),
        },
        "summary": {
            "item_count": len(task_nodes),
            "will_create_board": False,
            "will_create_groups": False,
            "will_create_items": len(task_nodes),
            "will_use_existing_board": bool(board_id),
            "will_use_existing_group": bool(group_id),
            "group_creation_policy": MONDAY_GROUP_CREATION_POLICY,
        },
        "items": [
            {
                **map_task_node_to_monday_item(node, export_batch),
                "batch_id": batch_id,
                "export_batch_id": batch_id,
            }
            for node in task_nodes
        ],
    }
