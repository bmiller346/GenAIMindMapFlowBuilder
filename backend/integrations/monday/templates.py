DEFAULT_TEMPLATE_ID = "docmap_default"
AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID = "autodesk_building_block_review"


DOCMAP_DEFAULT_TEMPLATE = {
    "id": DEFAULT_TEMPLATE_ID,
    "name": "DocMap default",
    "description": "Neutral DocMap task fields using stable column keys.",
    "item_name_field": "name",
    "column_value_types": {
        "status": "status",
        "review_state": "status",
        "due_date": "date",
    },
    "column_map": {
        "status": "status",
        "priority": "priority",
        "due_date": "due_date",
        "owner": "owner",
        "confidence": "confidence",
        "node_id": "node_id",
        "node_type": "node_type",
        "review_state": "review_state",
        "source_document": "source_document",
        "source_page": "source_page",
        "source_section": "source_section",
        "source_quote": "source_quote",
        "app_link": "app_link",
        "export_batch_id": "export_batch_id",
    },
}


AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE = {
    "id": AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE_ID,
    "name": "Autodesk Building Block Review",
    "description": (
        "Existing-board mapping for review tasks created from accepted DocMap "
        "building-block metadata."
    ),
    "item_name_field": "name",
    "column_value_types": {
        "status": "status",
        "review_state": "status",
        "due_date": "date",
    },
    "column_map": {
        "status": "review_status",
        "review_state": "docmap_review_state",
        "priority": "priority",
        "owner": "owner",
        "due_date": "target_date",
        "confidence": "ai_confidence",
        "node_id": "docmap_node_id",
        "node_type": "building_block_type",
        "source_document": "source_document",
        "source_page": "source_page",
        "source_section": "source_section",
        "source_quote": "source_evidence",
        "app_link": "docmap_link",
        "export_batch_id": "export_batch_id",
        "accepted_flows": "accepted_preview_flows",
        "selection_reason": "selection_reason",
    },
}


MONDAY_TEMPLATES = {
    DOCMAP_DEFAULT_TEMPLATE["id"]: DOCMAP_DEFAULT_TEMPLATE,
    AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE["id"]: AUTODESK_BUILDING_BLOCK_REVIEW_TEMPLATE,
}


def resolve_monday_template(template_id: str | None = None) -> dict:
    template = MONDAY_TEMPLATES.get(template_id or DEFAULT_TEMPLATE_ID)
    return template or DOCMAP_DEFAULT_TEMPLATE


def map_item_to_template_columns(item: dict, template: dict) -> dict:
    column_values = {}
    value_types = template.get("column_value_types", {})
    for source_key, column_id in template.get("column_map", {}).items():
        value = item.get(source_key, "")
        if isinstance(value, list):
            value = ", ".join(str(entry) for entry in value if entry)
        if value in ("", None):
            continue
        formatted_value = _format_monday_column_value(
            value,
            value_types.get(source_key, "text"),
        )
        if formatted_value in ("", None):
            continue
        column_values[column_id] = formatted_value
    return column_values


def _format_monday_column_value(value, value_type: str):
    if value_type == "status":
        return {"label": str(value)}
    if value_type == "date":
        date_value = str(value).split("T", 1)[0]
        if not _is_iso_date(date_value):
            return None
        return {"date": date_value}
    return value


def _is_iso_date(value: str) -> bool:
    parts = value.split("-")
    return (
        len(parts) == 3
        and len(parts[0]) == 4
        and len(parts[1]) == 2
        and len(parts[2]) == 2
        and all(part.isdigit() for part in parts)
    )
