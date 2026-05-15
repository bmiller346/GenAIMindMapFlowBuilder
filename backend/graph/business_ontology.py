from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


BUSINESS_ONTOLOGY_VERSION = "1"


@dataclass(frozen=True, slots=True)
class BusinessEntityType:
    id: str
    label: str
    description: str

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class BusinessRelationshipType:
    id: str
    label: str
    description: str
    directed: bool = True

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


BUSINESS_ENTITY_REGISTRY: dict[str, BusinessEntityType] = {
    "business_unit": BusinessEntityType(
        "business_unit",
        "Business Unit",
        "An organizational unit accountable for a business scope, outcome, budget, or operating area.",
    ),
    "capability": BusinessEntityType(
        "capability",
        "Capability",
        "A business ability or durable competency that enables outcomes across teams, processes, or systems.",
    ),
    "process": BusinessEntityType(
        "process",
        "Process",
        "A repeatable sequence of business activities, handoffs, or decisions.",
    ),
    "system": BusinessEntityType(
        "system",
        "System",
        "A technical or operational system that supports business work.",
    ),
    "application": BusinessEntityType(
        "application",
        "Application",
        "A software application, product, or service used by the business.",
    ),
    "software_vendor": BusinessEntityType(
        "software_vendor",
        "Software Vendor",
        "A vendor, publisher, reseller, or platform provider for software used by the business.",
    ),
    "software_license": BusinessEntityType(
        "software_license",
        "Software License",
        "A license, subscription, entitlement, plan, seat allocation, or cost model for software inventory review.",
    ),
    "software_use_case": BusinessEntityType(
        "software_use_case",
        "Software Use Case",
        "A business use case, workflow need, user group, or job-to-be-done supported by software.",
    ),
    "integration": BusinessEntityType(
        "integration",
        "Integration",
        "A data, workflow, API, SSO, automation, or operational integration between systems or applications.",
    ),
    "role": BusinessEntityType(
        "role",
        "Role",
        "A job role, persona, or responsibility profile involved in business work.",
    ),
    "team": BusinessEntityType(
        "team",
        "Team",
        "A group responsible for delivery, operation, support, or governance.",
    ),
    "owner": BusinessEntityType(
        "owner",
        "Owner",
        "A person or accountable party with ownership responsibility.",
    ),
    "KPI": BusinessEntityType(
        "KPI",
        "KPI",
        "A key performance indicator used to measure business performance or outcomes.",
    ),
    "risk": BusinessEntityType(
        "risk",
        "Risk",
        "A business, delivery, compliance, operational, or technical risk.",
    ),
    "control": BusinessEntityType(
        "control",
        "Control",
        "A safeguard, policy, approval, audit, or mitigation control.",
    ),
    "project": BusinessEntityType(
        "project",
        "Project",
        "A planned initiative, program, or body of work with delivery outcomes.",
    ),
    "decision": BusinessEntityType(
        "decision",
        "Decision",
        "A business decision, gate, approval point, or choice requiring accountability.",
    ),
    "dependency": BusinessEntityType(
        "dependency",
        "Dependency",
        "A dependency, prerequisite, blocker, or external input needed for progress.",
    ),
    "cost": BusinessEntityType(
        "cost",
        "Cost",
        "A cost, budget, spend category, financial impact, or investment signal.",
    ),
    "customer_segment": BusinessEntityType(
        "customer_segment",
        "Customer Segment",
        "A market, customer, user, or stakeholder segment served by the business.",
    ),
}


