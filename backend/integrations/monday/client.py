import json

from .templates import map_item_to_template_columns, resolve_monday_template


class MondayClient:
    """Prepare or execute monday.com GraphQL calls for controlled item exports."""

    def __init__(self, token: str, base_url: str = "https://api.monday.com/v2"):
        self.token = token
        self.base_url = base_url

    def build_existing_group_item_operations(self, payload: dict) -> list[dict]:
        target = payload.get("target", {})
        board_id = target.get("board_id", "")
        group_id = target.get("group_id", "")
        template = resolve_monday_template(payload.get("template", {}).get("id"))
        return [
            self._create_item_operation(board_id, group_id, item, template)
            for item in payload.get("items", [])
        ]

    def export_existing_group_items(
        self,
        payload: dict,
        dry_run: bool = True,
    ) -> dict:
        operations = self.build_existing_group_item_operations(payload)
        export_batch = payload.get("export_batch", {})
        if dry_run:
            return {
                "mode": "dry_run",
                "board_id": payload.get("target", {}).get("board_id", ""),
                "group_id": payload.get("target", {}).get("group_id", ""),
                "operation_count": len(operations),
                "export_batch": export_batch,
                "template": payload.get("template", {}),
                "operations": operations,
            }

        responses = []
        for operation in operations:
            responses.append(
                {
                    "client_key": operation["client_key"],
                    "node_id": operation["node_id"],
                    "response": self._post(operation),
                }
            )

        return {
            "mode": "executed",
            "board_id": payload.get("target", {}).get("board_id", ""),
            "group_id": payload.get("target", {}).get("group_id", ""),
            "export_batch": {
                **export_batch,
                "status": "pushed",
            },
            "template": payload.get("template", {}),
            "responses": responses,
        }

    def build_existing_group_preflight_operation(
        self,
        board_id: str,
        group_id: str,
        template_id: str = "",
    ) -> dict:
        template = resolve_monday_template(template_id)
        column_ids = sorted(set(template.get("column_map", {}).values()))
        return {
            "method": "POST",
            "url": self.base_url,
            "client_key": "monday-existing-group-preflight",
            "query": (
                "query DocMapMondayPreflight($board_ids: [ID!]) { "
                "boards(ids: $board_ids) { id name "
                "groups { id title } "
                "columns { id title type settings_str } } }"
            ),
            "variables": {"board_ids": [str(board_id)]},
            "metadata": {
                "board_id": str(board_id),
                "group_id": group_id,
                "template_id": template.get("id", ""),
                "required_column_ids": column_ids,
                "required_column_types": _required_column_types(template),
            },
        }

    def preflight_existing_group(
        self,
        board_id: str,
        group_id: str,
        template_id: str = "",
        dry_run: bool = True,
    ) -> dict:
        operation = self.build_existing_group_preflight_operation(
            board_id,
            group_id,
            template_id=template_id,
        )
        if dry_run:
            return {
                "mode": "dry_run",
                "board_id": str(board_id),
                "group_id": group_id,
                "template": resolve_monday_template(template_id),
                "operation": operation,
            }

        response = self._post(operation)
        return {
            "mode": "executed",
            "board_id": str(board_id),
            "group_id": group_id,
            "template": resolve_monday_template(template_id),
            "operation": operation,
            "response": response,
            "preflight": assess_existing_group_preflight(response, operation),
        }

    def build_status_pull_operations(
        self,
        refs_by_node_id: dict[str, dict],
        status_column_ids: list[str] | None = None,
    ) -> list[dict]:
        status_column_ids = status_column_ids or [
            "status",
            "review_status",
            "docmap_review_state",
        ]
        item_ids = [
            ref.get("item_id", "")
            for ref in refs_by_node_id.values()
            if ref.get("item_id")
        ]
        if not item_ids:
            return []

        return [
            {
                "method": "POST",
                "url": self.base_url,
                "client_key": "monday-status-pull",
                "query": (
                    "query DocMapStatusPull($item_ids: [ID!], $column_ids: [String!]) { "
                    "items(ids: $item_ids) { id name column_values(ids: $column_ids) { "
                    "id text value } } }"
                ),
                "variables": {
                    "item_ids": [str(item_id) for item_id in item_ids],
                    "column_ids": status_column_ids,
                },
                "metadata": {
                    "node_by_item_id": {
                        str(ref.get("item_id", "")): node_id
                        for node_id, ref in refs_by_node_id.items()
                        if ref.get("item_id")
                    },
                    "status_column_ids": status_column_ids,
                },
            }
        ]

    def pull_item_statuses(
        self,
        refs_by_node_id: dict[str, dict],
        dry_run: bool = True,
        status_column_ids: list[str] | None = None,
    ) -> dict:
        operations = self.build_status_pull_operations(
            refs_by_node_id,
            status_column_ids=status_column_ids,
        )
        if dry_run:
            return {
                "mode": "dry_run",
                "operation_count": len(operations),
                "operations": operations,
            }

        return {
            "mode": "executed",
            "responses": [
                {
                    "client_key": operation["client_key"],
                    "metadata": operation.get("metadata", {}),
                    "response": self._post(operation),
                }
                for operation in operations
            ],
        }

    def _create_item_operation(
        self,
        board_id: str,
        group_id: str,
        item: dict,
        template: dict,
    ) -> dict:
        column_values = map_item_to_template_columns(
            {
                **item,
                "export_batch_id": item.get("export_batch_id", item.get("batch_id", "")),
            },
            template,
        )
        return {
            "method": "POST",
            "url": self.base_url,
            "client_key": f"monday-item-{item.get('node_id', '')}",
            "node_id": item.get("node_id", ""),
            "query": (
                "mutation CreateDocMapItem($board_id: ID!, $group_id: String!, "
                "$item_name: String!, $column_values: JSON!) { "
                "create_item(board_id: $board_id, group_id: $group_id, "
                "item_name: $item_name, column_values: $column_values) { id url } }"
            ),
            "variables": {
                "board_id": str(board_id),
                "group_id": group_id,
                "item_name": item.get(template.get("item_name_field", "name"), ""),
                "column_values": json.dumps(column_values),
            },
            "metadata": {
                "batch_id": item.get("export_batch_id", item.get("batch_id", "")),
                "source_node_id": item.get("node_id", ""),
                "template_id": template.get("id", ""),
            },
        }

    def _post(self, operation: dict) -> dict:
        import requests

        response = requests.post(
            operation["url"],
            headers=self._headers(),
            json={
                "query": operation["query"],
                "variables": operation["variables"],
            },
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        if body.get("errors"):
            raise RuntimeError(body["errors"])
        return body

    def _headers(self) -> dict:
        return {
            "Authorization": self.token,
            "Content-Type": "application/json",
        }


def assess_existing_group_preflight(response: dict, operation: dict) -> dict:
    metadata = operation.get("metadata", {})
    board_id = str(metadata.get("board_id", ""))
    group_id = metadata.get("group_id", "")
    required_column_ids = metadata.get("required_column_ids", [])
    required_column_types = metadata.get("required_column_types", {})
    board = _board_from_response(response, board_id)
    issues = []
    warnings = []

    if not board:
        issues.append(
            {
                "code": "monday_board_not_found",
                "message": f"monday board {board_id} was not returned.",
            }
        )
        return {
            "ok": False,
            "board_found": False,
            "group_found": False,
            "missing_column_ids": required_column_ids,
            "type_mismatches": [],
            "issues": issues,
            "warnings": warnings,
        }

    groups = board.get("groups", []) if isinstance(board.get("groups"), list) else []
    columns = board.get("columns", []) if isinstance(board.get("columns"), list) else []
    columns_by_id = {
        str(column.get("id", "")): column
        for column in columns
        if isinstance(column, dict) and column.get("id")
    }
    group_found = any(str(group.get("id", "")) == group_id for group in groups)
    if not group_found:
        issues.append(
            {
                "code": "monday_group_not_found",
                "message": f"monday group {group_id} was not returned for board {board_id}.",
            }
        )

    missing_column_ids = [
        column_id
        for column_id in required_column_ids
        if column_id not in columns_by_id
    ]
    for column_id in missing_column_ids:
        issues.append(
            {
                "code": "monday_column_not_found",
                "column_id": column_id,
                "message": f"monday column {column_id} was not returned for board {board_id}.",
            }
        )

    type_mismatches = []
    for column_id, expected_type in required_column_types.items():
        column = columns_by_id.get(column_id)
        if not column:
            continue
        actual_type = str(column.get("type", ""))
        if expected_type and actual_type and actual_type != expected_type:
            mismatch = {
                "column_id": column_id,
                "expected_type": expected_type,
                "actual_type": actual_type,
            }
            type_mismatches.append(mismatch)
            issues.append(
                {
                    "code": "monday_column_type_mismatch",
                    "message": (
                        f"monday column {column_id} is {actual_type}, "
                        f"expected {expected_type}."
                    ),
                    **mismatch,
                }
            )

    if required_column_types:
        warnings.append(
            {
                "code": "monday_status_labels_unverified",
                "message": (
                    "Preflight checks status column type, but item-specific labels "
                    "are validated by monday during item creation."
                ),
            }
        )

    return {
        "ok": not issues,
        "board_found": True,
        "group_found": group_found,
        "board": {
            "id": str(board.get("id", "")),
            "name": board.get("name", ""),
        },
        "missing_column_ids": missing_column_ids,
        "type_mismatches": type_mismatches,
        "issues": issues,
        "warnings": warnings,
    }


def _required_column_types(template: dict) -> dict:
    value_types = template.get("column_value_types", {})
    column_map = template.get("column_map", {})
    monday_type_by_value_type = {"status": "status", "date": "date"}
    return {
        column_map[source_key]: monday_type
        for source_key, value_type in value_types.items()
        for monday_type in [monday_type_by_value_type.get(value_type)]
        if monday_type and column_map.get(source_key)
    }


def _board_from_response(response: dict, board_id: str) -> dict:
    data = response.get("data", {}) if isinstance(response, dict) else {}
    boards = data.get("boards", []) if isinstance(data, dict) else []
    if not isinstance(boards, list):
        return {}
    for board in boards:
        if isinstance(board, dict) and str(board.get("id", "")) == str(board_id):
            return board
    return boards[0] if boards and isinstance(boards[0], dict) else {}
