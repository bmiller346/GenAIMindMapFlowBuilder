import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph.software_overlap_scoring import (
    score_software_overlap_candidate,
    score_software_overlap_pairs,
)


def test_scores_high_overlap_with_transparent_factors():
    inventory = [
        {
            "id": "app-a",
            "name": "Approval Hub",
            "category": "Workflow Automation",
            "business_function": "Approval Management",
            "workflow": ["capital approval", "policy exception"],
            "user_group": ["finance managers"],
            "integration": ["ServiceNow"],
            "vendor": "Contoso",
            "license_type": "enterprise",
            "annual_cost": 125000,
            "user_count": 1200,
            "status": "approved",
        },
        {
            "id": "app-b",
            "name": "Workflow Desk",
            "category": "Workflow Automation",
            "business_function": "Approval Management",
            "workflow": ["capital approval"],
            "user_group": ["finance managers", "procurement"],
            "integration": ["ServiceNow"],
            "vendor": "Fabrikam",
            "license_type": "enterprise",
            "annual_cost": "48000",
            "user_count": 700,
            "status": "approved",
        },
    ]

    result = score_software_overlap_candidate(
        inventory,
        {"application_ids": ["app-a", "app-b"]},
    )

    assert result["score"] == 0.95
    assert result["confidence_band"] == "high"
    assert result["is_definitive_duplicate"] is False
    assert result["duplicate_assessment"] == "strong_duplicate_candidate_needs_review"

    factors = {factor["factor"]: factor for factor in result["scoring_factors"]}
    assert set(factors) >= {
        "shared_category",
        "shared_business_function",
        "shared_workflow",
        "shared_user_group",
        "shared_integration",
        "shared_license_type",
        "paid_license_overlap",
        "usage_overlap",
    }
    assert factors["shared_workflow"]["weight"] == 0.17
    assert "capital approval" in factors["shared_workflow"]["evidence"]


def test_standard_exception_and_inactive_status_lower_score():
    inventory = [
        {
            "id": "standard-app",
            "name": "Approved CRM",
            "category": "CRM",
            "business_function": "Customer Management",
            "workflow": "account planning",
            "standard_status": "standard",
            "license_type": "subscription",
            "annual_cost": 80000,
            "user_count": 400,
            "status": "approved",
        },
        {
            "id": "exception-app",
            "name": "Legacy CRM",
            "category": "CRM",
            "business_function": "Customer Management",
            "workflow": "account planning",
            "standard_status": "exception",
            "license_type": "subscription",
            "annual_cost": 25000,
            "user_count": 120,
            "status": "retired",
        },
    ]

    result = score_software_overlap_candidate(inventory)

    assert result["score"] == 0.3
    assert result["confidence_band"] == "possible"
    factors = {factor["factor"]: factor for factor in result["scoring_factors"]}
    assert factors["standard_exception_distinction"]["weight"] == -0.18
    assert factors["inactive_status"]["weight"] == -0.25
    assert result["duplicate_assessment"] == "possible_overlap_candidate"


def test_candidate_overlap_dimensions_can_supply_evidence_for_sparse_items():
    inventory = [
        {"id": "app-a", "name": "Tool A", "license_type": "free", "status": "active"},
        {"id": "app-b", "name": "Tool B", "license_type": "free", "status": "active"},
    ]

    result = score_software_overlap_candidate(
        inventory,
        {
            "application_ids": ["app-a", "app-b"],
            "overlap_dimensions": [
                "workflow: onboarding request routing",
                "user group: HR coordinators",
            ],
        },
    )

    assert result["score"] == 0.35
    assert result["confidence_band"] == "possible"
    factors = {factor["factor"]: factor for factor in result["scoring_factors"]}
    assert "shared_workflow" in factors
    assert "shared_user_group" in factors
    assert "paid_license_overlap" not in factors


def test_scores_explicit_candidates_or_all_pairs_deterministically():
    inventory = [
        {"id": "a", "category": "analytics", "workflow": "forecasting"},
        {"id": "b", "category": "analytics", "workflow": "forecasting"},
        {"id": "c", "category": "security", "workflow": "access review"},
    ]

    explicit = score_software_overlap_pairs(
        inventory,
        [{"id": "candidate-ab", "application_ids": ["a", "b"]}],
    )
    all_pairs = score_software_overlap_pairs(inventory)

    assert explicit[0]["id"] == "candidate-ab"
    assert explicit[0]["application_ids"] == ["a", "b"]
    assert explicit[0]["score"] == 0.3
    assert [pair["id"] for pair in all_pairs] == [
        "overlap_a_b",
        "overlap_a_c",
        "overlap_b_c",
    ]
