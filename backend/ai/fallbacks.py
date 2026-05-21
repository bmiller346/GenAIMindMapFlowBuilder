from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any


def _source_refs_for_preview(node: dict[str, Any]) -> list[dict[str, Any]]:
    source_refs = node.get("source_refs")
    if isinstance(source_refs, list):
        return [deepcopy(ref) for ref in source_refs if isinstance(ref, dict)]
    return []


def _collect_source_refs(graph: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in graph.get("nodes", []):
        if not isinstance(node, dict):
            continue
        for ref in _source_refs_for_preview(node):
            if not isinstance(ref, dict):
                continue
            key = json.dumps(ref, sort_keys=True)
            if key in seen:
                continue
            refs.append(deepcopy(ref))
            seen.add(key)
    return refs


def _deterministic_ai_action_drafts(
    graph: dict[str, Any],
    *,
    action_run: dict[str, Any],
    profile: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    source_node = _source_node_for_action(graph, action_run.get("source_node_id"))
    source_node_id = source_node.get("id") if source_node else action_run.get("source_node_id")
    source_title = source_node.get("title") if source_node else "workspace"
    source_refs = _collect_source_refs(graph)
    action = action_run["action"]
    role = action_run["role"]
    draft_nodes: list[dict[str, Any]] = []
    draft_edges: list[dict[str, Any]] = []
    draft_annotations: list[dict[str, Any]] = []
    assumptions = [] if source_refs else ["Generated action preview is not source-backed and requires review."]

    if action in {
        "expand_this_node",
        "generate_child_nodes",
        "generate_tasks",
        "convert_to_checklist",
        "generate_checklist",
        "generate_training_outline",
        "export_branch_as_sop_draft",
        "create_team_roadmap",
        "create_30_60_90_day_improvement_plan",
        "create_stakeholder_review_package",
        "custom_prompt",
    }:
        planned_items = _draft_plan_for_action(
            action=action,
            source_title=source_title,
            custom_prompt=action_run.get("custom_prompt"),
        )
        for order, item in enumerate(planned_items, start=1):
            parent_order = item.get("parent_order")
            parent_node = (
                draft_nodes[int(parent_order) - 1]
                if isinstance(parent_order, int) and 0 < parent_order <= len(draft_nodes)
                else None
            )
            parent_id = parent_node.get("id") if parent_node else source_node_id
            draft_node = _draft_node(
                action_run=action_run,
                order=order,
                title=item["title"],
                summary=item["summary"],
                parent_id=parent_id,
                node_type=item["node_type"],
                source_refs=source_refs[:1],
                profile=profile,
            )
            draft_nodes.append(draft_node)
            if parent_id:
                draft_edges.append(
                    {
                        "id": f"draft_edge_{action_run['ai_action_id']}_{order}",
                        "source_node_id": parent_id,
                        "target_node_id": draft_node["id"],
                        "relationship_type": "contains",
                        "metadata": {"source": "ai_action_preview", "ai_action_id": action_run["ai_action_id"]},
                    }
                )

    if action in {
        "ask_follow_up",
        "create_sme_questions",
        "suggest_follow_up_questions",
        "find_missing_source_support",
        "find_gaps",
        "find_unsupported_assumptions",
        "find_duplicate_overlapping_nodes",
        "assess_standards_completeness",
        "find_process_bottlenecks",
        "find_duplicate_tools",
        "find_ownership_gaps",
        "find_unsupported_business_critical_systems",
        "interpret_table_data",
        "summarize_branch",
        "reorganize_branch",
        "split_branch_into_categories",
    }:
        draft_annotations.append(
            {
                "id": f"draft_annotation_{action_run['ai_action_id']}_1",
                "type": _annotation_type(action),
                "node_id": source_node_id,
                "title": _annotation_title(action, source_title),
                "body": _annotation_body(action, source_title, role, action_run.get("custom_prompt")),
                "source_refs": source_refs[:1],
                "assumptions": assumptions,
                "metadata": {"source": "ai_action_preview", "ai_action_id": action_run["ai_action_id"]},
            }
        )

    return draft_nodes, draft_edges, draft_annotations, source_refs, assumptions


def _source_node_for_action(graph: dict[str, Any], node_id: str | None) -> dict[str, Any] | None:
    nodes = [node for node in graph.get("nodes", []) if isinstance(node, dict)]
    if node_id:
        for node in nodes:
            if node.get("id") == node_id:
                return node
    return nodes[0] if nodes else None


def _draft_node(
    *,
    action_run: dict[str, Any],
    order: int,
    title: str,
    summary: str,
    parent_id: str | None,
    node_type: str,
    source_refs: list[dict[str, Any]],
    profile: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": f"draft_node_{action_run['ai_action_id']}_{order}",
        "title": title,
        "parent_id": parent_id,
        "summary": summary,
        "node_type": node_type,
        "status": "ai_generated",
        "priority": "medium" if node_type == "task" else "",
        "owner_id": "",
        "due_date": "",
        "confidence": source_refs[0].get("confidence") if source_refs else None,
        "source_refs": deepcopy(source_refs),
        "external_refs": {},
        "metadata": {
            "source": "ai_action_preview",
            "ai_action_id": action_run["ai_action_id"],
            "prompt_profile_id": profile["role_id"],
        },
    }


def _draft_plan_for_action(
    *,
    action: str,
    source_title: str,
    custom_prompt: str | None,
) -> list[dict[str, Any]]:
    target = source_title or "workspace"
    prompt = (custom_prompt or "").strip()
    if action == "custom_prompt" and prompt:
        return _custom_prompt_draft_plan(prompt)

    plans: dict[str, list[tuple[str, str, str]]] = {
        "expand_this_node": [
            ("Key details", f"Add the most important details that clarify {target}.", "concept"),
            ("Related considerations", f"Capture adjacent ideas, risks, or decisions connected to {target}.", "concept"),
        ],
        "generate_child_nodes": [
            ("Main branches", f"Create editable child branches under {target}.", "category"),
            ("Definitions and references", f"Separate definitions, references, or examples related to {target}.", "reference"),
            ("Open questions", f"Flag unresolved questions that need user or SME review for {target}.", "question"),
        ],
        "generate_tasks": [
            ("Prepare task breakdown", f"Turn {target} into accountable work items.", "task"),
            ("Assign review owner", "Identify who should validate or complete this work.", "task"),
            ("Confirm acceptance criteria", "Define what done means before the branch is accepted.", "task"),
        ],
        "convert_to_checklist": [
            ("Checklist setup", f"Convert {target} into a scannable checklist structure.", "task"),
            ("Verification step", "Add a check for evidence, owner, and completion status.", "task"),
            ("Exception handling", "Capture what to do when a checklist item cannot be verified.", "task"),
        ],
        "generate_checklist": [
            ("Checklist setup", f"Create checklist items for {target}.", "task"),
            ("Evidence check", "Confirm source support or mark the item for review.", "task"),
            ("Completion check", "Add a clear done/not-done review step.", "task"),
        ],
        "generate_training_outline": [
            ("Learning goals and audience", f"Define who the training is for and what {target} should teach.", "concept"),
            ("Module sequence", "Draft the section/module flow the learner should follow.", "workflow"),
            ("Practice and assessment", "Add exercises, checks for understanding, and review prompts.", "task"),
        ],
        "export_branch_as_sop_draft": [
            ("Purpose and scope", f"Describe when the SOP for {target} applies.", "concept"),
            ("Procedure steps", "Draft ordered steps, decisions, and handoffs.", "workflow"),
            ("Controls and evidence", "List review checkpoints, source evidence, and exception handling.", "requirement"),
        ],
        "create_team_roadmap": [
            ("Plain-language context", f"Explain the issue behind {target} in terms the team can use.", "concept"),
            ("Workstreams and dependencies", "Group the work into practical streams, dependencies, decisions, and risks.", "workflow"),
            ("Milestones and next actions", "Create a sequenced roadmap with milestones, owner placeholders, and review checkpoints.", "task"),
        ],
        "create_30_60_90_day_improvement_plan": [
            ("30 day stabilization plan", f"Identify urgent fixes, owners, and evidence needed to stabilize {target}.", "task"),
            ("60 day operating improvements", "Sequence process, tooling, and ownership improvements that reduce repeated friction.", "task"),
            ("90 day governance checkpoint", "Define durable controls, success measures, and stakeholder review gates.", "task"),
        ],
        "create_stakeholder_review_package": [
            ("Executive summary", f"Summarize the enterprise readiness findings for {target}.", "concept"),
            ("Decision and risk register", "List decisions needed, open risks, owners, and unsupported assumptions.", "requirement"),
            ("Review agenda and asks", "Package stakeholder questions, evidence requests, and next actions.", "task"),
        ],
    }
    return [
        {"title": f"{title} for {target}", "summary": summary, "node_type": node_type}
        for title, summary, node_type in plans.get(
            action,
            [("AI draft", f"Create a reviewable draft for {target}.", "concept")],
        )
    ]


def _custom_prompt_draft_plan(prompt: str) -> list[dict[str, Any]]:
    normalized_prompt = prompt.rstrip(".?!").strip()
    topic = _topic_from_custom_prompt(normalized_prompt)
    return _generic_custom_prompt_plan(topic or normalized_prompt or "AI draft")


def _topic_from_custom_prompt(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip(" .?!")
    patterns = [
        r"^(?:please\s+)?(?:show|map|layout|lay out|create|build|draft|make|generate|outline)\s+(?:me\s+)?(?:a|an|the|typical\s+)?(.+)$",
        r"^(?:what\s+is|explain|describe)\s+(?:a|an|the\s+)?(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip(" .?!")
            break
    cleaned = re.sub(r"^(?:typical|standard|basic)\s+", "", cleaned, flags=re.IGNORECASE)
    if re.search(r"\bsaas\b", cleaned, flags=re.IGNORECASE):
        cleaned = re.sub(r"\bSAAS\b", "SaaS", cleaned, flags=re.IGNORECASE)
    return cleaned[:96].replace("business model model", "business model")


def _generic_custom_prompt_plan(topic: str) -> list[dict[str, Any]]:
    return [
        {
            "title": topic[:80],
            "summary": f"Draft a reviewable structure for: {topic[:180]}",
            "node_type": "concept",
        },
        {
            "title": "Core components",
            "summary": f"Break {topic[:140] or 'the request'} into its main parts, decisions, and dependencies.",
            "node_type": "category",
            "parent_order": 1,
        },
        {
            "title": "Workflow or sequence",
            "summary": "Show the practical order of operations, handoffs, or lifecycle stages.",
            "node_type": "category",
            "parent_order": 1,
        },
        {
            "title": "Metrics and evidence",
            "summary": "Identify the signals, examples, or source support needed to validate the draft.",
            "node_type": "reference",
            "parent_order": 1,
        },
        {
            "title": "Open questions",
            "summary": "Flag assumptions, missing context, risks, and choices to confirm before accepting.",
            "node_type": "question",
            "parent_order": 1,
        },
    ]


def _annotation_type(action: str) -> str:
    if "question" in action or action == "ask_follow_up":
        return "sme_question"
    if action == "assess_standards_completeness":
        return "completeness_review"
    if "business_critical" in action:
        return "business_critical_system_gap"
    if "source" in action or "unsupported" in action:
        return "source_gap"
    if "duplicate" in action:
        return "overlap_review"
    if "bottleneck" in action:
        return "process_bottleneck"
    if "ownership" in action:
        return "ownership_gap"
    if "table" in action:
        return "table_interpretation"
    return "ai_note"


def _annotation_title(action: str, source_title: str) -> str:
    labels = {
        "ask_follow_up": "Follow-up question",
        "create_sme_questions": "SME question",
        "suggest_follow_up_questions": "Suggested follow-up",
        "find_missing_source_support": "Missing source support",
        "find_gaps": "Gap finding",
        "find_unsupported_assumptions": "Unsupported assumption",
        "find_duplicate_overlapping_nodes": "Potential overlap",
        "assess_standards_completeness": "Standards completeness review",
        "find_process_bottlenecks": "Process bottleneck",
        "find_duplicate_tools": "Duplicate tool",
        "find_ownership_gaps": "Ownership gap",
        "find_unsupported_business_critical_systems": "Unsupported business-critical system",
        "interpret_table_data": "Table interpretation",
        "summarize_branch": "Branch summary",
        "reorganize_branch": "Branch reorganization note",
        "split_branch_into_categories": "Branch category split",
    }
    return f"{labels.get(action, 'AI note')} for {source_title}"


def _annotation_body(action: str, source_title: str, role: str, custom_prompt: str | None) -> str:
    if action == "custom_prompt" and custom_prompt:
        return custom_prompt.strip()
    if action == "assess_standards_completeness":
        return f"{role} should review {source_title} for documented, missing, partial, stale, duplicate, and conflicting standards coverage, with assumptions separated from source-backed findings."
    if "question" in action or action == "ask_follow_up":
        return f"What decision or source evidence is needed to finalize {source_title}?"
    if "business_critical" in action:
        return f"{role} should identify business-critical systems in {source_title} that lack source support, ownership, recovery notes, or integration coverage."
    if "source" in action or "unsupported" in action:
        return f"{role} should verify source support before accepting generated content for {source_title}."
    if "duplicate" in action:
        return f"{role} should compare nearby nodes for overlapping meaning before merging or accepting changes."
    if "bottleneck" in action:
        return f"{role} should identify process delays, handoff friction, missing decision gates, and measurable symptoms for {source_title}."
    if "ownership" in action:
        return f"{role} should flag systems, tasks, and decisions in {source_title} that lack a clear accountable owner or review cadence."
    if "table" in action:
        return f"{role} should review table-derived claims and mark inferred conclusions for review."
    return f"{role} generated a preview note for {source_title}."


