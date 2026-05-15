from typing import Any


TASK_CAPABLE_TYPES = {"task", "procedure", "workflow", "needs_review", "requirement"}
ENTERPRISE_ACTION_TYPES = {*TASK_CAPABLE_TYPES, "risk", "decision", "milestone"}
SCORE_BY_SIGNAL = {
    "critical": 100,
    "urgent": 100,
    "high": 85,
    "medium": 60,
    "moderate": 60,
    "low": 35,
    "minimal": 20,
    "none": 0,
}
EFFORT_READINESS_BY_SIGNAL = {
    "low": 100,
    "small": 100,
    "medium": 70,
    "moderate": 70,
    "high": 40,
    "large": 40,
    "critical": 25,
    "complex": 25,
}


def build_enterprise_scoring(graph: dict[str, Any]) -> dict[str, Any]:
    rows = [
        enterprise_score_node(node)
        for node in graph.get("nodes", [])
        if node.get("node_type") != "reference"
    ]
    node_count = len(rows)
    average_score = (
        round(sum(row["enterprise_score"] for row in rows) / node_count)
        if node_count
        else 0
    )
    dimensions = [
        "business_impact",
        "implementation_effort",
        "risk_severity",
        "source_coverage",
        "owner_clarity",
    ]
    dimension_averages = {
        key: (
            round(
                sum(row["enterprise_scores"][key] for row in rows) / node_count
            )
            if node_count
            else 0
        )
        for key in dimensions
    }
    blockers = [
        {
            "id": row["id"],
            "title": row["title"],
            "enterprise_score": row["enterprise_score"],
            "reasons": row["enterprise_reasons"],
        }
        for row in rows
        if row["enterprise_readiness"] == "not_ready"
        or row["enterprise_scores"]["risk_severity"] >= 75
        or row["enterprise_scores"]["source_coverage"] < 60
        or row["enterprise_scores"]["owner_clarity"] < 60
    ]

    return {
        "score": average_score,
        "label": _summary_label(average_score),
        "node_count": node_count,
        "ready_count": sum(
            1 for row in rows if row["enterprise_readiness"] == "enterprise_ready"
        ),
        "watchlist_count": sum(
            1 for row in rows if row["enterprise_readiness"] == "watchlist"
        ),
        "not_ready_count": sum(
            1 for row in rows if row["enterprise_readiness"] == "not_ready"
        ),
        "dimension_averages": dimension_averages,
        "blockers": blockers,
        "rows": rows,
    }


def enterprise_score_node(node: dict[str, Any]) -> dict[str, Any]:
    scores = {
        "business_impact": _business_impact_score(node),
        "implementation_effort": _implementation_readiness_score(node),
        "risk_severity": _risk_severity_score(node),
        "source_coverage": _source_coverage_score(node),
        "owner_clarity": _owner_clarity_score(node),
    }
    readiness_score = round(
        scores["business_impact"] * 0.22
        + scores["implementation_effort"] * 0.18
        + (100 - scores["risk_severity"]) * 0.22
        + scores["source_coverage"] * 0.22
        + scores["owner_clarity"] * 0.16
    )

    return {
        "id": node.get("id", ""),
        "title": node.get("title", ""),
        "node_type": node.get("node_type", ""),
        "status": node.get("status", ""),
        "enterprise_score": max(0, min(100, readiness_score)),
        "enterprise_readiness": _readiness_band(readiness_score),
        "enterprise_scores": scores,
        "enterprise_reasons": _enterprise_reasons(node, scores),
    }


def _business_impact_score(node: dict[str, Any]) -> int:
    explicit_score = _score_from_signal(_enterprise_value(node, "business_impact"), None)
    if explicit_score is not None:
        return explicit_score

    priority = _normalize_signal(node.get("priority", ""))
    if priority in SCORE_BY_SIGNAL:
        return SCORE_BY_SIGNAL[priority]

    node_type = node.get("node_type")
    if node_type in {"requirement", "decision"}:
        return 75
    if node_type in {"task", "workflow"}:
        return 65
    if node_type == "risk":
        return 70
    return 50


def _implementation_readiness_score(node: dict[str, Any]) -> int:
    value = _enterprise_value(node, "implementation_effort")
    normalized = _normalize_signal(value)
    if normalized in EFFORT_READINESS_BY_SIGNAL:
        return EFFORT_READINESS_BY_SIGNAL[normalized]

    parsed = _parse_number(value)
    if parsed is not None:
        effort_score = max(0, min(100, parsed if parsed > 1 else parsed * 100))
        return round(100 - effort_score)

    node_type = node.get("node_type")
    if node_type in {"workflow", "procedure"}:
        return 60
    if node_type == "risk":
        return 55
    return 72


