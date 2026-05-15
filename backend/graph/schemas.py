from dataclasses import asdict, dataclass, field
from typing import Any


class GraphSchemaError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("Graph schema validation failed.")
        self.errors = errors


@dataclass(slots=True)
class SourceRef:
    document_id: str
    page: int | str | None = None
    section: str = ""
    quote_snippet: str = ""
    confidence: float | str | None = None


@dataclass(slots=True)
class ExternalRef:
    provider: str
    board_id: str = ""
    item_id: str = ""
    url: str = ""
    export_batch_id: str = ""
    last_pushed_at: str = ""


@dataclass(slots=True)
class ExportBatch:
    id: str
    integration: str
    target: str
    mode: str
    workspace_id: str = ""
    workspace_title: str = ""
    scope: str = "workspace"
    root_node_id: str = ""
    external_target_id: str = ""
    item_count: int = 0
    created_at: str = ""
    created_by: str = ""
    status: str = "prepared"

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_payload(
        cls,
        *,
        batch_id: str,
        integration: str,
        target: str,
        mode: str,
        workspace: dict[str, Any] | None = None,
        scope: str = "workspace",
        root_node_id: str = "",
        external_target_id: str = "",
        item_count: int = 0,
        created_at: str = "",
        created_by: str = "",
        status: str = "prepared",
    ) -> "ExportBatch":
        workspace = workspace or {}
        return cls(
            id=batch_id,
            integration=integration,
            target=target,
            mode=mode,
            workspace_id=str(workspace.get("id", "")),
            workspace_title=str(workspace.get("title", "")),
            scope=scope,
            root_node_id=root_node_id,
            external_target_id=external_target_id,
            item_count=item_count,
            created_at=created_at,
            created_by=created_by,
            status=status,
        )

    @classmethod
    def model_validate(cls, payload: dict[str, Any]) -> None:
        validate_export_batch(payload)


@dataclass(slots=True)
class GraphNode:
    id: str
    title: str
    parent_id: str | None = None
    summary: str = ""
    node_type: str = "concept"
    status: str = "ai_generated"
    priority: str = ""
    owner_id: str = ""
    due_date: str = ""
    confidence: float | str | None = None
    source_refs: list[SourceRef] = field(default_factory=list)
    external_refs: dict[str, dict[str, Any] | ExternalRef] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GraphEdge:
    source_node_id: str
    target_node_id: str
    id: str = ""
    relationship_type: str = "contains"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class TaskProjection:
    id: str
    node_id: str
    title: str
    description: str = ""
    status: str = "ai_generated"
    priority: str = ""
    due_date: str = ""
    assignee: str = ""
    confidence: float | str | None = None
    source_refs: list[SourceRef] = field(default_factory=list)
    external_refs: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GraphValidationIssue:
    code: str
    severity: str
    message: str
    node_id: str = ""
    edge_id: str = ""
    repaired: bool = False

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class GraphValidationReport:
    is_valid: bool = True
    repaired: bool = False
    root_node_id: str = ""
    issues: list[GraphValidationIssue] = field(default_factory=list)

    def model_dump(self) -> dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "repaired": self.repaired,
            "root_node_id": self.root_node_id,
            "issues": [issue.model_dump() for issue in self.issues],
        }


@dataclass(slots=True)
class WorkspaceGraph:
    workspace: dict[str, Any]
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    tasks: list[TaskProjection]
    views: dict[str, Any] = field(default_factory=dict)
    validation_report: GraphValidationReport = field(default_factory=GraphValidationReport)

    @classmethod
    def model_validate(cls, payload: dict[str, Any]) -> None:
        errors: list[str] = []

        _require_dict(payload, "workspace", errors)
        _require_list(payload, "nodes", errors)
        _require_list(payload, "edges", errors)
        _require_list(payload, "tasks", errors)

        for index, node in enumerate(payload.get("nodes", [])):
            if not isinstance(node, dict):
                errors.append(f"nodes.{index}: must be an object")
                continue
            _require_nonempty_string(node, "id", f"nodes.{index}", errors)
            _require_nonempty_string(node, "title", f"nodes.{index}", errors)
            _require_list(node, "source_refs", errors, path=f"nodes.{index}")
            _require_dict(node, "external_refs", errors, path=f"nodes.{index}")
            _require_dict(node, "metadata", errors, path=f"nodes.{index}")

        for index, edge in enumerate(payload.get("edges", [])):
            if not isinstance(edge, dict):
                errors.append(f"edges.{index}: must be an object")
                continue
            _require_nonempty_string(edge, "source_node_id", f"edges.{index}", errors)
            _require_nonempty_string(edge, "target_node_id", f"edges.{index}", errors)
            _require_dict(edge, "metadata", errors, path=f"edges.{index}")

        for index, task in enumerate(payload.get("tasks", [])):
            if not isinstance(task, dict):
                errors.append(f"tasks.{index}: must be an object")
                continue
            _require_nonempty_string(task, "id", f"tasks.{index}", errors)
            _require_nonempty_string(task, "node_id", f"tasks.{index}", errors)
            _require_nonempty_string(task, "title", f"tasks.{index}", errors)

        if errors:
            raise GraphSchemaError(errors)


