import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_helpers import (
    AI_HELPER_PREVIEW_CONTRACT_VERSION,
    AI_ACTION_PREVIEW_CONTRACT_VERSION,
    build_ai_action_run,
    build_helper_preview,
    build_openai_helper_preview_payload,
    generate_ai_action_preview,
    generate_integration_operator_preview,
    generate_helper_preview,
    generate_project_planner_preview,
    generate_reviewer_preview,
    generate_source_librarian_preview,
    get_prompt_profile,
    list_prompt_profiles,
    normalize_helper_scope,
    parse_ai_helper_preview_response,
    validate_ai_action_drafts_for_accept,
    validate_ai_action_request,
    validate_ai_action_run,
    validate_helper_action,
    validate_ai_helper_preview,
)
from graph.schemas import GraphSchemaError


def sample_graph():
    return {
        "workspace": {"id": "workspace-1", "title": "Test Workspace"},
        "nodes": [
            {
                "id": "root",
                "title": "Root",
                "node_type": "concept",
                "status": "ai_generated",
                "source_refs": [
                    {
                        "document_id": "doc-1",
                        "page": 2,
                        "section": "Overview",
                        "quote_snippet": "The plan describes the root.",
                        "confidence": 0.82,
                    }
                ],
            },
            {
                "id": "child",
                "title": "Needs source",
                "node_type": "requirement",
                "status": "ai_generated",
                "source_refs": [],
            },
        ],
        "edges": [
            {
                "id": "edge-1",
                "source_node_id": "root",
                "target_node_id": "child",
                "relationship_type": "contains",
            }
        ],
        "tasks": [],
    }


def test_source_librarian_deterministic_preview_suggests_nearby_source_ref():
    preview = generate_source_librarian_preview(
        sample_graph(),
        scope={"type": "workspace"},
        use_ai=False,
    )

    assert preview["helper_id"] == "source_librarian"
    assert preview["action"] == "source_repair"
    assert preview["generated_by"] == "deterministic_fallback"
    assert preview["metadata"]["ai_helper_preview_contract_version"] == (
        AI_HELPER_PREVIEW_CONTRACT_VERSION
    )
    assert len(preview["preview_items"]) == 1
    item = preview["preview_items"][0]
    assert item["node_id"] == "child"
    assert item["source_refs"][0]["document_id"] == "doc-1"
    assert item["proposed_mutation"]["source_ref_repair"]["suggested_from_node_id"] == "root"


def test_source_librarian_branch_scope_limits_preview_items():
    graph = sample_graph()
    graph["nodes"].append(
        {
            "id": "outside",
            "title": "Outside",
            "node_type": "requirement",
            "status": "ai_generated",
            "source_refs": [],
        }
    )

    preview = generate_source_librarian_preview(
        graph,
        scope={"type": "branch", "node_id": "root"},
        use_ai=False,
    )

    assert [item["node_id"] for item in preview["preview_items"]] == ["child"]


def test_source_librarian_source_coverage_reports_assumption_backed_gaps():
    preview = generate_source_librarian_preview(
        sample_graph(),
        action="source_coverage",
        scope={"type": "workspace"},
        use_ai=False,
    )

    assert preview["action"] == "source_coverage"
    assert preview["preview_items"][0]["preview_type"] == "source_coverage"
    assert preview["preview_items"][0]["node_id"] == "child"
    assert preview["preview_items"][0]["source_refs"] == []
    assert "supporting source" in preview["preview_items"][0]["assumptions"][0]


def test_source_librarian_source_coverage_reads_workspace_source_library():
    graph = sample_graph()
    graph["source_library"] = {
        "documents": [
            {
                "id": "doc-unused",
                "filename": "Unused.pdf",
                "source_node_ids": ["source-node-1"],
                "cited_node_ids": [],
            }
        ]
    }

    preview = generate_source_librarian_preview(
        graph,
        action="source_coverage",
        scope={"type": "workspace"},
        use_ai=False,
    )

    unused_item = next(
        item for item in preview["preview_items"] if item["id"] == "unused_source_doc-unused"
    )
    assert unused_item["node_id"] == "source-node-1"
    assert unused_item["source_refs"] == [{"document_id": "doc-unused"}]


