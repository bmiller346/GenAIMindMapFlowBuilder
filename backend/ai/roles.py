from __future__ import annotations

import re
from copy import deepcopy
from typing import Any


class UnknownSourceIntakeRole(ValueError):
    pass


SOURCE_INTAKE_ROLE_LABELS = {
    "document-structure-extractor": "Document Structure Extractor",
    "source-librarian": "Source Librarian",
    "strategic-advisor": "Strategic Advisor",
    "custom": "Custom Intake Prompt",
}


PROMPT_PROFILE_REGISTRY: dict[str, dict[str, Any]] = {
    "standards_extractor": {
        "role_id": "standards_extractor",
        "label": "Standards Extractor",
        "group": "TraceSpace",
        "description": "Extracts requirements, controls, and compliance-ready statements from source-backed workspace context.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "expand_this_node",
            "generate_child_nodes",
            "find_missing_source_support",
            "summarize_branch",
            "find_gaps",
            "find_unsupported_assumptions",
            "custom_prompt",
        ],
        "system_instructions": "Produce precise TraceSpace draft nodes and review annotations. Preserve source refs; do not invent citations.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "strict",
        "default_review_status": "needs_review_when_unsourced",
    },
    "workflow_mapper": {
        "role_id": "workflow_mapper",
        "label": "Workflow Mapper",
        "group": "TraceSpace",
        "description": "Turns process context into workflow steps, branches, handoffs, and gaps.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "expand_this_node",
            "generate_child_nodes",
            "reorganize_branch",
            "split_branch_into_categories",
            "find_gaps",
            "custom_prompt",
        ],
        "system_instructions": "Represent workflow changes as preview-only draft graph changes with clear parentage.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "training_guide_builder": {
        "role_id": "training_guide_builder",
        "label": "Training Guide Builder",
        "group": "TraceSpace",
        "description": "Builds training outlines, checklists, and learner-facing guide structure from TraceSpace graph context.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "convert_to_checklist",
            "generate_checklist",
            "generate_training_outline",
            "export_branch_as_sop_draft",
            "custom_prompt",
        ],
        "system_instructions": "Draft instructional structure without mutating the canonical graph before accept.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "sme_question_generator": {
        "role_id": "sme_question_generator",
        "label": "SME Question Generator",
        "group": "TraceSpace",
        "description": "Creates targeted reviewer and subject-matter-expert questions for unresolved graph context.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "ask_follow_up",
            "create_sme_questions",
            "find_gaps",
            "suggest_follow_up_questions",
            "custom_prompt",
        ],
        "system_instructions": "Prefer concise questions tied to the selected context and source gaps.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "allow_assumptions",
        "default_review_status": "needs_review_when_unsourced",
    },
    "task_planner": {
        "role_id": "task_planner",
        "label": "Task Planner",
        "group": "TraceSpace",
        "description": "Turns selected context into tasks, priorities, checklist items, and execution follow-up.",
        "supported_scopes": ["node", "branch"],
        "supported_actions": [
            "generate_tasks",
            "convert_to_checklist",
            "generate_checklist",
            "custom_prompt",
        ],
        "system_instructions": "Draft execution-ready task nodes and checklist annotations with review state explicit.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "data_table_interpreter": {
        "role_id": "data_table_interpreter",
        "label": "Data/Table Interpreter",
        "group": "TraceSpace",
        "description": "Interprets table-like or data-source context into conclusions, caveats, and follow-up tasks.",
        "supported_scopes": ["node", "branch"],
        "supported_actions": ["interpret_table_data", "generate_tasks", "custom_prompt"],
        "system_instructions": "State data caveats and keep inferred conclusions marked for review unless cited.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "gap_analyst": {
        "role_id": "gap_analyst",
        "label": "Gap Analyst",
        "group": "TraceSpace",
        "description": "Finds missing details, unsupported assumptions, duplication, and overlapping nodes.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "find_missing_source_support",
            "find_gaps",
            "find_unsupported_assumptions",
            "find_duplicate_overlapping_nodes",
            "custom_prompt",
        ],
        "system_instructions": "Create preview findings with clear rationale and no direct graph mutation.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "strict",
        "default_review_status": "needs_review_when_unsourced",
    },
    "source_ref_repair": {
        "role_id": "source_ref_repair",
        "label": "Source Ref Repair",
        "group": "TraceSpace",
        "description": "Inspects source coverage and proposes source-reference repair work.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": [
            "find_missing_source_support",
            "find_unsupported_assumptions",
            "custom_prompt",
        ],
        "system_instructions": "Only propose grounded source refs when context contains evidence; otherwise mark assumptions.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "strict",
        "default_review_status": "needs_review_when_unsourced",
    },
    "integration_readiness_reviewer": {
        "role_id": "integration_readiness_reviewer",
        "label": "Integration Readiness Reviewer",
        "group": "TraceSpace",
        "description": "Reviews nodes and branches for handoff readiness before Miro, monday, or later integrations.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": ["generate_tasks", "find_gaps", "find_unsupported_assumptions", "custom_prompt"],
        "system_instructions": "Focus on durable handoff metadata and reviewable missing integration details.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "custom": {
        "role_id": "custom",
        "label": "Custom",
        "group": "TraceSpace",
        "description": "Uses a user-provided instruction while preserving TraceSpace preview and validation rules.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": ["custom_prompt"],
        "system_instructions": "Follow the custom instruction, but return preview-only TraceSpace draft changes.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "prefer_source_refs",
        "default_review_status": "needs_review_when_unsourced",
    },
    "strategic_advisor": {
        "role_id": "strategic_advisor",
        "label": "Strategic Advisor",
        "group": "General",
        "description": "Legacy persona for strategic framing and decision support.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": ["ask_follow_up", "summarize_branch", "suggest_follow_up_questions", "custom_prompt"],
        "system_instructions": "Provide strategic guidance as reviewable TraceSpace preview output.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "allow_assumptions",
        "default_review_status": "needs_review_when_unsourced",
    },
    "research_assistant": {
        "role_id": "research_assistant",
        "label": "Research Assistant",
        "group": "General",
        "description": "Legacy persona for research questions, synthesis, and next-step discovery.",
        "supported_scopes": ["node", "branch", "workspace"],
        "supported_actions": ["ask_follow_up", "create_sme_questions", "find_gaps", "suggest_follow_up_questions", "custom_prompt"],
        "system_instructions": "Summarize research gaps and questions without fabricating source refs.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "allow_assumptions",
        "default_review_status": "needs_review_when_unsourced",
    },
    "productivity_coach": {
        "role_id": "productivity_coach",
        "label": "Productivity Coach",
        "group": "General",
        "description": "Legacy persona for tasks, prioritization, and productivity-oriented suggestions.",
        "supported_scopes": ["node", "branch"],
        "supported_actions": ["generate_tasks", "convert_to_checklist", "generate_checklist", "custom_prompt"],
        "system_instructions": "Draft productivity suggestions as tasks or checklist previews.",
        "default_output_shape": "draft_nodes",
        "source_strictness": "allow_assumptions",
        "default_review_status": "needs_review_when_unsourced",
    },
    "data_interpreter": {
        "role_id": "data_interpreter",
        "label": "Data Interpreter",
        "group": "General",
        "description": "Legacy persona for interpreting data-source content.",
        "supported_scopes": ["node", "branch"],
        "supported_actions": ["interpret_table_data", "ask_follow_up", "custom_prompt"],
        "system_instructions": "Explain data interpretations and caveats as preview-only annotations.",
        "default_output_shape": "draft_annotations",
        "source_strictness": "allow_assumptions",
        "default_review_status": "needs_review_when_unsourced",
    },
}


