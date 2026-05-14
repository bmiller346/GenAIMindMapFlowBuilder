from copy import deepcopy


class MiroClient:
    """Prepare or execute Miro REST API calls for a neutral export payload."""

    def __init__(self, token: str, base_url: str = "https://api.miro.com/v2"):
        self.token = token
        self.base_url = base_url.rstrip("/")

    def build_frame_export_operations(self, board_id: str, payload: dict) -> list[dict]:
        """Return ordered Miro API operations for a branch frame export."""
        frame = payload.get("layout", {}).get("frame", {})
        operations = [
            {
                "method": "POST",
                "url": self._url(board_id, "frames"),
                "client_key": "frame",
                "body": {
                    "data": {"title": frame.get("title", "DocMap export preview")},
                    "position": {
                        "x": frame.get("x", 0),
                        "y": frame.get("y", 0),
                    },
                    "geometry": {
                        "width": frame.get("width", 480),
                        "height": frame.get("height", 240),
                    },
                },
            }
        ]

        operations.extend(
            self._shape_operation(board_id, item)
            for item in payload.get("items", [])
        )
        operations.extend(
            self._connector_operation(board_id, connector)
            for connector in payload.get("connectors", [])
        )
        return operations

    def export_frame_payload(
        self,
        board_id: str,
        payload: dict,
        dry_run: bool = True,
    ) -> dict:
        """Build frame-export operations, or execute them when dry_run is false."""
        operations = self.build_frame_export_operations(board_id, payload)
        if dry_run:
            return {
                "mode": "dry_run",
                "board_id": board_id,
                "batch_id": payload.get("batch_id", ""),
                "export_batch": payload.get("export_batch", {}),
                "operation_count": len(operations),
                "operations": operations,
            }

        responses = []
        response_by_client_key = {}
        for operation in operations:
            executable_operation = self._with_resolved_item_refs(
                operation,
                response_by_client_key,
            )
            response = self._post(executable_operation)
            responses.append(
                {
                    "client_key": operation["client_key"],
                    "response": response,
                }
            )
            response_by_client_key[operation["client_key"]] = response

        return {
            "mode": "executed",
            "board_id": board_id,
            "batch_id": payload.get("batch_id", ""),
            "export_batch": {
                **payload.get("export_batch", {}),
                "mode": "executed",
                "status": "executed",
            },
            "responses": responses,
        }

    def build_native_mindmap_operations(self, board_id: str, payload: dict) -> list[dict]:
        return [
            self._native_mindmap_operation(board_id, item)
            for item in payload.get("nodes", [])
        ]

    def export_native_mindmap_payload(
        self,
        board_id: str,
        payload: dict,
        dry_run: bool = True,
    ) -> dict:
        operations = self.build_native_mindmap_operations(board_id, payload)
        if dry_run:
            return {
                "mode": "dry_run",
                "board_id": board_id,
                "batch_id": payload.get("batch_id", ""),
                "export_batch": payload.get("export_batch", {}),
                "evaluation": payload.get("evaluation", {}),
                "operation_count": len(operations),
                "operations": operations,
            }

        responses = []
        response_by_client_key = {}
        for operation in operations:
            executable_operation = self._with_resolved_mindmap_parent(
                operation,
                response_by_client_key,
            )
            response = self._post(executable_operation)
            responses.append(
                {
                    "client_key": operation["client_key"],
                    "response": response,
                }
            )
            response_by_client_key[operation["client_key"]] = response

        return {
            "mode": "executed",
            "board_id": board_id,
            "batch_id": payload.get("batch_id", ""),
            "export_batch": {
                **payload.get("export_batch", {}),
                "mode": "executed",
                "status": "experimental_executed",
            },
            "evaluation": payload.get("evaluation", {}),
            "responses": responses,
        }

    def _shape_operation(self, board_id: str, item: dict) -> dict:
        source = item.get("source", {})
        return {
            "method": "POST",
            "url": self._url(board_id, "shapes"),
            "client_key": item.get("id", ""),
            "body": {
                "data": {
                    "shape": item.get("shape", "rectangle"),
                    "content": item.get("title", ""),
                },
                "position": item.get("position", {"x": 0, "y": 0}),
                "geometry": item.get("size", {"width": 220, "height": 96}),
                "style": item.get("style", {}),
                "metadata": {
                    "node_id": item.get("node_id", ""),
                    "node_type": item.get("node_type", ""),
                    "review_state": item.get("review_state", ""),
                    "source_document": source.get("document_id", ""),
                    "source_page": source.get("page", ""),
                    "source_quote": source.get("quote_snippet", ""),
                    "export_batch_id": item.get("export_batch_id", ""),
                },
            },
        }

    def _connector_operation(self, board_id: str, connector: dict) -> dict:
        return {
            "method": "POST",
            "url": self._url(board_id, "connectors"),
            "client_key": connector.get("id", ""),
            "body": {
                "startItem": {"id": connector.get("start_item", "")},
                "endItem": {"id": connector.get("end_item", "")},
                "style": connector.get("style", {}),
                "metadata": {
                    "edge_id": connector.get("edge_id", ""),
                    "source_node_id": connector.get("source_node_id", ""),
                    "target_node_id": connector.get("target_node_id", ""),
                    "relationship_type": connector.get("relationship_type", ""),
                    "export_batch_id": connector.get("export_batch_id", ""),
                },
            },
        }

    def _native_mindmap_operation(self, board_id: str, item: dict) -> dict:
        body = {
            "data": {
                "nodeView": item.get("node_view", {}),
            },
            "metadata": item.get("metadata", {}),
        }
        if item.get("parent_item"):
            body["parent"] = {"id": item["parent_item"]}

        return {
            "method": "POST",
            "url": self._experimental_url(board_id, "mindmap_nodes"),
            "client_key": item.get("id", ""),
            "node_id": item.get("node_id", ""),
            "body": body,
        }

    def _post(self, operation: dict) -> dict:
        import requests

        response = requests.post(
            operation["url"],
            headers=self._headers(),
            json=operation["body"],
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def _url(self, board_id: str, collection: str) -> str:
        return f"{self.base_url}/boards/{board_id}/{collection}"

    def _experimental_url(self, board_id: str, collection: str) -> str:
        experimental_base_url = self.base_url.replace("/v2", "/v2-experimental")
        return f"{experimental_base_url}/boards/{board_id}/{collection}"

    def _with_resolved_item_refs(
        self,
        operation: dict,
        response_by_client_key: dict[str, dict],
    ) -> dict:
        if operation.get("url", "").endswith("/connectors"):
            next_operation = deepcopy(operation)
            body = next_operation["body"]
            for item_ref in ("startItem", "endItem"):
                client_key = body.get(item_ref, {}).get("id", "")
                item_id = response_by_client_key.get(client_key, {}).get("id")
                if item_id:
                    body[item_ref]["id"] = item_id
            return next_operation

        return operation

    def _with_resolved_mindmap_parent(
        self,
        operation: dict,
        response_by_client_key: dict[str, dict],
    ) -> dict:
        parent_id = operation.get("body", {}).get("parent", {}).get("id", "")
        if not parent_id:
            return operation

        created_parent_id = response_by_client_key.get(parent_id, {}).get("id")
        if not created_parent_id:
            return operation

        next_operation = deepcopy(operation)
        next_operation["body"]["parent"]["id"] = created_parent_id
        return next_operation