@dataclass(slots=True)
class WorkspaceBrief:
    configured: bool = False
    preset: str = "custom"
    goal: str = ""
    audience: str = ""
    domain_context: str = ""
    desired_outputs: list[str] = field(default_factory=lambda: ["mind_map"])
    source_mode: str = "source_plus_context"
    assumptions_allowed: bool = False
    output_style: str = "technical_reference_map"
    node_types: list[str] = field(default_factory=list)
    review_policy: list[str] = field(default_factory=list)
    review_rules: str = ""

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def model_validate(cls, payload: dict[str, Any]) -> None:
        validate_workspace_brief(payload)


def validate_workspace_brief(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    if not isinstance(payload, dict):
        raise GraphSchemaError(["workspace_brief: must be an object"])

    _require_optional_bool(payload, "configured", errors, path="workspace_brief")
    _require_optional_bool(payload, "assumptions_allowed", errors, path="workspace_brief")
    for key in (
        "preset",
        "goal",
        "audience",
        "domain_context",
        "source_mode",
        "output_style",
        "review_rules",
    ):
        _require_optional_string(payload, key, errors, path="workspace_brief")

    for key in ("desired_outputs", "node_types", "review_policy"):
        _require_optional_string_list(payload, key, errors, path="workspace_brief")

    if errors:
        raise GraphSchemaError(errors)


def validate_export_batch(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    _require_nonempty_string(payload, "id", "export_batch", errors)
    _require_nonempty_string(payload, "integration", "export_batch", errors)
    _require_nonempty_string(payload, "target", "export_batch", errors)
    _require_nonempty_string(payload, "mode", "export_batch", errors)
    if errors:
        raise GraphSchemaError(errors)


def validate_monday_template(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    _require_nonempty_string(payload, "id", "template", errors)
    _require_nonempty_string(payload, "name", "template", errors)
    _require_nonempty_string(payload, "item_name_field", "template", errors)
    _require_dict(payload, "column_map", errors, path="template")
    column_map = payload.get("column_map", {})
    if isinstance(column_map, dict):
        for required_key in ("node_id", "review_state", "source_document", "export_batch_id"):
            if not column_map.get(required_key):
                errors.append(f"template.column_map.{required_key}: must map to a monday column")
    if errors:
        raise GraphSchemaError(errors)


def validate_monday_export_payload(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    if payload.get("integration") != "monday":
        errors.append("integration: must be monday")
    _require_nonempty_string(payload, "batch_id", "monday_payload", errors)
    _require_dict(payload, "export_batch", errors, path="monday_payload")
    _require_dict(payload, "target", errors, path="monday_payload")
    _require_dict(payload, "template", errors, path="monday_payload")
    _require_list(payload, "items", errors, path="monday_payload")

    if isinstance(payload.get("export_batch"), dict):
        try:
            validate_export_batch(payload["export_batch"])
        except GraphSchemaError as exc:
            errors.extend(exc.errors)
        batch_id = payload.get("batch_id", "")
        export_batch_id = payload["export_batch"].get("id") or payload["export_batch"].get("export_batch_id")
        if batch_id and export_batch_id and batch_id != export_batch_id:
            errors.append("export_batch.id: must match payload batch_id")

    if isinstance(payload.get("template"), dict):
        try:
            validate_monday_template(payload["template"])
        except GraphSchemaError as exc:
            errors.extend(exc.errors)

    target = payload.get("target", {})
    if isinstance(target, dict) and payload.get("mode") == "confirmed_payload":
        for key in ("board_id", "group_id"):
            if not target.get(key):
                errors.append(f"target.{key}: required for confirmed monday payload")

    batch_id = payload.get("batch_id", "")
    for index, item in enumerate(payload.get("items", [])):
        if not isinstance(item, dict):
            errors.append(f"items.{index}: must be an object")
            continue
        _require_nonempty_string(item, "node_id", f"items.{index}", errors)
        _require_nonempty_string(item, "name", f"items.{index}", errors)
        _require_nonempty_string(item, "export_batch_id", f"items.{index}", errors)
        if batch_id and item.get("export_batch_id") and item["export_batch_id"] != batch_id:
            errors.append(f"items.{index}.export_batch_id: must match payload batch_id")

    if errors:
        raise GraphSchemaError(errors)


def validate_monday_execution_result(payload: dict[str, Any]) -> None:
    errors: list[str] = []
    if payload.get("mode") != "executed":
        errors.append("mode: must be executed")
    _require_nonempty_string(payload, "board_id", "monday_result", errors)
    _require_nonempty_string(payload, "group_id", "monday_result", errors)
    _require_dict(payload, "export_batch", errors, path="monday_result")
    _require_dict(payload, "template", errors, path="monday_result")
    _require_list(payload, "responses", errors, path="monday_result")

    if isinstance(payload.get("export_batch"), dict):
        try:
            validate_export_batch(payload["export_batch"])
        except GraphSchemaError as exc:
            errors.extend(exc.errors)

    if isinstance(payload.get("template"), dict):
        try:
            validate_monday_template(payload["template"])
        except GraphSchemaError as exc:
            errors.extend(exc.errors)

    for index, entry in enumerate(payload.get("responses", [])):
        if not isinstance(entry, dict):
            errors.append(f"responses.{index}: must be an object")
            continue
        _require_nonempty_string(entry, "node_id", f"responses.{index}", errors)
        item = _monday_created_item(entry.get("response", {}))
        if not item.get("id"):
            errors.append(f"responses.{index}.response.create_item.id: must be a non-empty string")

    if errors:
        raise GraphSchemaError(errors)


def _monday_created_item(response: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(response, dict):
        return {}
    data = response.get("data", {})
    if isinstance(data, dict) and isinstance(data.get("create_item"), dict):
        return data["create_item"]
    item = response.get("create_item")
    if isinstance(item, dict):
        return item
    return response if isinstance(response, dict) else {}


def _require_dict(
    payload: dict[str, Any],
    key: str,
    errors: list[str],
    path: str = "",
) -> None:
    value = payload.get(key)
    if not isinstance(value, dict):
        errors.append(f"{_field_path(path, key)}: must be an object")


def _require_list(
    payload: dict[str, Any],
    key: str,
    errors: list[str],
    path: str = "",
) -> None:
    value = payload.get(key)
    if not isinstance(value, list):
        errors.append(f"{_field_path(path, key)}: must be a list")


def _require_nonempty_string(
    payload: dict[str, Any],
    key: str,
    path: str,
    errors: list[str],
) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{_field_path(path, key)}: must be a non-empty string")


def _require_optional_string(
    payload: dict[str, Any],
    key: str,
    errors: list[str],
    path: str = "",
) -> None:
    value = payload.get(key)
    if value is not None and not isinstance(value, str):
        errors.append(f"{_field_path(path, key)}: must be a string")


def _require_optional_bool(
    payload: dict[str, Any],
    key: str,
    errors: list[str],
    path: str = "",
) -> None:
    value = payload.get(key)
    if value is not None and not isinstance(value, bool):
        errors.append(f"{_field_path(path, key)}: must be a boolean")


def _require_optional_string_list(
    payload: dict[str, Any],
    key: str,
    errors: list[str],
    path: str = "",
) -> None:
    value = payload.get(key)
    if value is None:
        return
    if not isinstance(value, list):
        errors.append(f"{_field_path(path, key)}: must be a list")
        return
    for index, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"{_field_path(path, key)}.{index}: must be a string")


def _field_path(path: str, key: str) -> str:
    return f"{path}.{key}" if path else key
