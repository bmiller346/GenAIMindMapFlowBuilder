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