def _risk_severity_score(node: dict[str, Any]) -> int:
    explicit_score = _score_from_signal(_enterprise_value(node, "risk_severity"), None)
    if explicit_score is not None:
        return explicit_score

    if node.get("node_type") == "risk" or node.get("status") == "needs_review":
        return 75

    confidence = _parse_confidence(node.get("confidence"))
    if confidence is not None and confidence < 0.6:
        return 70
    if not any(ref.get("document_id") for ref in node.get("source_refs", [])):
        return 60
    return 35


def _source_coverage_score(node: dict[str, Any]) -> int:
    refs = [
        ref
        for ref in node.get("source_refs", [])
        if isinstance(ref, dict) and ref.get("document_id")
    ]
    if not refs:
        return 0

    ref_scores = []
    for ref in refs:
        score = 55
        if ref.get("page") or ref.get("section"):
            score += 15
        if ref.get("quote_snippet"):
            score += 20
        confidence = _parse_confidence(ref.get("confidence", node.get("confidence")))
        if confidence is not None:
            score += round(confidence * 10)
            if confidence < 0.6:
                score -= 18
        ref_scores.append(max(0, min(100, score)))

    return round(sum(ref_scores) / len(ref_scores))


def _owner_clarity_score(node: dict[str, Any]) -> int:
    requires_owner = node.get("node_type") in ENTERPRISE_ACTION_TYPES
    has_owner = bool(node.get("owner_id"))
    has_due_date = bool(node.get("due_date"))

    if has_owner and has_due_date:
        return 100
    if has_owner:
        return 75 if requires_owner else 90
    if has_due_date:
        return 45 if requires_owner else 70
    return 15 if requires_owner else 60


def _enterprise_reasons(node: dict[str, Any], scores: dict[str, int]) -> list[str]:
    reasons = []
    if scores["business_impact"] >= 80 and scores["owner_clarity"] < 75:
        reasons.append("High-impact item needs clearer ownership")
    if scores["source_coverage"] < 60:
        reasons.append("Weak source coverage")
    if scores["risk_severity"] >= 75:
        reasons.append("High risk severity")
    if scores["implementation_effort"] < 50:
        reasons.append("High implementation effort")
    if scores["owner_clarity"] < 60:
        reasons.append("Owner or due date missing")
    if node.get("status") == "needs_review" or node.get("node_type") == "needs_review":
        reasons.append("Needs review before handoff")
    return reasons


def _enterprise_value(node: dict[str, Any], key: str) -> Any:
    metadata = node.get("metadata", {})
    enterprise_fields = (
        metadata.get("enterprise_fields", {}) if isinstance(metadata, dict) else {}
    )
    aliases = {
        "business_impact": ("business_impact", "impact", "value_score"),
        "implementation_effort": (
            "implementation_effort",
            "effort",
            "complexity",
        ),
        "risk_severity": ("risk_severity", "severity", "risk_level"),
    }

    for alias in aliases[key]:
        value = node.get(alias)
        if value not in (None, ""):
            return value
        value = enterprise_fields.get(alias) if isinstance(enterprise_fields, dict) else None
        if value not in (None, ""):
            return value
        value = metadata.get(alias) if isinstance(metadata, dict) else None
        if value not in (None, ""):
            return value
    return ""


def _score_from_signal(value: Any, fallback: int | None = 0) -> int | None:
    normalized = _normalize_signal(value)
    if normalized in SCORE_BY_SIGNAL:
        return SCORE_BY_SIGNAL[normalized]

    parsed = _parse_number(value)
    if parsed is not None:
        return round(max(0, min(100, parsed if parsed > 1 else parsed * 100)))

    return fallback


def _parse_confidence(value: Any) -> float | None:
    parsed = _parse_number(value, allow_percent=True)
    if parsed is None:
        return None
    return parsed / 100 if parsed > 1 else parsed


def _parse_number(value: Any, allow_percent: bool = False) -> float | None:
    if value in (None, ""):
        return None
    is_percent = False
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        is_percent = allow_percent and cleaned.endswith("%")
        value = cleaned.rstrip("%").strip()
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed / 100 if is_percent else parsed


def _normalize_signal(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", "-").replace(" ", "-")


def _readiness_band(score: int) -> str:
    if score >= 80:
        return "enterprise_ready"
    if score >= 60:
        return "watchlist"
    return "not_ready"


def _summary_label(score: int) -> str:
    if score >= 80:
        return "Enterprise ready"
    if score >= 60:
        return "Watchlist"
    return "Not ready"
