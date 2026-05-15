from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from itertools import combinations
from typing import Any


POSITIVE_WEIGHTS = {
    "shared_category": 0.13,
    "shared_business_function": 0.16,
    "shared_workflow": 0.17,
    "shared_user_group": 0.12,
    "shared_integration": 0.1,
    "shared_vendor": 0.05,
    "shared_license_type": 0.06,
    "paid_license_overlap": 0.09,
    "usage_overlap": 0.12,
}
STANDARD_EXCEPTION_PENALTY = 0.18
INACTIVE_STATUS_PENALTY = 0.25
REPLACEMENT_STATUS_PENALTY = 0.16
DEFINITIVE_DUPLICATE_THRESHOLD = 0.9
STRONG_EVIDENCE_FACTOR_COUNT = 4

STANDARD_SIGNALS = {"standard", "approved", "preferred", "corporate-standard"}
EXCEPTION_SIGNALS = {"exception", "exemption", "non-standard", "nonstandard"}
INACTIVE_STATUSES = {"retired", "rejected", "deprecated", "decommissioned"}
REPLACEMENT_STATUSES = {"replaced", "replacing", "superseded", "replacement"}
PAID_LICENSE_SIGNALS = {
    "paid",
    "commercial",
    "subscription",
    "enterprise",
    "per-seat",
    "seat",
    "licensed",
}
FREE_LICENSE_SIGNALS = {"free", "open-source", "trial", "community"}


@dataclass(frozen=True, slots=True)
class ScoreFactor:
    factor: str
    weight: float
    evidence: str
    item_ids: list[str]

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