def test_parse_ai_helper_preview_accepts_fenced_json():
    payload = {
        "preview_id": "preview-1",
        "helper_id": "source_librarian",
        "action": "source_repair",
        "scope": {"type": "workspace"},
        "generated_by": "openai",
        "preview_items": [
            {
                "id": "item-1",
                "preview_type": "source_repair",
                "node_id": "node-1",
                "title": "Repair citation",
                "rationale": "The source is nearby.",
                "confidence": "low",
                "source_refs": [{"document_id": "doc-1"}],
                "assumptions": [],
                "proposed_mutation": {"source_refs": [{"document_id": "doc-1"}]},
            }
        ],
        "warnings": [],
        "metadata": {},
    }

    parsed = parse_ai_helper_preview_response(f"```json\n{json.dumps(payload)}\n```")

    assert parsed["preview_items"][0]["id"] == "item-1"
    assert parsed["metadata"]["ai_helper_preview_contract_version"] == (
        AI_HELPER_PREVIEW_CONTRACT_VERSION
    )


def test_build_helper_preview_supports_registered_future_helpers():
    preview = build_helper_preview(
        helper_id="project_planner",
        action="task_projection",
        scope={"type": "branch", "node_id": "root"},
        generated_by="deterministic_fallback",
        preview_items=[],
        warnings=["Planner generation is pending."],
    )

    assert preview["helper_id"] == "project_planner"
    assert preview["action"] == "task_projection"
    assert preview["scope"] == {"type": "branch", "node_id": "root"}
    assert preview["warnings"] == ["Planner generation is pending."]


def test_project_planner_task_projection_generates_task_metadata():
    preview = generate_project_planner_preview(
        sample_graph(),
        action="task_projection",
        scope={"type": "branch", "node_id": "root"},
        use_ai=False,
    )

    assert preview["helper_id"] == "project_planner"
    assert preview["action"] == "task_projection"
    assert preview["generated_by"] == "deterministic_fallback"
    assert [item["node_id"] for item in preview["preview_items"]] == ["root", "child"]

    child_item = preview["preview_items"][1]
    mutation = child_item["proposed_mutation"]
    assert child_item["preview_type"] == "task_projection"
    assert mutation["node_type"] == "requirement"
    assert mutation["status"] == "needs_review"
    assert mutation["priority"] == "high"
    assert mutation["task_projection"]["source"] == "generated_project_planner_preview"
    assert any("Owner is unspecified" in text for text in child_item["assumptions"])


def test_project_planner_checklist_projection_generates_reviewable_items():
    preview = generate_project_planner_preview(
        sample_graph(),
        action="checklist_projection",
        scope={"type": "workspace"},
        use_ai=False,
    )

    assert preview["action"] == "checklist_projection"
    root_item = preview["preview_items"][0]
    child_item = preview["preview_items"][1]
    assert root_item["proposed_mutation"]["checklist_projection"]["order"] == 1
    assert root_item["proposed_mutation"]["checklist_projection"]["review_required"] is False
    assert child_item["proposed_mutation"]["checklist_projection"]["review_required"] is True


def test_reviewer_sme_questions_include_citation_backed_and_assumption_backed_outputs():
    preview = generate_helper_preview(
        "reviewer",
        "sme_questions",
        sample_graph(),
        scope={"type": "workspace"},
        use_ai=False,
    )

    root_item = next(item for item in preview["preview_items"] if item["node_id"] == "root")
    child_item = next(item for item in preview["preview_items"] if item["node_id"] == "child")
    assert preview["generated_by"] == "deterministic_fallback"
    assert root_item["preview_type"] == "sme_question"
    assert root_item["source_refs"][0]["document_id"] == "doc-1"
    assert child_item["source_refs"] == []
    assert child_item["assumptions"]


def test_reviewer_missing_information_marks_uncited_nodes_with_assumptions():
    preview = generate_reviewer_preview(
        sample_graph(),
        action="missing_information",
        scope={"type": "workspace"},
        use_ai=False,
    )

    item = next(item for item in preview["preview_items"] if item["node_id"] == "child")
    assert item["preview_type"] == "missing_information"
    assert item["source_refs"] == []
    assert item["proposed_mutation"]["missing_info_review"]["severity"] == "high"
    assert "source citation" in item["assumptions"][0]


def test_reviewer_contradictions_emit_citation_backed_preview():
    graph = sample_graph()
    graph["nodes"].extend(
        [
            {
                "id": "duplicate-a",
                "title": "Decision",
                "summary": "Use option A",
                "status": "approved",
                "source_refs": [{"document_id": "doc-1", "quote_snippet": "Use A"}],
            },
            {
                "id": "duplicate-b",
                "title": "Decision",
                "summary": "Use option B",
                "status": "needs_review",
                "source_refs": [{"document_id": "doc-2", "quote_snippet": "Use B"}],
            },
        ]
    )

    preview = generate_reviewer_preview(
        graph,
        action="contradictions",
        scope={"type": "workspace"},
        use_ai=False,
    )

    assert preview["preview_items"][0]["preview_type"] == "contradiction"
    assert [ref["document_id"] for ref in preview["preview_items"][0]["source_refs"]] == [
        "doc-1",
        "doc-2",
    ]


