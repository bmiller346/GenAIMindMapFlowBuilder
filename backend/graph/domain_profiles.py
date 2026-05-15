from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass
from typing import Any


DOMAIN_PROFILE_REGISTRY_VERSION = "1"


@dataclass(frozen=True, slots=True)
class DomainArtifactType:
    id: str
    label: str
    description: str

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class DomainRelationshipType:
    id: str
    label: str
    description: str
    directed: bool = True

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class DomainPrompt:
    id: str
    label: str
    prompt: str

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class DomainOutputTemplate:
    id: str
    label: str
    description: str
    required_sections: tuple[str, ...]
    node_types: tuple[str, ...]
    relationship_types: tuple[str, ...]
    metadata: dict[str, Any]

    def model_dump(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["required_sections"] = list(self.required_sections)
        payload["node_types"] = list(self.node_types)
        payload["relationship_types"] = list(self.relationship_types)
        payload["metadata"] = deepcopy(self.metadata)
        return payload


@dataclass(frozen=True, slots=True)
class DomainProfile:
    id: str
    label: str
    description: str
    expected_artifact_types: tuple[DomainArtifactType, ...]
    common_relationship_types: tuple[DomainRelationshipType, ...]
    default_prompts: tuple[DomainPrompt, ...]
    review_checklist: tuple[str, ...]
    output_templates: tuple[DomainOutputTemplate, ...]

    def model_dump(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "expected_artifact_types": [
                artifact.model_dump() for artifact in self.expected_artifact_types
            ],
            "common_relationship_types": [
                relationship.model_dump()
                for relationship in self.common_relationship_types
            ],
            "default_prompts": [prompt.model_dump() for prompt in self.default_prompts],
            "review_checklist": list(self.review_checklist),
            "output_templates": [
                template.model_dump() for template in self.output_templates
            ],
        }


def _artifact(id: str, label: str, description: str) -> DomainArtifactType:
    return DomainArtifactType(id=id, label=label, description=description)


def _relationship(
    id: str,
    label: str,
    description: str,
    *,
    directed: bool = True,
) -> DomainRelationshipType:
    return DomainRelationshipType(
        id=id,
        label=label,
        description=description,
        directed=directed,
    )


def _prompt(id: str, label: str, prompt: str) -> DomainPrompt:
    return DomainPrompt(id=id, label=label, prompt=prompt)


def _template(
    id: str,
    label: str,
    description: str,
    *,
    required_sections: tuple[str, ...],
    node_types: tuple[str, ...],
    relationship_types: tuple[str, ...],
    metadata: dict[str, Any] | None = None,
) -> DomainOutputTemplate:
    return DomainOutputTemplate(
        id=id,
        label=label,
        description=description,
        required_sections=required_sections,
        node_types=node_types,
        relationship_types=relationship_types,
        metadata=metadata or {},
    )


DOMAIN_PROFILE_REGISTRY: dict[str, DomainProfile] = {
    "generic": DomainProfile(
        id="generic",
        label="Generic",
        description="Baseline profile for mixed source sets when no specialized domain is selected.",
        expected_artifact_types=(
            _artifact("concept_map", "Concept Map", "Clustered concepts, facts, questions, and supporting evidence."),
            _artifact("summary", "Summary", "Concise synthesis of source-backed themes and takeaways."),
            _artifact("decision_log", "Decision Log", "Decisions, rationale, owners, and unresolved questions."),
            _artifact("checklist", "Checklist", "Reviewable actions, criteria, or next steps."),
        ),
        common_relationship_types=(
            _relationship("contains", "Contains", "A parent topic contains a child topic or artifact."),
            _relationship("references", "References", "An item cites, mentions, or depends on source evidence."),
            _relationship("related_to", "Related To", "Items have a meaningful but non-hierarchical connection.", directed=False),
            _relationship("contradicts", "Contradicts", "Items conflict or provide incompatible claims.", directed=False),
            _relationship("depends_on", "Depends On", "Progress or validity depends on another item."),
        ),
        default_prompts=(
            _prompt("extract", "Extract Source Map", "Extract the key source-backed concepts, decisions, risks, questions, and next actions."),
            _prompt("organize", "Organize Themes", "Group related material into a practical TraceSpace map with clear parent-child structure."),
            _prompt("review", "Review Evidence", "Flag unsupported claims, contradictions, stale information, and places needing SME review."),
        ),
        review_checklist=(
            "Every high-confidence claim has source support or is marked as an assumption.",
            "Contradictions and duplicates are represented as reviewable relationships.",
            "Open questions are separated from confirmed facts.",
            "Output nodes use concise, user-facing titles.",
        ),
        output_templates=(
            _template(
                "source_intelligence_map",
                "Source Intelligence Map",
                "General graph output for source-backed concepts and review findings.",
                required_sections=("summary", "nodes", "relationships", "review_items"),
                node_types=("concept", "decision", "risk", "question", "task"),
                relationship_types=("contains", "references", "related_to", "contradicts", "depends_on"),
                metadata={"default_output_shape": "knowledge_graph"},
            ),
        ),
    ),
    "revit_standards": DomainProfile(
        id="revit_standards",
        label="Revit Standards",
        description="Profile for BIM, Revit, modeling standards, families, worksets, deliverables, and governance rules.",
        expected_artifact_types=(
            _artifact("modeling_standard", "Modeling Standard", "A rule or convention governing Revit model production."),
            _artifact("family_standard", "Family Standard", "Requirements for reusable families, parameters, and naming."),
            _artifact("view_standard", "View Standard", "Requirements for views, sheets, annotations, templates, or exports."),
            _artifact("qa_rule", "QA Rule", "Model health or compliance check that can be reviewed or automated."),
            _artifact("deliverable_spec", "Deliverable Spec", "Expected BIM output, format, level of detail, or handoff package."),
        ),
        common_relationship_types=(
            _relationship("requires", "Requires", "The source item requires the target rule, input, or artifact."),
            _relationship("governs", "Governs", "A standard governs a model element, family, view, or deliverable."),
            _relationship("validates", "Validates", "A QA rule validates a standard or deliverable."),
            _relationship("supersedes", "Supersedes", "A newer rule replaces an older rule."),
            _relationship("conflicts_with", "Conflicts With", "Two requirements conflict or need adjudication.", directed=False),
        ),
        default_prompts=(
            _prompt("extract_standards", "Extract Standards", "Extract Revit standards, naming conventions, parameters, QA checks, exceptions, and deliverables."),
            _prompt("find_conflicts", "Find Conflicts", "Identify conflicting, duplicated, obsolete, or underspecified Revit guidance."),
            _prompt("build_qa", "Build QA Checklist", "Turn standards into a source-backed QA checklist with pass criteria and evidence gaps."),
        ),
        review_checklist=(
            "Standards are separated from examples, recommendations, and exceptions.",
            "Version, discipline, model phase, and applicability are captured when available.",
            "Conflicting or obsolete guidance is marked for review.",
            "QA checks include clear pass criteria and source evidence.",
        ),
        output_templates=(
            _template(
                "standards_register",
                "Standards Register",
                "Structured register of Revit standards, applicability, and review status.",
                required_sections=("standards", "applicability", "qa_checks", "exceptions", "review_items"),
                node_types=("standard", "family", "parameter", "view", "sheet", "deliverable", "qa_check"),
                relationship_types=("requires", "governs", "validates", "supersedes", "conflicts_with"),
                metadata={"default_output_shape": "standards_register"},
            ),
        ),
    ),
    "software_inventory": DomainProfile(
        id="software_inventory",
        label="Software Inventory",
        description="Profile for applications, services, vendors, owners, usage, integrations, risk, and rationalization work.",
        expected_artifact_types=(
            _artifact("application_record", "Application Record", "A software product, system, service, or managed tool."),
            _artifact("integration_record", "Integration Record", "Data flow, API, automation, or dependency between systems."),
            _artifact("ownership_record", "Ownership Record", "Business, technical, vendor, or support ownership details."),
            _artifact("risk_record", "Risk Record", "Security, compliance, continuity, licensing, or operational risk."),
            _artifact("rationalization_finding", "Rationalization Finding", "Duplicate, redundant, unsupported, or consolidation opportunity."),
        ),
        common_relationship_types=(
            _relationship("owned_by", "Owned By", "An application or service is owned by a person, team, vendor, or business unit."),
            _relationship("used_by", "Used By", "An application is used by a team, role, process, or capability."),
            _relationship("integrates_with", "Integrates With", "Systems exchange data or operational dependency.", directed=False),
            _relationship("depends_on", "Depends On", "A system depends on another system, vendor, or service."),
            _relationship("duplicates", "Duplicates", "Applications overlap in function, users, or capabilities.", directed=False),
        ),
        default_prompts=(
            _prompt("inventory", "Build Inventory", "Extract applications, owners, vendors, users, criticality, integrations, and evidence gaps."),
            _prompt("rationalize", "Find Rationalization", "Identify duplicates, shadow IT, unsupported tools, and consolidation candidates."),
            _prompt("risk_review", "Review Risk", "Flag security, licensing, support, continuity, and ownership risks with source backing."),
        ),
        review_checklist=(
            "Each application has owner, purpose, users, and source status when available.",
            "Integrations distinguish confirmed data flow from inferred dependency.",
            "Duplicates include rationale and affected business capabilities.",
            "Missing owner, vendor, criticality, or support details are explicit review items.",
        ),
        output_templates=(
            _template(
                "software_inventory_register",
                "Software Inventory Register",
                "Application inventory with ownership, dependencies, risk, and rationalization findings.",
                required_sections=("applications", "owners", "integrations", "risks", "rationalization_findings"),
                node_types=("application", "system", "vendor", "owner", "team", "capability", "risk"),
                relationship_types=("owned_by", "used_by", "integrates_with", "depends_on", "duplicates"),
                metadata={"default_output_shape": "inventory_register"},
            ),
        ),
    ),
    "project_delivery": DomainProfile(
        id="project_delivery",
        label="Project Delivery",
        description="Profile for delivery plans, milestones, scope, decisions, dependencies, risks, and execution tracking.",
        expected_artifact_types=(
            _artifact("milestone", "Milestone", "A dated or sequenced delivery checkpoint."),
            _artifact("deliverable", "Deliverable", "A committed output, artifact, or handoff."),
            _artifact("dependency", "Dependency", "A prerequisite, blocker, or external input needed for delivery."),
            _artifact("decision", "Decision", "A choice, approval, or gate with rationale and owner."),
            _artifact("risk_issue", "Risk / Issue", "A delivery risk, active issue, or mitigation item."),
        ),
        common_relationship_types=(
            _relationship("depends_on", "Depends On", "A deliverable, task, or milestone depends on another item."),
            _relationship("blocks", "Blocks", "A dependency, risk, or issue blocks delivery progress."),
            _relationship("owned_by", "Owned By", "An item is accountable to an owner, team, or role."),
            _relationship("delivers", "Delivers", "A task, team, or phase delivers a target artifact or outcome."),
            _relationship("requires_approval_from", "Requires Approval From", "An item requires approval from a person, role, or governance body."),
        ),
        default_prompts=(
            _prompt("delivery_map", "Create Delivery Map", "Extract scope, milestones, deliverables, dependencies, risks, owners, and decisions."),
            _prompt("readiness", "Assess Readiness", "Assess delivery readiness, blocked work, missing decisions, and unclear ownership."),
            _prompt("next_actions", "Create Next Actions", "Draft source-aware tasks, owner placeholders, and review checkpoints."),
        ),
        review_checklist=(
            "Milestones and deliverables are not mixed with tasks unless source text does so explicitly.",
            "Dependencies identify direction and blocker status.",
            "Risks and issues include impact, mitigation, and owner when available.",
            "Dates, owners, and approvals are source-backed or marked as missing.",
        ),
        output_templates=(
            _template(
                "delivery_plan",
                "Delivery Plan",
                "Graph-ready delivery plan with tasks, milestones, risks, dependencies, and decisions.",
                required_sections=("scope", "milestones", "deliverables", "dependencies", "risks", "decisions", "next_actions"),
                node_types=("project", "phase", "milestone", "deliverable", "task", "dependency", "risk", "decision", "owner"),
                relationship_types=("depends_on", "blocks", "owned_by", "delivers", "requires_approval_from"),
                metadata={"default_output_shape": "roadmap"},
            ),
        ),
    ),
    "sop_process": DomainProfile(
        id="sop_process",
        label="SOP / Process",
        description="Profile for procedures, process maps, handoffs, controls, roles, exceptions, and training-ready SOPs.",
        expected_artifact_types=(
            _artifact("process_step", "Process Step", "A discrete action, handoff, or decision in a workflow."),
            _artifact("role_responsibility", "Role Responsibility", "A role, owner, or participant responsibility."),
            _artifact("control_point", "Control Point", "Approval, quality gate, audit point, or compliance check."),
            _artifact("exception_path", "Exception Path", "Alternate workflow for errors, escalations, or special cases."),
            _artifact("sop_draft", "SOP Draft", "Structured procedure draft suitable for review."),
        ),
        common_relationship_types=(
            _relationship("precedes", "Precedes", "One step occurs before another step."),
            _relationship("triggers", "Triggers", "An event or condition triggers a step or exception path."),
            _relationship("performed_by", "Performed By", "A role, team, or owner performs a step."),
            _relationship("approves", "Approves", "A role or control point approves an item."),
            _relationship("escalates_to", "Escalates To", "An exception, issue, or decision escalates to another role or step."),
        ),
        default_prompts=(
            _prompt("map_process", "Map Process", "Extract workflow steps, decisions, roles, systems, inputs, outputs, and exceptions."),
            _prompt("draft_sop", "Draft SOP", "Convert the process into an SOP outline with purpose, scope, roles, procedure, controls, and exceptions."),
            _prompt("find_gaps", "Find Process Gaps", "Flag missing roles, controls, inputs, outputs, timing, and exception handling."),
        ),
        review_checklist=(
            "Steps are ordered and decision branches are explicit.",
            "Roles are responsibilities, not just names, unless the source only provides names.",
            "Inputs, outputs, controls, and exceptions are captured where available.",
            "Ambiguous handoffs and missing acceptance criteria are review items.",
        ),
        output_templates=(
            _template(
                "sop_outline",
                "SOP Outline",
                "Procedure-ready SOP structure with workflow, roles, controls, and exceptions.",
                required_sections=("purpose", "scope", "roles", "procedure", "controls", "exceptions", "review_items"),
                node_types=("process", "step", "decision", "role", "system", "input", "output", "control", "exception"),
                relationship_types=("precedes", "triggers", "performed_by", "approves", "escalates_to"),
                metadata={"default_output_shape": "sop_outline"},
            ),
        ),
    ),
    "meeting_notes": DomainProfile(
        id="meeting_notes",
        label="Meeting Notes",
        description="Profile for agendas, discussion topics, decisions, action items, risks, parking lot items, and follow-ups.",
        expected_artifact_types=(
            _artifact("agenda_topic", "Agenda Topic", "A planned or discussed topic from the meeting."),
            _artifact("decision", "Decision", "A confirmed decision, approval, or direction set in the meeting."),
            _artifact("action_item", "Action Item", "A follow-up task with owner, due date, or status where available."),
            _artifact("open_question", "Open Question", "A question that remains unresolved after the meeting."),
            _artifact("parking_lot_item", "Parking Lot Item", "A deferred topic or item requiring later review."),
        ),
        common_relationship_types=(
            _relationship("discussed_in", "Discussed In", "An item was discussed in a meeting or agenda topic."),
            _relationship("decided_by", "Decided By", "A decision was made by a person, role, or group."),
            _relationship("assigned_to", "Assigned To", "An action item is assigned to an owner."),
            _relationship("follows_up_on", "Follows Up On", "An action, question, or topic follows up on another item."),
            _relationship("blocks", "Blocks", "An unresolved item blocks a decision, action, or milestone."),
        ),
        default_prompts=(
            _prompt("summarize_meeting", "Summarize Meeting", "Extract decisions, action items, risks, open questions, and parking lot items from notes."),
            _prompt("action_items", "Extract Actions", "Create action items with owner, due date, source quote, and missing details."),
            _prompt("follow_up", "Prepare Follow-up", "Draft follow-up questions and review items for unclear decisions or assignments."),
        ),
        review_checklist=(
            "Decisions are separated from discussion points and suggestions.",
            "Action items include owner, due date, and status when available.",
            "Unresolved questions and parking lot items are preserved.",
            "Attributions are source-backed and uncertain assignments are marked for review.",
        ),
        output_templates=(
            _template(
                "meeting_summary",
                "Meeting Summary",
                "Meeting intelligence output with decisions, actions, questions, and follow-ups.",
                required_sections=("topics", "decisions", "action_items", "open_questions", "parking_lot", "follow_ups"),
                node_types=("meeting", "topic", "decision", "action_item", "question", "risk", "parking_lot"),
                relationship_types=("discussed_in", "decided_by", "assigned_to", "follows_up_on", "blocks"),
                metadata={"default_output_shape": "meeting_summary"},
            ),
        ),
    ),
    "research_review": DomainProfile(
        id="research_review",
        label="Research Review",
        description="Profile for literature, technical research, evidence synthesis, claims, methods, gaps, and recommendations.",
        expected_artifact_types=(
            _artifact("research_claim", "Research Claim", "A claim, finding, or conclusion from source material."),
            _artifact("evidence_record", "Evidence Record", "Evidence supporting or challenging a claim."),
            _artifact("method_note", "Method Note", "Methodology, data source, sample, or analysis limitation."),
            _artifact("gap_finding", "Gap Finding", "Missing evidence, unresolved question, or limitation."),
            _artifact("recommendation", "Recommendation", "Recommended action, interpretation, or next research step."),
        ),
        common_relationship_types=(
            _relationship("supports", "Supports", "Evidence supports a claim, finding, or recommendation."),
            _relationship("challenges", "Challenges", "Evidence weakens, qualifies, or challenges a claim."),
            _relationship("derived_from", "Derived From", "A synthesis or recommendation is derived from source evidence."),
            _relationship("compares_to", "Compares To", "Two claims, methods, or sources are compared.", directed=False),
            _relationship("has_limitation", "Has Limitation", "A claim or method has a stated limitation."),
        ),
        default_prompts=(
            _prompt("extract_claims", "Extract Claims", "Extract source-backed claims, evidence, methods, limitations, and conclusions."),
            _prompt("synthesize", "Synthesize Evidence", "Synthesize agreements, disagreements, evidence strength, and open questions."),
            _prompt("review_quality", "Review Quality", "Assess evidence quality, limitations, unsupported claims, and follow-up research needs."),
        ),
        review_checklist=(
            "Claims are directly tied to evidence and source references.",
            "Methods and limitations are not collapsed into conclusions.",
            "Conflicting evidence is represented explicitly.",
            "Recommendations distinguish source-backed implications from assumptions.",
        ),
        output_templates=(
            _template(
                "evidence_matrix",
                "Evidence Matrix",
                "Research review output that maps claims to evidence, methods, limitations, and gaps.",
                required_sections=("claims", "evidence", "methods", "limitations", "gaps", "recommendations"),
                node_types=("claim", "evidence", "source", "method", "limitation", "gap", "recommendation"),
                relationship_types=("supports", "challenges", "derived_from", "compares_to", "has_limitation"),
                metadata={"default_output_shape": "evidence_matrix"},
            ),
        ),
    ),
    "custom": DomainProfile(
        id="custom",
        label="Custom",
        description="Profile shell for user-defined source-intelligence domains while preserving TraceSpace review rules.",
        expected_artifact_types=(
            _artifact("custom_artifact", "Custom Artifact", "User-defined artifact type requested by the workspace brief."),
            _artifact("review_item", "Review Item", "A source gap, assumption, contradiction, or reviewer question."),
        ),
        common_relationship_types=(
            _relationship("contains", "Contains", "A parent item contains a child item."),
            _relationship("references", "References", "An item references source evidence."),
            _relationship("related_to", "Related To", "Items have a user-defined domain relationship.", directed=False),
            _relationship("depends_on", "Depends On", "An item depends on another item."),
        ),
        default_prompts=(
            _prompt("custom_extract", "Custom Extract", "Follow the user-provided domain brief and extract source-backed artifacts and relationships."),
            _prompt("custom_review", "Custom Review", "Apply the user-provided review criteria while preserving source-grounding and review-state rules."),
        ),
        review_checklist=(
            "User-defined domain rules are represented in metadata or review notes.",
            "Unsupported generated content is marked as an assumption.",
            "Custom relationship semantics are clear enough for reviewer validation.",
            "Output remains compatible with TraceSpace graph and source-reference contracts.",
        ),
        output_templates=(
            _template(
                "custom_profile_output",
                "Custom Profile Output",
                "Flexible output template for user-defined source-intelligence profiles.",
                required_sections=("domain_brief", "artifacts", "relationships", "review_items"),
                node_types=("custom", "concept", "artifact", "question", "task"),
                relationship_types=("contains", "references", "related_to", "depends_on"),
                metadata={"default_output_shape": "custom_graph"},
            ),
        ),
    ),
}


DOMAIN_PROFILE_IDS = set(DOMAIN_PROFILE_REGISTRY)


def normalize_domain_profile_id(profile_id: str | None) -> str:
    if not isinstance(profile_id, str):
        return "custom"
    normalized = profile_id.strip().lower().replace("-", "_").replace(" ", "_")
    normalized = normalized.replace("/", "_")
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    aliases = {
        "revit": "revit_standards",
        "revit_standard": "revit_standards",
        "software": "software_inventory",
        "inventory": "software_inventory",
        "delivery": "project_delivery",
        "project": "project_delivery",
        "sop": "sop_process",
        "process": "sop_process",
        "sop_process": "sop_process",
        "meeting": "meeting_notes",
        "meeting_note": "meeting_notes",
        "research": "research_review",
    }
    return aliases.get(normalized, normalized)


def is_domain_profile(value: str | None) -> bool:
    return normalize_domain_profile_id(value) in DOMAIN_PROFILE_IDS


def get_domain_profile(profile_id: str | None) -> dict[str, Any]:
    normalized = normalize_domain_profile_id(profile_id)
    profile = DOMAIN_PROFILE_REGISTRY.get(normalized, DOMAIN_PROFILE_REGISTRY["custom"])
    return profile.model_dump()


def list_domain_profiles() -> list[dict[str, Any]]:
    return [profile.model_dump() for profile in DOMAIN_PROFILE_REGISTRY.values()]


def domain_profile_registry() -> dict[str, Any]:
    return {
        "version": DOMAIN_PROFILE_REGISTRY_VERSION,
        "profiles": {
            profile_id: profile.model_dump()
            for profile_id, profile in DOMAIN_PROFILE_REGISTRY.items()
        },
    }


def build_domain_profile_prompt_context(profile_id: str | None) -> str:
    profile = get_domain_profile(profile_id)
    artifact_types = ", ".join(
        artifact["id"] for artifact in profile["expected_artifact_types"]
    )
    relationship_types = ", ".join(
        relationship["id"] for relationship in profile["common_relationship_types"]
    )
    checklist = "\n".join(
        f"- {item}" for item in profile["review_checklist"]
    )

    return (
        "\n\nApply this optional TraceSpace domain profile while producing source-intelligence output."
        f"\nDomain profile: {profile['label']} ({profile['id']})."
        f"\nExpected artifact types: {artifact_types}."
        f"\nCommon relationship types: {relationship_types}."
        "\nReview checklist:"
        f"\n{checklist}"
        "\nUse the selected profile as guidance, but do not override source-grounding, citation, or review-state requirements."
    )
