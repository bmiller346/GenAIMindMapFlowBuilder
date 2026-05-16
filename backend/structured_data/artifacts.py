from __future__ import annotations

import hashlib
import json
from typing import Any


def build_structured_data_artifacts(
    *,
    source_type: str,
    source_id: str,
    question: str,
    table_name: str = "",
    sql: str = "",
    rows: list[dict[str, Any]] | None = None,
    summary: str = "",
    chart_json: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create source-backed artifacts for table/chart/query outputs."""

    normalized_rows = _normalize_rows(rows or [])
    columns = _columns_for_rows(normalized_rows)
    chart_spec = _normalize_chart_spec(chart_json)
    result_hash = _result_hash(normalized_rows, chart_spec)
    query_id = _stable_id("query", f"{source_type}:{source_id}:{sql}:{result_hash}")
    data_source_ref = {
        "source_type": "data_table",
        "source_id": source_id,
        "table_name": table_name,
        "row_ids": _row_ids(normalized_rows),
        "columns": columns,
        "query": sql,
        "query_id": query_id,
        "result_hash": result_hash,
        "row_count": len(normalized_rows),
        "confidence": 0.91 if normalized_rows else 0.58,
    }
    sql_source_ref = {
        "source_type": "sql_query",
        "database_id": source_id,
        "table_name": table_name,
        "query_id": query_id,
        "sql": sql,
        "result_hash": result_hash,
        "row_count": len(normalized_rows),
        "columns": columns,
        "confidence": 0.9 if sql else 0.45,
    }
    source_refs = [data_source_ref, sql_source_ref] if sql else [data_source_ref]

    artifacts = [
        _artifact(
            "sql_query",
            "SQL Query" if source_type == "sql" else "Generated Query",
            {
                "query_id": query_id,
                "sql": sql,
                "table_name": table_name,
                "result_hash": result_hash,
            },
            source_refs,
            review_state="source_backed" if sql else "needs_review",
        ),
        _artifact(
            "data_table",
            "Query Result Table",
            {
                "rows": normalized_rows,
                "columns": columns,
                "row_count": len(normalized_rows),
                "table_name": table_name,
                "query_id": query_id,
                "result_hash": result_hash,
            },
            source_refs,
            review_state="source_backed" if normalized_rows else "needs_review",
        ),
    ]
    if chart_spec:
        artifacts.append(
            _artifact(
                "chart",
                "Query Result Chart",
                {
                    "chart_spec": chart_spec,
                    "chart_library": "plotly",
                    "table_name": table_name,
                    "query_id": query_id,
                    "result_hash": result_hash,
                },
                source_refs,
                review_state="source_backed",
            )
        )
    if summary:
        artifacts.append(
            _artifact(
                "data_summary",
                "Data Summary",
                {
                    "summary": summary,
                    "question": question,
                    "table_name": table_name,
                    "query_id": query_id,
                },
                source_refs,
                review_state="source_backed" if normalized_rows else "needs_review",
            )
        )

    return {
        "node_type": "artifact",
        "artifact_type": "structured_data_analysis",
        "artifact_ids": [artifact["id"] for artifact in artifacts],
        "review_state": "source_backed" if normalized_rows or sql else "needs_review",
        "source_refs": source_refs,
        "generated_artifacts": artifacts,
        "metadata": {
            "domain": "structured_data",
            "source_type": source_type,
            "source_id": source_id,
            "table_name": table_name,
            "query_id": query_id,
            "result_hash": result_hash,
            "row_count": len(normalized_rows),
            "columns": columns,
            "review_state": "source_backed" if normalized_rows or sql else "needs_review",
        },
    }


def _artifact(
    artifact_type: str,
    title: str,
    data: dict[str, Any],
    source_refs: list[dict[str, Any]],
    *,
    review_state: str,
) -> dict[str, Any]:
    return {
        "id": _stable_id("structured-artifact", f"{artifact_type}:{json.dumps(data, sort_keys=True, default=str)}"),
        "artifact_type": artifact_type,
        "title": title,
        "data": data,
        "source_refs": source_refs,
        "review_state": review_state,
        "metadata": {
            "domain": "structured_data",
            "generated_by": "structured_data_source_analysis",
        },
    }


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for row in rows:
        if isinstance(row, dict):
            normalized.append({str(key): value for key, value in row.items()})
    return normalized


def _columns_for_rows(rows: list[dict[str, Any]]) -> list[str]:
    columns: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in columns:
                columns.append(key)
    return columns


def _row_ids(rows: list[dict[str, Any]]) -> list[str]:
    ids = []
    for index, row in enumerate(rows[:200]):
        explicit_id = row.get("id") or row.get("ID") or row.get("_id")
        ids.append(str(explicit_id if explicit_id is not None else index + 1))
    return ids


def _result_hash(rows: list[dict[str, Any]], chart_json: str | dict[str, Any] | None) -> str:
    payload = {"rows": rows, "chart": chart_json or ""}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _stable_id(kind: str, value: str) -> str:
    digest = hashlib.sha256(f"{kind}:{value}".encode("utf-8")).hexdigest()
    return f"{kind}_{digest[:16]}"


def _normalize_chart_spec(chart_json: str | dict[str, Any] | None) -> dict[str, Any] | str:
    if isinstance(chart_json, dict):
        return chart_json
    if isinstance(chart_json, str):
        stripped = chart_json.strip()
        if not stripped:
            return ""
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return stripped
        return parsed if isinstance(parsed, dict) else stripped
    return ""
