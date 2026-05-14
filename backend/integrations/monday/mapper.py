def map_task_node_to_monday_item(
    node: dict,
    export_batch: dict | None = None,
) -> dict:
    """Return a neutral monday item payload from an internal task-like node."""
    staged_input = node.get("monday_selection_input", {})
    staged_item = staged_input.get("item") if staged_input.get("selected") else {}
    staged_item = staged_item if isinstance(staged_item, dict) else {}
    source_ref = node.get("source_refs", [{}])[0] if node.get("source_refs") else {}
    external_refs = node.get("external_refs", {})
    return {
        "name": staged_item.get("name") or node.get("title", ""),
        "node_id": staged_item.get("node_id") or node.get("id", ""),
        "status": staged_item.get("status") or node.get("status", "AI Generated"),
        "review_state": staged_item.get("review_state")
        or staged_item.get("status")
        or node.get("status", "AI Generated"),
        "priority": staged_item.get("priority") or node.get("priority", ""),
        "owner": staged_item.get("owner") or node.get("owner_id", ""),
        "due_date": staged_item.get("due_date") or node.get("due_date", ""),
        "confidence": staged_item.get("confidence") or node.get("confidence", ""),
        "source_document": staged_item.get("source_document")
        or source_ref.get("document_id", ""),
        "source_page": staged_item.get("source_page") or source_ref.get("page", ""),
        "source_section": staged_item.get("source_section")
        or source_ref.get("section", ""),
        "source_quote": staged_item.get("source_quote")
        or source_ref.get("quote_snippet", ""),
        "node_type": staged_item.get("node_type") or node.get("node_type", "task"),
        "app_link": node.get("metadata", {}).get("app_link", ""),
        "last_pushed_at": "",
        "monday_selection_input": staged_input if staged_item else {},
        "accepted_flows": staged_input.get("accepted_flows", []) if staged_item else [],
        "selection_reason": staged_input.get("selection_reason", []) if staged_item else [],
        "external_refs": {
            "monday": {
                **external_refs.get("monday", {}),
                **(
                    {"export_batch_id": export_batch.get("id", "")}
                    if export_batch and export_batch.get("id")
                    else {}
                ),
            },
        },
        "export_batch": export_batch or {},
        "export_batch_id": (export_batch or {}).get("id", ""),
    }