def test_integration_operator_handoff_readiness_explains_blocked_nodes():
    preview = generate_helper_preview(
        "integration_operator",
        "handoff_readiness",
        sample_graph(),
        scope={"type": "workspace"},
        use_ai=False,
    )

    assert preview["generated_by"] == "deterministic_fallback"
    child_item = next(item for item in preview["preview_items"] if item["node_id"] == "child")
    mutation = child_item["proposed_mutation"]["integration_operator_preview"]
    assert child_item["preview_type"] == "handoff_readiness"
    assert mutation["readiness"] == "not_ready"
    assert "Missing monday item" in mutation["issues"]
    assert any("stage monday input" in text for text in child_item["assumptions"])


def test_integration_operator_sync_issue_review_uses_external_refs():
    graph = sample_graph()
    graph["nodes"][1]["external_refs"] = {
        "monday": {"board_id": "board-1", "item_id": "item-1"}
    }

    preview = generate_integration_operator_preview(
        graph,
        action="sync_issue_review",
        scope={"type": "workspace"},
        use_ai=False,
    )

    item = next(item for item in preview["preview_items"] if item["node_id"] == "child")
    mutation = item["proposed_mutation"]["integration_operator_preview"]
    assert item["preview_type"] == "sync_issue_review"
    assert mutation["readiness"] == "ready"
    assert mutation["issues"] == ["Missing export batch", "Missing push timestamp"]


def test_build_openai_helper_preview_payload_includes_contract_and_metadata():
    payload = build_openai_helper_preview_payload(
        helper_id="project_planner",
        action="task_projection",
        graph=sample_graph(),
        scope={"type": "branch", "node_id": "root"},
        system_prompt="You plan work.",
        task_prompt="Create task preview items.",
        model="gpt-test",
    )

    assert payload["model"] == "gpt-test"
    assert payload["input"][0]["content"] == "You plan work."
    user_content = payload["input"][1]["content"]
    assert "Helper: project_planner" in user_content
    assert "Action: task_projection" in user_content
    assert "Canonical AI helper preview contract:" in user_content
    assert payload["metadata"] == {
        "helper_id": "project_planner",
        "action": "task_projection",
        "scope_type": "branch",
        "node_count": 2,
    }


def test_validate_helper_action_rejects_unknown_combinations():
    with pytest.raises(GraphSchemaError) as exc:
        validate_helper_action("project_planner", "source_repair")

    assert exc.value.errors == [
        "ai_helper_preview.action: unsupported action 'source_repair' for helper 'project_planner'"
    ]


def test_normalize_helper_scope_preserves_supported_scope_ids():
    assert normalize_helper_scope({"type": "node", "node_id": " node-1 "}) == {
        "type": "node",
        "node_id": "node-1",
    }
    assert normalize_helper_scope({"type": "source", "source_id": "doc-1"}) == {
        "type": "source",
        "source_id": "doc-1",
    }
    assert normalize_helper_scope({"type": "bad", "node_id": "node-1"}) == {
        "type": "workspace"
    }


def test_validate_ai_helper_preview_rejects_bad_scope_and_duplicate_item_ids():
    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_helper_preview(
            {
                "preview_id": "preview-1",
                "helper_id": "source_librarian",
                "action": "source_repair",
                "scope": {"type": "branch"},
                "generated_by": "openai",
                "preview_items": [
                    {
                        "id": "item-1",
                        "preview_type": "source_repair",
                        "node_id": "node-1",
                        "title": "Repair",
                        "rationale": "Repair it",
                        "confidence": "low",
                        "source_refs": [],
                        "assumptions": ["Needs lookup"],
                        "proposed_mutation": {},
                    },
                    {
                        "id": "item-1",
                        "preview_type": "source_repair",
                        "node_id": "node-2",
                        "title": "Repair again",
                        "rationale": "Repair it",
                        "confidence": "low",
                        "source_refs": [],
                        "assumptions": ["Needs lookup"],
                        "proposed_mutation": {},
                    },
                ],
                "warnings": [],
                "metadata": {},
            }
        )

    assert exc.value.errors == [
        "ai_helper_preview.scope.node_id: required for branch scope",
        "ai_helper_preview.preview_items.1.id: duplicate item id 'item-1'",
    ]