BUSINESS_RELATIONSHIP_REGISTRY: dict[str, BusinessRelationshipType] = {
    "owns": BusinessRelationshipType(
        "owns",
        "Owns",
        "The source entity owns or is accountable for the target entity.",
    ),
    "supports": BusinessRelationshipType(
        "supports",
        "Supports",
        "The source entity supports, enables, or contributes to the target entity.",
    ),
    "depends_on": BusinessRelationshipType(
        "depends_on",
        "Depends On",
        "The source entity depends on the target entity.",
    ),
    "duplicates": BusinessRelationshipType(
        "duplicates",
        "Duplicates",
        "The source entity duplicates, overlaps with, or repeats the target entity.",
    ),
    "conflicts_with": BusinessRelationshipType(
        "conflicts_with",
        "Conflicts With",
        "The source entity conflicts with or creates tension against the target entity.",
    ),
    "implements": BusinessRelationshipType(
        "implements",
        "Implements",
        "The source entity implements or realizes the target entity.",
    ),
    "measures": BusinessRelationshipType(
        "measures",
        "Measures",
        "The source entity measures performance, health, progress, or outcome of the target entity.",
    ),
    "blocks": BusinessRelationshipType(
        "blocks",
        "Blocks",
        "The source entity blocks, delays, or prevents progress on the target entity.",
    ),
    "creates_risk_for": BusinessRelationshipType(
        "creates_risk_for",
        "Creates Risk For",
        "The source entity creates risk exposure for the target entity.",
    ),
    "requires_approval_from": BusinessRelationshipType(
        "requires_approval_from",
        "Requires Approval From",
        "The source entity requires approval, signoff, or authorization from the target entity.",
    ),
    "used_by": BusinessRelationshipType(
        "used_by",
        "Used By",
        "The source entity is used by the target entity.",
    ),
    "funded_by": BusinessRelationshipType(
        "funded_by",
        "Funded By",
        "The source entity is funded by the target entity.",
    ),
    "approved_for": BusinessRelationshipType(
        "approved_for",
        "Approved For",
        "The source application, system, or tool is approved for the target use case, workflow, team, or capability.",
    ),
    "has_license_type": BusinessRelationshipType(
        "has_license_type",
        "Has License Type",
        "The source application, system, or tool has the target license, entitlement, or cost model.",
    ),
    "requested_through": BusinessRelationshipType(
        "requested_through",
        "Requested Through",
        "The source application, system, tool, or access request is requested through the target service or process.",
    ),
    "replaces": BusinessRelationshipType(
        "replaces",
        "Replaces",
        "The source application, system, tool, or process replaces the target entity.",
    ),
    "replaced_by": BusinessRelationshipType(
        "replaced_by",
        "Replaced By",
        "The source application, system, tool, or process is replaced by the target entity.",
    ),
    "overlaps_on": BusinessRelationshipType(
        "overlaps_on",
        "Overlaps On",
        "The source entity potentially overlaps with the target capability, workflow, user group, integration, or use case and needs review.",
    ),
    "integrates_with": BusinessRelationshipType(
        "integrates_with",
        "Integrates With",
        "The source application, system, tool, or process integrates with the target entity.",
    ),
}


BUSINESS_ENTITY_TYPES = set(BUSINESS_ENTITY_REGISTRY)
BUSINESS_RELATIONSHIP_TYPES = set(BUSINESS_RELATIONSHIP_REGISTRY)

LEGACY_KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES = {
    "contains",
    "references",
    "similar_to",
    "derived_from",
    "contradicts",
    "owned_by",
    "requires_review_by",
    "related_to",
}

KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES = (
    LEGACY_KNOWLEDGE_GRAPH_RELATIONSHIP_TYPES | BUSINESS_RELATIONSHIP_TYPES
)


def business_ontology_registry() -> dict[str, Any]:
    return {
        "version": BUSINESS_ONTOLOGY_VERSION,
        "entity_types": {
            entity_id: definition.model_dump()
            for entity_id, definition in BUSINESS_ENTITY_REGISTRY.items()
        },
        "relationship_types": {
            relationship_id: definition.model_dump()
            for relationship_id, definition in BUSINESS_RELATIONSHIP_REGISTRY.items()
        },
    }


def is_business_entity_type(value: str | None) -> bool:
    return value in BUSINESS_ENTITY_TYPES


def is_business_relationship_type(value: str | None) -> bool:
    return value in BUSINESS_RELATIONSHIP_TYPES


BUSINESS_ONTOLOGY_CONTRACT = f"""
Canonical TraceSpace Enterprise Business Ontology:
- Registry version: {BUSINESS_ONTOLOGY_VERSION}.
- Entity types: {", ".join(sorted(BUSINESS_ENTITY_TYPES))}.
- Relationship types: {", ".join(sorted(BUSINESS_RELATIONSHIP_TYPES))}.
- Prefer these entity types for enterprise business architecture, operating model, transformation, governance, risk, cost, ownership, dependency, customer, software inventory, application rationalization, and measurement maps.
- Use relationship_type values exactly as registered. Preserve directionality: source_node_id is the subject and target_node_id is the object.
- Do not invent new enterprise business relationship_type values when one of the registered types applies.
- Include metadata.business_ontology_version as "{BUSINESS_ONTOLOGY_VERSION}" when returning ontology metadata.
"""
