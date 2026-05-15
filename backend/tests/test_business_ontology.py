import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.roles import get_prompt_profile
from ai.schemas import KNOWLEDGE_GRAPH_EDGE_SCHEMA
from graph.ai_contract import validate_knowledge_graph_relationship_edge
from graph.business_ontology import (
    BUSINESS_ENTITY_TYPES,
    BUSINESS_ONTOLOGY_VERSION,
    BUSINESS_RELATIONSHIP_TYPES,
    business_ontology_registry,
)


def test_business_ontology_registry_contains_enterprise_entity_and_relationship_types():
    expected_entities = {
        "business_unit",
        "capability",
        "process",
        "system",
        "application",
        "software_vendor",
        "software_license",
        "software_use_case",
        "integration",
        "role",
        "team",
        "owner",
        "KPI",
        "risk",
        "control",
        "project",
        "decision",
        "dependency",
        "cost",
        "customer_segment",
    }
    expected_relationships = {
        "approved_for",
        "owns",
        "supports",
        "depends_on",
        "duplicates",
        "conflicts_with",
        "implements",
        "measures",
        "blocks",
        "creates_risk_for",
        "requires_approval_from",
        "used_by",
        "funded_by",
        "has_license_type",
        "integrates_with",
        "overlaps_on",
        "replaced_by",
        "replaces",
        "requested_through",
    }

    registry = business_ontology_registry()

    assert registry["version"] == BUSINESS_ONTOLOGY_VERSION
    assert expected_entities <= BUSINESS_ENTITY_TYPES
    assert expected_relationships <= BUSINESS_RELATIONSHIP_TYPES
    assert set(registry["entity_types"]) == BUSINESS_ENTITY_TYPES
    assert set(registry["relationship_types"]) == BUSINESS_RELATIONSHIP_TYPES


def test_knowledge_graph_schema_uses_business_relationship_types():
    relationship_enum = set(
        KNOWLEDGE_GRAPH_EDGE_SCHEMA["properties"]["relationship_type"]["enum"]
    )

    assert BUSINESS_RELATIONSHIP_TYPES <= relationship_enum


def test_knowledge_graph_contract_accepts_business_relationship_edge():
    edge = validate_knowledge_graph_relationship_edge(
        {
            "source_node_id": "project-1",
            "target_node_id": "owner-1",
            "relationship_type": "requires_approval_from",
            "source_signal": "explicit_text",
            "confidence": 0.91,
            "rationale": "The project requires approval from the named owner.",
            "source_refs": [{"document_id": "doc-1"}],
            "assumptions": [],
            "review_state": "reviewed",
        }
    )

    assert edge["relationship_type"] == "requires_approval_from"
    assert edge["review_state"] == "reviewed"


def test_knowledge_graph_contract_accepts_software_inventory_overlap_edge():
    edge = validate_knowledge_graph_relationship_edge(
        {
            "source_node_id": "bluebeam",
            "target_node_id": "pdf-markup",
            "relationship_type": "overlaps_on",
            "source_signal": "shared_source",
            "confidence": 0.78,
            "rationale": "Bluebeam and Acrobat are both source-listed for PDF markup workflows.",
            "source_refs": [{"document_id": "software-inventory"}],
            "assumptions": [],
            "review_state": "needs_review",
        }
    )

    assert edge["relationship_type"] == "overlaps_on"
    assert edge["review_state"] == "needs_review"


def test_enterprise_business_architect_prompt_profile_is_registered():
    profile = get_prompt_profile("Enterprise Business Architect")

    assert profile["role_id"] == "enterprise_business_architect"
    assert profile["default_output_shape"] == "knowledge_graph"
    assert "enterprise business ontology" in profile["system_instructions"]