def score_software_overlap_candidate(
    inventory_items: list[dict[str, Any]],
    candidate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score a software overlap candidate from inventory records and candidate hints.

    The helper is pure and deterministic. It does not decide that applications are
    duplicates; it returns transparent evidence for owner review.
    """

    candidate = candidate or {}
    items = _select_candidate_items(inventory_items, candidate)
    factors = _positive_factors(items, candidate)
    factors.extend(_penalty_factors(items))

    score = round(max(0.0, min(1.0, sum(factor.weight for factor in factors))), 3)
    positive_evidence_count = sum(1 for factor in factors if factor.weight > 0)
    confidence_band = _confidence_band(score, positive_evidence_count, items)
    duplicate_assessment = _duplicate_assessment(score, positive_evidence_count)

    return {
        "application_ids": [_item_id(item) for item in items],
        "score": score,
        "confidence_band": confidence_band,
        "duplicate_assessment": duplicate_assessment,
        "is_definitive_duplicate": False,
        "scoring_factors": [factor.model_dump() for factor in factors],
    }


def score_software_overlap_pairs(
    inventory_items: list[dict[str, Any]],
    candidates: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Score explicit candidates or every pair in the supplied inventory."""

    if candidates:
        return [
            {
                **candidate,
                **score_software_overlap_candidate(inventory_items, candidate),
            }
            for candidate in candidates
        ]

    scored = []
    for left, right in combinations(inventory_items, 2):
        result = score_software_overlap_candidate([left, right])
        scored.append(
            {
                "id": f"overlap_{_token(_item_id(left))}_{_token(_item_id(right))}",
                "title": f"{_item_name(left)} and {_item_name(right)}",
                **result,
            }
        )
    return scored


def enrich_software_overlap_report(data: dict[str, Any]) -> dict[str, Any]:
    """Fill software overlap candidates with deterministic scores and factors."""

    enriched = {
        **data,
        "inventory_items": list(data.get("inventory_items", []))
        if isinstance(data.get("inventory_items", []), list)
        else [],
    }
    candidates = data.get("overlap_candidates", [])
    if not isinstance(candidates, list):
        return enriched

    scored_candidates = score_software_overlap_pairs(
        enriched["inventory_items"],
        [candidate for candidate in candidates if isinstance(candidate, dict)],
    )
    by_id = {
        str(candidate.get("id") or index): candidate
        for index, candidate in enumerate(scored_candidates)
    }
    next_candidates = []
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            next_candidates.append(candidate)
            continue
        scored = by_id.get(str(candidate.get("id") or index), {})
        score_factors = [
            _artifact_score_factor(factor, enriched["inventory_items"])
            for factor in scored.get("scoring_factors", [])
            if isinstance(factor, dict)
        ]
        next_candidates.append(
            {
                **candidate,
                "application_ids": scored.get("application_ids") or candidate.get("application_ids", []),
                "score": scored.get("score", candidate.get("score")),
                "confidence": scored.get("confidence_band", candidate.get("confidence")),
                "scoring_factors": score_factors or candidate.get("scoring_factors", []),
                "recommendation": candidate.get("recommendation")
                or _review_recommendation(str(scored.get("duplicate_assessment") or "")),
                "review_state": "needs_review",
            }
        )
    enriched["overlap_candidates"] = next_candidates
    return enriched


def _artifact_score_factor(
    factor: dict[str, Any],
    inventory_items: list[dict[str, Any]],
) -> dict[str, Any]:
    item_ids = {str(item_id) for item_id in factor.get("item_ids", [])}
    source_refs = []
    for item in inventory_items:
        item_id = _item_id(item) if isinstance(item, dict) else ""
        if item_id not in item_ids:
            continue
        refs = item.get("source_refs", [])
        if isinstance(refs, list):
            source_refs.extend(ref for ref in refs if isinstance(ref, dict))
    return {
        "factor": str(factor.get("factor") or ""),
        "weight": factor.get("weight", 0),
        "evidence": str(factor.get("evidence") or ""),
        "source_refs": source_refs,
        "assumptions": [] if source_refs else ["Deterministic score factor derived from inventory fields; source review required."],
    }


def _review_recommendation(assessment: str) -> str:
    if assessment == "strong_duplicate_candidate_needs_review":
        return "Potential high-confidence overlap: confirm the standard tool, exceptions, license utilization, and owner decision."
    if assessment == "strong_overlap_candidate":
        return "Potential overlap: review standard tool guidance, usage, licensing, and exceptions with owners."
    if assessment == "moderate_overlap_candidate":
        return "Possible overlap: compare workflow evidence and confirm whether both tools remain needed."
    return "Possible overlap: gather stronger source evidence before rationalization."


def _positive_factors(
    items: list[dict[str, Any]],
    candidate: dict[str, Any],
) -> list[ScoreFactor]:
    factors = []
    factor_specs = [
        ("shared_category", "category", ("category", "categories", "capability")),
        (
            "shared_business_function",
            "business function",
            ("business_function", "business_functions", "function", "capability"),
        ),
        ("shared_workflow", "workflow", ("workflow", "workflows", "process")),
        ("shared_user_group", "user group", ("user_group", "user_groups", "audience")),
        (
            "shared_integration",
            "integration",
            ("integration", "integrations", "integrates_with"),
        ),
        ("shared_vendor", "vendor", ("vendor",)),
        ("shared_license_type", "license type", ("license_type",)),
    ]
    for factor, label, aliases in factor_specs:
        shared_values = _shared_values(items, aliases)
        candidate_values = _candidate_values(candidate, aliases, label)
        evidence_values = sorted(shared_values | candidate_values)
        if not evidence_values:
            continue
        factors.append(
            ScoreFactor(
                factor=factor,
                weight=POSITIVE_WEIGHTS[factor],
                evidence=f"Shared {label}: {', '.join(evidence_values)}",
                item_ids=[_item_id(item) for item in items],
            )
        )

    paid_count = sum(1 for item in items if _has_paid_license(item))
    if paid_count >= 2:
        factors.append(
            ScoreFactor(
                factor="paid_license_overlap",
                weight=POSITIVE_WEIGHTS["paid_license_overlap"],
                evidence=f"{paid_count} applications show paid license or spend signals",
                item_ids=[_item_id(item) for item in items],
            )
        )

    usage_factor = _usage_factor(items, candidate)
    if usage_factor:
        factors.append(usage_factor)

    return factors


def _penalty_factors(items: list[dict[str, Any]]) -> list[ScoreFactor]:
    factors = []
    governance_signals = {_governance_signal(item) for item in items}
    if "standard" in governance_signals and "exception" in governance_signals:
        factors.append(
            ScoreFactor(
                factor="standard_exception_distinction",
                weight=-STANDARD_EXCEPTION_PENALTY,
                evidence="One application is marked as a standard and another as an exception",
                item_ids=[_item_id(item) for item in items],
            )
        )

    statuses = {_normalize_signal(item.get("status")) for item in items}
    inactive = sorted(statuses & INACTIVE_STATUSES)
    if inactive:
        factors.append(
            ScoreFactor(
                factor="inactive_status",
                weight=-INACTIVE_STATUS_PENALTY,
                evidence=f"At least one application status lowers overlap urgency: {', '.join(inactive)}",
                item_ids=[_item_id(item) for item in items],
            )
        )

    replacement = sorted(statuses & REPLACEMENT_STATUSES)
    if replacement:
        factors.append(
            ScoreFactor(
                factor="replacement_status",
                weight=-REPLACEMENT_STATUS_PENALTY,
                evidence=f"Replacement status suggests lifecycle sequencing: {', '.join(replacement)}",
                item_ids=[_item_id(item) for item in items],
            )
        )
    return factors


def _select_candidate_items(
    inventory_items: list[dict[str, Any]],
    candidate: dict[str, Any],
) -> list[dict[str, Any]]:
    requested_ids = {
        str(value)
        for value in candidate.get("application_ids", [])
        if value not in (None, "")
    }
    if not requested_ids:
        return [item for item in inventory_items if isinstance(item, dict)]

    selected = []
    for item in inventory_items:
        if not isinstance(item, dict):
            continue
        identifiers = {
            str(value)
            for value in (item.get("id"), item.get("node_id"), item.get("name"))
            if value not in (None, "")
        }
        if identifiers & requested_ids:
            selected.append(item)
    return selected


def _shared_values(items: list[dict[str, Any]], aliases: tuple[str, ...]) -> set[str]:
    value_sets = [_values_for_aliases(item, aliases) for item in items]
    populated = [values for values in value_sets if values]
    if len(populated) < 2:
        return set()
    shared = set.intersection(*populated)
    return {_display_value(value) for value in shared}


def _candidate_values(
    candidate: dict[str, Any],
    aliases: tuple[str, ...],
    dimension_label: str,
) -> set[str]:
    values = _values_for_aliases(candidate, aliases)
    dimensions = _as_list(candidate.get("overlap_dimensions"))
    for dimension in dimensions:
        if dimension_label in _normalize_signal(dimension).replace("-", " "):
            values.add(_normalize_value(dimension))
    return {_display_value(value) for value in values}


def _values_for_aliases(payload: dict[str, Any], aliases: tuple[str, ...]) -> set[str]:
    values: set[str] = set()
    metadata = payload.get("metadata", {}) if isinstance(payload.get("metadata"), dict) else {}
    overlap = (
        payload.get("overlap", {}) if isinstance(payload.get("overlap"), dict) else {}
    )
    for alias in aliases:
        values.update(_normalized_list(payload.get(alias)))
        values.update(_normalized_list(metadata.get(alias)))
        values.update(_normalized_list(overlap.get(alias)))
    return {value for value in values if value}


def _usage_factor(
    items: list[dict[str, Any]],
    candidate: dict[str, Any],
) -> ScoreFactor | None:
    candidate_usage = _values_for_aliases(
        candidate,
        ("usage", "usage_signal", "usage_signals", "user_count"),
    )
    usage_signals = [
        _usage_signal(item)
        for item in items
        if _usage_signal(item) not in {"", "unknown", "none"}
    ]
    if len(usage_signals) >= 2 or candidate_usage:
        evidence = ", ".join(sorted(set(usage_signals) | candidate_usage))
        return ScoreFactor(
            factor="usage_overlap",
            weight=POSITIVE_WEIGHTS["usage_overlap"],
            evidence=f"Multiple applications show usage signals: {evidence}",
            item_ids=[_item_id(item) for item in items],
        )
    return None


def _usage_signal(item: dict[str, Any]) -> str:
    explicit = _first_value(item, ("usage", "usage_signal", "usage_level"))
    if explicit:
        return _display_value(_normalize_value(explicit))
    user_count = _parse_number(item.get("user_count"))
    if user_count is None:
        return ""
    if user_count >= 1000:
        return "high usage"
    if user_count >= 100:
        return "medium usage"
    if user_count > 0:
        return "low usage"
    return "none"


def _has_paid_license(item: dict[str, Any]) -> bool:
    annual_cost = _parse_number(item.get("annual_cost"))
    if annual_cost and annual_cost > 0:
        return True
    license_type = _normalize_signal(item.get("license_type"))
    if license_type in FREE_LICENSE_SIGNALS:
        return False
    return license_type in PAID_LICENSE_SIGNALS


def _governance_signal(item: dict[str, Any]) -> str:
    values = {
        _normalize_signal(value)
        for value in (
            item.get("standard_status"),
            item.get("approval_status"),
            item.get("governance_status"),
            item.get("status"),
        )
        if value not in (None, "")
    }
    metadata = item.get("metadata", {}) if isinstance(item.get("metadata"), dict) else {}
    values.update(
        _normalize_signal(value)
        for value in (
            metadata.get("standard_status"),
            metadata.get("approval_status"),
            metadata.get("governance_status"),
        )
        if value not in (None, "")
    )
    if values & STANDARD_SIGNALS:
        return "standard"
    if values & EXCEPTION_SIGNALS:
        return "exception"
    return ""


def _confidence_band(score: float, positive_evidence_count: int, items: list[dict[str, Any]]) -> str:
    if len(items) < 2:
        return "possible"
    if score >= 0.72 and positive_evidence_count >= 3:
        return "high"
    if score >= 0.42 and positive_evidence_count >= 2:
        return "medium"
    return "possible"


def _duplicate_assessment(score: float, positive_evidence_count: int) -> str:
    if score >= DEFINITIVE_DUPLICATE_THRESHOLD and positive_evidence_count >= STRONG_EVIDENCE_FACTOR_COUNT:
        return "strong_duplicate_candidate_needs_review"
    if score >= 0.72:
        return "strong_overlap_candidate"
    if score >= 0.42:
        return "moderate_overlap_candidate"
    return "possible_overlap_candidate"


def _normalized_list(value: Any) -> set[str]:
    return {_normalize_value(item) for item in _as_list(value) if _normalize_value(item)}


def _as_list(value: Any) -> list[Any]:
    if value in (None, ""):
        return []
    if isinstance(value, list | tuple | set):
        return list(value)
    return [value]


def _first_value(payload: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    metadata = payload.get("metadata", {}) if isinstance(payload.get("metadata"), dict) else {}
    for alias in aliases:
        value = payload.get(alias)
        if value not in (None, ""):
            return value
        value = metadata.get(alias)
        if value not in (None, ""):
            return value
    return ""


def _item_id(item: dict[str, Any]) -> str:
    return str(item.get("id") or item.get("node_id") or item.get("name") or "")


def _item_name(item: dict[str, Any]) -> str:
    return str(item.get("name") or item.get("title") or _item_id(item) or "Application")


def _display_value(value: str) -> str:
    return value.replace("-", " ")


def _normalize_value(value: Any) -> str:
    return _normalize_signal(value).strip("-")


def _normalize_signal(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def _parse_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value).strip())
    return token.strip("-") or "item"