def test_validate_ai_helper_preview_rejects_invalid_item_shape():
    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_helper_preview(
            {
                "preview_id": "preview-1",
                "helper_id": "source_librarian",
                "action": "source_repair",
                "scope": {"type": "workspace"},
                "generated_by": "openai",
                "preview_items": [
                    {
                        "id": "",
                        "preview_type": "source_repair",
                        "node_id": "node-1",
                        "title": "Repair",
                        "rationale": "Repair it",
                        "confidence": "low",
                        "source_refs": "doc-1",
                        "assumptions": {},
                        "proposed_mutation": [],
                    }
                ],
                "warnings": [],
                "metadata": {},
            }
        )

    assert exc.value.errors == [
        "ai_helper_preview.preview_items.0.id: must be a non-empty string",
        "ai_helper_preview.preview_items.0.source_refs: must be a list",
        "ai_helper_preview.preview_items.0.assumptions: must be a list of strings",
        "ai_helper_preview.preview_items.0.proposed_mutation: must be an object",
    ]


def test_prompt_profile_registry_includes_docmap_and_legacy_roles():
    profiles = list_prompt_profiles()
    labels = {profile["label"] for profile in profiles}
    groups = {profile["label"]: profile["group"] for profile in profiles}

    assert "Standards Extractor" in labels
    assert "SME Question Generator" in labels
    assert "Strategic Advisor" in labels
    assert "Research Assistant" in labels
    assert "Productivity Coach" in labels
    assert "Data Interpreter" in labels
    assert groups["Strategic Advisor"] == "General"
    assert get_prompt_profile("Task Planner")["role_id"] == "task_planner"


def test_validate_ai_action_request_rejects_unsupported_combinations():
    with pytest.raises(GraphSchemaError) as exc:
        validate_ai_action_request(
            role="Task Planner",
            action="find_unsupported_assumptions",
            scope={"type": "workspace"},
        )

    assert exc.value.errors == [
        "ai_action.action: unsupported action 'find_unsupported_assumptions' for role 'Task Planner'",
        "ai_action.scope: unsupported scope 'workspace' for role 'Task Planner'",
    ]


def test_build_and_validate_ai_action_run_shape():
    action_run = build_ai_action_run(
        workspace_id="workspace-1",
        scope={"type": "node", "node_id": "root"},
        role="SME Question Generator",
        action="create_sme_questions",
        input_source_refs=[{"document_id": "doc-1"}],
        generated_node_ids=["draft-1"],
    )

    assert action_run["workspace_id"] == "workspace-1"
    assert action_run["source_node_id"] == "root"
    assert action_run["scope"] == "node"
    assert action_run["status"] == "previewed"
    assert validate_ai_action_run(action_run)["generated_node_ids"] == ["draft-1"]


def test_generate_ai_action_preview_returns_contract_shape_for_node_scope():
    preview = generate_ai_action_preview(
        sample_graph(),
        workspace_id="workspace-1",
        role="Task Planner",
        action="generate_tasks",
        scope={"type": "node", "node_id": "child"},
    )

    assert preview["scope"] == "node"
    assert preview["role"] == "Task Planner"
    assert preview["action"] == "generate_tasks"
    assert preview["ai_action_run"]["source_node_id"] == "child"
    assert preview["metadata"]["ai_action_preview_contract_version"] == (
        AI_ACTION_PREVIEW_CONTRACT_VERSION
    )
    assert preview["draft_nodes"][0]["parent_id"] == "child"
    assert preview["draft_nodes"][0]["status"] == "needs_review"
    assert preview["validation_report"]["issues"][0]["code"] == "missing_source_ref"


def test_generate_ai_action_preview_preserves_source_refs_for_branch_scope():
    preview = generate_ai_action_preview(
        sample_graph(),
        workspace_id="workspace-1",
        role="Task Planner",
        action="generate_tasks",
        scope={"type": "branch", "node_id": "root"},
    )

    assert preview["scope"] == "branch"
    assert preview["source_refs"][0]["document_id"] == "doc-1"
    assert preview["draft_nodes"][0]["source_refs"][0]["document_id"] == "doc-1"
    assert preview["validation_report"]["issues"] == []


def test_validate_ai_action_drafts_marks_unsourced_nodes_needs_review():
    draft_nodes = [
        {
            "id": "draft-1",
            "title": "Draft",
            "node_type": "concept",
            "status": "ai_generated",
            "source_refs": [],
        }
    ]

    report = validate_ai_action_drafts_for_accept(draft_nodes, [])

    assert draft_nodes[0]["status"] == "needs_review"
    assert report["repaired"] is True
    assert report["issues"][0]["message"] == (
        "AI action draft node is missing a source reference and was marked needs_review."
    )