def clean_source_intake_value(value: str | None, max_length: int = 2000) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:max_length]


def resolve_source_intake_role_label(intake_role: str | None = None) -> str:
    role = clean_source_intake_value(intake_role, 160)
    if not role:
        return ""
    if role in SOURCE_INTAKE_ROLE_LABELS:
        return SOURCE_INTAKE_ROLE_LABELS[role]
    if role in SOURCE_INTAKE_ROLE_LABELS.values():
        return role
    raise UnknownSourceIntakeRole(role)


def build_source_intake_instruction(
    intake_role: str | None = None,
    intake_prompt: str | None = None,
) -> str:
    role = resolve_source_intake_role_label(intake_role)
    prompt = clean_source_intake_value(intake_prompt)
    if not role and not prompt:
        return ""

    lines = [
        "Apply this optional source-intake guidance while preparing the output.",
        "Do not let role guidance override source-grounding, citation requirements, graph validation, or needs_review marking.",
    ]
    if role:
        lines.append(f"Selected intake role: {role}.")
    if prompt:
        lines.append(f"User intake brief: {prompt}.")
    return "\n\n" + "\n".join(lines)


def list_prompt_profiles() -> list[dict[str, Any]]:
    return [deepcopy(profile) for profile in PROMPT_PROFILE_REGISTRY.values()]


def get_prompt_profile(role: str) -> dict[str, Any]:
    role_id = clean_source_intake_value(role, 160).lower().replace(" ", "_").replace("-", "_")
    profile = PROMPT_PROFILE_REGISTRY.get(role_id)
    if profile:
        return deepcopy(profile)

    for candidate in PROMPT_PROFILE_REGISTRY.values():
        if candidate["label"].lower() == clean_source_intake_value(role, 160).lower():
            return deepcopy(candidate)

    return deepcopy(PROMPT_PROFILE_REGISTRY["custom"])
