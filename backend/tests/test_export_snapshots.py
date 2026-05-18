import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from export.csv_tasks import export_task_rows
from export.internal_graph_json import export_internal_graph
from export.markdown import export_executive_summary_markdown, export_news_article_markdown
from export.workspace_graph import (
    build_workspace_graph,
    graph_to_news_article,
    graph_to_news_article_markdown,
    graph_to_executive_markdown,
    graph_to_executive_output,
    graph_to_markdown,
    graph_to_mermaid,
    graph_to_mmd_json,
    graph_to_opml,
    graph_to_team_roadmap,
    graph_to_team_roadmap_markdown,
    graph_to_task_rows,
    select_branch,
    select_latest_ai_draft_artifact,
)
from graph.schemas import WorkspaceGraph


def test_validated_graph_json_snapshot_includes_report_and_task_projection():
    graph = _validated_export_graph()

    assert graph["workspace"] == {
        "id": "workspace-1",
        "title": "Training Rollout",
        "summary": "Plan rollout work.",
        "flow_type": "mind_map",
        "brief": {},
    }
    assert graph["validation_report"] == {
        "is_valid": True,
        "repaired": True,
        "root_node_id": "root",
        "issues": [
            {
                "code": "low_confidence",
                "severity": "warning",
                "message": "AI-generated node confidence is below 60% and was marked needs_review.",
                "node_id": "task-1",
                "edge_id": "",
                "repaired": True,
            }
        ],
    }
    assert graph["nodes"] == [
        {
            "id": "root",
            "parent_id": None,
            "title": "Training Rollout",
            "summary": "Coordinate launch readiness",
            "node_type": "concept",
            "status": "ai_generated",
            "priority": "",
            "owner_id": "",
            "due_date": "",
            "confidence": 0.92,
            "source_refs": [
                {
                    "document_id": "doc-1",
                    "page": 1,
                    "section": "Overview",
                    "quote_snippet": "Launch training in phases.",
                    "confidence": 0.92,
                }
            ],
            "external_refs": {},
            "metadata": {
                "react_flow_type": "response",
                "position": {"x": 0, "y": 0},
                "component_id": "",
                "component_type": "",
                "task_fields": {"priority": "", "owner_id": "", "due_date": ""},
            },
        },
        {
            "id": "task-1",
            "parent_id": "root",
            "title": "Draft enablement checklist",
            "summary": "Create checklist for reviewers",
            "node_type": "task",
            "status": "needs_review",
            "priority": "high",
            "owner_id": "team-docs",
            "due_date": "2026-06-01",
            "confidence": 0.55,
            "source_refs": [
                {
                    "document_id": "doc-1",
                    "page": 3,
                    "section": "Tasks",
                    "quote_snippet": "Checklist needs SME review.",
                    "confidence": 0.55,
                }
            ],
            "external_refs": {},
            "metadata": {
                "react_flow_type": "response",
                "position": {"x": 240, "y": 120},
                "component_id": "",
                "component_type": "",
                "task_fields": {
                    "priority": "high",
                    "owner_id": "team-docs",
                    "due_date": "2026-06-01",
                },
            },
        },
    ]
    assert graph["edges"] == [
        {
            "id": "edge-root-task-1",
            "source_node_id": "root",
            "target_node_id": "task-1",
            "relationship_type": "contains",
            "metadata": {"animated": False, "react_flow_type": "smoothstep"},
        }
    ]
    assert graph["tasks"] == [
        {
            "id": "task-task-1",
            "node_id": "task-1",
            "title": "Draft enablement checklist",
            "description": "Create checklist for reviewers",
            "status": "needs_review",
            "priority": "high",
            "due_date": "2026-06-01",
            "assignee": "team-docs",
            "confidence": 0.55,
            "source_refs": [
                {
                    "document_id": "doc-1",
                    "page": 3,
                    "section": "Tasks",
                    "quote_snippet": "Checklist needs SME review.",
                    "confidence": 0.55,
                }
            ],
            "external_refs": {},
        }
    ]
    WorkspaceGraph.model_validate(graph)


def test_workspace_graph_preserves_relationship_evidence_metadata():
    source_ref = {"document_id": "doc-relationship", "chunk_id": "approval"}
    flow = {
        "_id": "workspace-kg",
        "flow_name": "Knowledge Graph",
        "flow_type": "manual",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {"id": "plan", "type": "response", "data": {"label": "Plan"}},
                    {"id": "approval", "type": "response", "data": {"label": "Approval"}},
                ],
                "edges": [
                    {
                        "id": "edge-plan-approval",
                        "source": "plan",
                        "target": "approval",
                        "type": "smoothstep",
                        "relationship_type": "depends_on",
                        "confidence": 0.82,
                        "rationale": "Launch planning depends on approval.",
                        "source_signal": "Manual review",
                        "review_state": "needs_review",
                        "source_refs": [source_ref],
                        "data": {
                            "relationship_type": "depends_on",
                            "confidence": 0.82,
                            "rationale": "Launch planning depends on approval.",
                            "source_signal": "Manual review",
                            "review_state": "needs_review",
                            "source_refs": [source_ref],
                        },
                        "metadata": {"authored_from_view": "knowledgeGraph"},
                    }
                ],
            }
        ),
    }

    graph = build_workspace_graph(flow)

    edge = graph["edges"][0]
    assert edge["relationship_type"] == "depends_on"
    assert edge["confidence"] == 0.82
    assert edge["review_state"] == "needs_review"
    assert edge["source_refs"] == [source_ref]
    assert edge["metadata"]["authored_from_view"] == "knowledgeGraph"
    assert edge["metadata"]["rationale"] == "Launch planning depends on approval."
    assert edge["metadata"]["source_signal"] == "Manual review"


def test_internal_graph_json_export_snapshot_preserves_validation_report():
    graph = _validated_export_graph()

    assert export_internal_graph(graph) == json.dumps(graph, indent=2)


def test_downstream_export_projection_snapshots_use_validated_graph():
    graph = _validated_export_graph()

    assert graph_to_markdown(graph) == (
        "# Training Rollout\n\n"
        "- Training Rollout [ai_generated]\n"
        "  - Draft enablement checklist [needs_review]\n"
    )
    assert graph_to_task_rows(graph) == [
        {
            "Title": "Draft enablement checklist",
            "Node ID": "task-1",
            "Status": "needs_review",
            "Priority": "high",
            "Owner": "team-docs",
            "Due Date": "2026-06-01",
            "Confidence": 0.55,
            "Node Type": "task",
            "Source Document": "doc-1",
            "Source Page": 3,
            "Source Section": "Tasks",
            "Source Quote": "Checklist needs SME review.",
            "App Link": "",
        }
    ]
    assert export_task_rows(graph_to_task_rows(graph)) == (
        "Title,Node ID,Status,Priority,Owner,Due Date,Confidence,Node Type,"
        "Source Document,Source Page,Source Section,Source Quote,App Link\r\n"
        "Draft enablement checklist,task-1,needs_review,high,team-docs,"
        "2026-06-01,0.55,task,doc-1,3,Tasks,Checklist needs SME review.,\r\n"
    )
    assert graph_to_mmd_json(graph) == {
        "text": "Training Rollout",
        "links": [],
        "children": [
            {
                "text": "Draft enablement checklist",
                "links": [],
                "children": [],
            }
        ],
    }
    assert graph_to_mermaid(graph) == (
        "graph TD\n"
        '  root["Training Rollout"] --> task-1["Draft enablement checklist"]\n'
    )
    assert graph_to_opml(graph) == (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<opml version="2.0"><head><title>Training Rollout</title></head>'
        '<body><outline text="Training Rollout" node_id="root" node_type="concept" '
        'review_state="ai_generated" priority="" owner_id="" due_date="" '
        'confidence="0.92" source_doc="doc-1" source_page="1">'
        '<outline text="Draft enablement checklist" node_id="task-1" node_type="task" '
        'review_state="needs_review" priority="high" owner_id="team-docs" '
        'due_date="2026-06-01" confidence="0.55" source_doc="doc-1" source_page="3"/>'
        '</outline></body></opml>'
    )


def test_executive_output_projection_is_source_backed_and_exportable():
    graph = _validated_export_graph()
    output = graph_to_executive_output(graph)

    assert output["contract_version"] == "1"
    assert output["metadata"] == {
        "node_count": 2,
        "source_backed_node_count": 2,
        "needs_review_count": 1,
        "task_count": 1,
    }
    assert [item["title"] for item in output["key_findings"]] == [
        "Training Rollout",
        "Draft enablement checklist",
    ]
    assert output["recommended_actions"][0] == {
        "id": "recommended_action-task-1",
        "title": "Draft enablement checklist",
        "description": "Create checklist for reviewers",
        "status": "needs_review",
        "priority": "high",
        "owner_id": "team-docs",
        "due_date": "2026-06-01",
        "source_refs": [
            {
                "document_id": "doc-1",
                "page": 3,
                "section": "Tasks",
                "quote_snippet": "Checklist needs SME review.",
                "confidence": 0.55,
            }
        ],
        "source_backed": True,
        "needs_review": True,
        "metadata": {
            "source": "workspace_graph_projection",
            "scope": "workspace",
            "artifact_type": "executive_output",
            "layout_hint": "recommended_action",
            "rationale": "Projected from task as recommended_action. Source-backed. Requires review before external distribution.",
            "review_reason": "Confirm source support before executive use.",
            "source_signal": "explicit_source_ref",
        },
    }
    assert "## Source-backed Appendix" in graph_to_executive_markdown(graph)
    assert "Checklist needs SME review." in graph_to_executive_markdown(graph)


def test_executive_summary_and_news_article_artifacts_export_to_markdown():
    executive = export_executive_summary_markdown(
        {
            "title": "Deployment Summary",
            "summary": "Deployment is ready after manager approval.",
            "key_points": [
                {
                    "title": "Approval gate",
                    "description": "Manager approval is required.",
                    "source_backed": True,
                    "source_refs": [{"document_id": "doc-1", "quote_snippet": "Manager approval is required."}],
                }
            ],
            "recommended_actions": [],
            "risks": [],
            "source_backed_appendix": [
                {
                    "title": "Approval evidence",
                    "source_refs": [{"document_id": "doc-1", "quote_snippet": "Manager approval is required."}],
                }
            ],
            "assumptions": [],
        }
    )
    article = export_news_article_markdown(
        {
            "headline": "Deployment Process Adds Approval Gate",
            "dek": "Manager review is required before rollout.",
            "lede": "Teams must confirm approval before deployment begins.",
            "sections": [
                {
                    "title": "What changed",
                    "description": "The rollout now includes a manager approval gate.",
                    "source_refs": [{"document_id": "doc-1", "quote_snippet": "approval gate"}],
                }
            ],
            "fact_checks": [],
            "quotes": [],
            "source_refs": [{"document_id": "doc-1", "quote_snippet": "approval gate"}],
            "assumptions": ["Timing still needs confirmation."],
        }
    )

    assert "# Deployment Summary" in executive
    assert "## Key Points" in executive
    assert "Manager approval is required." in executive
    assert "# Deployment Process Adds Approval Gate" in article
    assert "## What changed" in article
    assert "## Source-backed Appendix" in article
    assert "Timing still needs confirmation." in article


def test_news_article_projection_uses_source_backed_graph_for_markdown_export():
    graph = _validated_export_graph()
    article = graph_to_news_article(graph)

    assert article["headline"] == "Training Rollout Update"
    assert article["lede"] == (
        "Plan rollout work. Projected from 2 content node(s), "
        "including 2 source-backed item(s)."
    )
    assert [section["title"] for section in article["sections"]] == [
        "Training Rollout",
        "Draft enablement checklist",
    ]
    assert article["sections"][1]["status"] == "needs_review"
    assert article["source_refs"] == [
        {
            "document_id": "doc-1",
            "page": 1,
            "section": "Overview",
            "quote_snippet": "Launch training in phases.",
            "confidence": 0.92,
        },
        {
            "document_id": "doc-1",
            "page": 3,
            "section": "Tasks",
            "quote_snippet": "Checklist needs SME review.",
            "confidence": 0.55,
        },
    ]

    markdown = graph_to_news_article_markdown(graph)
    assert "# Training Rollout Update" in markdown
    assert "## Draft enablement checklist" in markdown
    assert "Checklist needs SME review." in markdown
    assert "## Fact Check Notes" in markdown


def test_latest_ai_draft_artifact_prefers_accepted_then_latest_generated():
    generated_old = {"id": "generated-old", "artifact_type": "news_article", "data": {"headline": "Old"}}
    generated_new = {"id": "generated-new", "artifact_type": "news_article", "data": {"headline": "New"}}
    accepted = {"id": "accepted", "artifact_type": "news_article", "data": {"headline": "Accepted"}}
    sessions = [
        {
            "updated_at": "2026-05-01T00:00:00Z",
            "revisions": [
                {"created_at": "2026-05-01T00:00:00Z", "generated_artifacts": [generated_old]},
                {"created_at": "2026-05-02T00:00:00Z", "generated_artifacts": [generated_new]},
            ],
            "accept_history": [],
        }
    ]

    assert select_latest_ai_draft_artifact(sessions, {"news_article"}) == generated_new

    sessions.append(
        {
            "updated_at": "2026-05-01T12:00:00Z",
            "revisions": [],
            "accept_history": [
                {
                    "accepted_at": "2026-05-01T12:00:00Z",
                    "accepted_artifacts": [accepted],
                }
            ],
        }
    )

    assert select_latest_ai_draft_artifact(sessions, {"news_article"}) == accepted


def test_team_roadmap_projection_groups_source_backed_graph_for_export():
    graph = _roadmap_export_graph()
    roadmap = graph_to_team_roadmap(graph)

    assert roadmap["contract_version"] == "1"
    assert roadmap["metadata"] == {
        "node_count": 5,
        "source_backed_node_count": 5,
        "workstream_count": 2,
        "dependency_count": 2,
        "risk_count": 1,
        "required_decision_count": 1,
        "milestone_count": 2,
        "recommended_next_action_count": 3,
    }
    assert [item["title"] for item in roadmap["workstreams"]] == [
        "Implementation workstream",
        "Security review task",
    ]
    assert roadmap["dependencies"][0]["title"] == "Implementation workstream -> Security review task"
    assert roadmap["dependencies"][0]["relationship_type"] == "depends_on"
    assert roadmap["dependencies"][0]["source_backed"] is True
    assert [item["title"] for item in roadmap["risks"]] == ["Late security review"]
    assert [item["title"] for item in roadmap["required_decisions"]] == ["Approve rollout window"]
    assert [item["title"] for item in roadmap["milestones"]] == [
        "Security review task",
        "Pilot complete",
    ]
    assert roadmap["recommended_next_actions"][0]["title"] == "Security review task"
    assert roadmap["source_backed_appendix"][0]["metadata"]["artifact_type"] == "team_roadmap"

    markdown = graph_to_team_roadmap_markdown(graph)
    assert "## Workstreams" in markdown
    assert "## Source Appendix" in markdown
    assert "Security review must happen before pilot." in markdown


def test_selected_branch_revalidates_report_for_branch_scope():
    graph = _validated_branch_graph()
    branch = select_branch(graph, "task-parent")

    assert [node["id"] for node in branch["nodes"]] == ["task-parent", "task-child"]
    assert branch["nodes"][0]["parent_id"] is None
    assert branch["validation_report"] == {
        "is_valid": True,
        "repaired": True,
        "root_node_id": "task-parent",
        "issues": [
            {
                "code": "low_confidence",
                "severity": "warning",
                "message": "AI-generated node confidence is below 60% and was marked needs_review.",
                "node_id": "task-child",
                "edge_id": "",
                "repaired": True,
            }
        ],
    }
    assert branch["tasks"] == [
        {
            "id": "task-task-child",
            "node_id": "task-child",
            "title": "Review checklist",
            "description": "",
            "status": "needs_review",
            "priority": "",
            "due_date": "",
            "assignee": "",
            "confidence": 0.4,
            "source_refs": [
                {
                    "document_id": "doc-1",
                    "page": 5,
                    "section": "Review",
                    "quote_snippet": "Review checklist with SMEs.",
                    "confidence": 0.4,
                }
            ],
            "external_refs": {},
        }
    ]
    WorkspaceGraph.model_validate(branch)


def test_validated_graph_preserves_staged_monday_selection_input():
    graph = build_workspace_graph(
        {
            "_id": "workspace-selection",
            "flow_name": "Selection Workspace",
            "flow_json": json.dumps(
                {
                    "nodes": [
                        {
                            "id": "task-1",
                            "type": "response",
                            "position": {"x": 0, "y": 0},
                            "data": {
                                "title": "Review checklist",
                                "node_type": "task",
                                "source_refs": [{"document_id": "doc-1"}],
                                "monday_selection_input": {
                                    "selected": True,
                                    "source": "accepted_local_preview_metadata",
                                    "accepted_flows": ["branch_to_task"],
                                    "selection_reason": ["accepted task preview"],
                                    "item": {
                                        "name": "Accepted review checklist",
                                        "node_id": "task-1",
                                        "status": "accepted",
                                    },
                                },
                            },
                        }
                    ],
                    "edges": [],
                }
            ),
        }
    )

    assert graph["nodes"][0]["monday_selection_input"] == {
        "selected": True,
        "source": "accepted_local_preview_metadata",
        "accepted_flows": ["branch_to_task"],
        "selection_reason": ["accepted task preview"],
        "item": {
            "name": "Accepted review checklist",
            "node_id": "task-1",
            "status": "accepted",
        },
    }
    WorkspaceGraph.model_validate(graph)


def test_selected_branch_export_projection_snapshots():
    graph = _validated_branch_graph()
    branch = select_branch(graph, "task-parent")

    assert graph_to_markdown(branch) == (
        "# Branch Workspace\n\n"
        "- Execution Workstream [ai_generated]\n"
        "  - Review checklist [needs_review]\n"
    )
    assert graph_to_task_rows(branch) == [
        {
            "Title": "Review checklist",
            "Node ID": "task-child",
            "Status": "needs_review",
            "Priority": "",
            "Owner": "",
            "Due Date": "",
            "Confidence": 0.4,
            "Node Type": "task",
            "Source Document": "doc-1",
            "Source Page": 5,
            "Source Section": "Review",
            "Source Quote": "Review checklist with SMEs.",
            "App Link": "",
        }
    ]
    assert graph_to_mmd_json(branch) == {
        "text": "Execution Workstream",
        "links": [],
        "children": [
            {
                "text": "Review checklist",
                "links": [],
                "children": [],
            }
        ],
    }
    assert graph_to_mermaid(branch) == (
        "graph TD\n"
        '  task-parent["Execution Workstream"] --> task-child["Review checklist"]\n'
    )
    assert graph_to_opml(branch) == (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<opml version="2.0"><head><title>Branch Workspace</title></head>'
        '<body><outline text="Execution Workstream" node_id="task-parent" '
        'node_type="concept" review_state="ai_generated" priority="" owner_id="" '
        'due_date="" confidence="0.88" source_doc="doc-1" source_page="2">'
        '<outline text="Review checklist" node_id="task-child" node_type="task" '
        'review_state="needs_review" priority="" owner_id="" due_date="" '
        'confidence="0.4" source_doc="doc-1" source_page="5"/>'
        '</outline></body></opml>'
    )


def _validated_export_graph():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Training Rollout",
        "summary": "Plan rollout work.",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Training Rollout",
                            "summary": "Coordinate launch readiness",
                            "node_type": "concept",
                            "source_refs": [
                                {
                                    "document_id": "doc-1",
                                    "page": 1,
                                    "section": "Overview",
                                    "quote_snippet": "Launch training in phases.",
                                    "confidence": 0.92,
                                }
                            ],
                        },
                    },
                    {
                        "id": "task-1",
                        "type": "response",
                        "position": {"x": 240, "y": 120},
                        "data": {
                            "title": "Draft enablement checklist",
                            "summary": "Create checklist for reviewers",
                            "node_type": "task",
                            "priority": "high",
                            "owner_id": "team-docs",
                            "due_date": "2026-06-01",
                            "source_refs": [
                                {
                                    "document_id": "doc-1",
                                    "page": 3,
                                    "section": "Tasks",
                                    "quote_snippet": "Checklist needs SME review.",
                                    "confidence": 0.55,
                                }
                            ],
                        },
                    },
                ],
                "edges": [
                    {
                        "id": "edge-root-task-1",
                        "source": "root",
                        "target": "task-1",
                        "type": "smoothstep",
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            }
        ),
    }

    return build_workspace_graph(flow)


def _validated_branch_graph():
    flow = {
        "_id": "workspace-branch",
        "flow_name": "Branch Workspace",
        "summary": "Branch export fixture.",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Workspace Root",
                            "node_type": "concept",
                            "source_refs": [{"document_id": "doc-1", "page": 1}],
                        },
                    },
                    {
                        "id": "task-parent",
                        "type": "response",
                        "position": {"x": 200, "y": 0},
                        "data": {
                            "title": "Execution Workstream",
                            "node_type": "concept",
                            "source_refs": [
                                {
                                    "document_id": "doc-1",
                                    "page": 2,
                                    "section": "Execution",
                                    "quote_snippet": "Build the execution workstream.",
                                    "confidence": 0.88,
                                }
                            ],
                        },
                    },
                    {
                        "id": "task-child",
                        "type": "response",
                        "position": {"x": 420, "y": 0},
                        "data": {
                            "title": "Review checklist",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": "doc-1",
                                    "page": 5,
                                    "section": "Review",
                                    "quote_snippet": "Review checklist with SMEs.",
                                    "confidence": 0.4,
                                }
                            ],
                        },
                    },
                    {
                        "id": "outside-task",
                        "type": "response",
                        "position": {"x": 200, "y": 160},
                        "data": {
                            "title": "Outside branch",
                            "node_type": "task",
                        },
                    },
                ],
                "edges": [
                    {"id": "edge-root-parent", "source": "root", "target": "task-parent"},
                    {"id": "edge-parent-child", "source": "task-parent", "target": "task-child"},
                    {"id": "edge-root-outside", "source": "root", "target": "outside-task"},
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            }
        ),
    }

    return build_workspace_graph(flow)


def _roadmap_export_graph():
    source_ref = {
        "document_id": "doc-roadmap",
        "page": 4,
        "section": "Execution",
        "quote_snippet": "Security review must happen before pilot.",
        "confidence": 0.91,
    }
    return {
        "workspace": {
            "id": "workspace-roadmap",
            "title": "Roadmap Workspace",
            "summary": "Coordinate the rollout plan.",
            "flow_type": "mind_map",
            "brief": {},
        },
        "nodes": [
            {
                "id": "workstream-1",
                "parent_id": None,
                "title": "Implementation workstream",
                "summary": "Prepare the team for pilot rollout.",
                "node_type": "workstream",
                "status": "ai_generated",
                "priority": "",
                "owner_id": "",
                "due_date": "",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
                "metadata": {},
            },
            {
                "id": "task-1",
                "parent_id": "workstream-1",
                "title": "Security review task",
                "summary": "Complete security review before pilot.",
                "node_type": "workflow",
                "status": "ai_generated",
                "priority": "high",
                "owner_id": "security",
                "due_date": "2026-06-01",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
                "metadata": {},
            },
            {
                "id": "risk-1",
                "parent_id": None,
                "title": "Late security review",
                "summary": "Pilot cannot start if security review slips.",
                "node_type": "risk",
                "status": "needs_review",
                "priority": "",
                "owner_id": "",
                "due_date": "",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
                "metadata": {},
            },
            {
                "id": "decision-1",
                "parent_id": "workstream-1",
                "title": "Approve rollout window",
                "summary": "Stakeholders must confirm the pilot week.",
                "node_type": "decision",
                "status": "ai_generated",
                "priority": "",
                "owner_id": "",
                "due_date": "",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
                "metadata": {},
            },
            {
                "id": "milestone-1",
                "parent_id": "task-1",
                "title": "Pilot complete",
                "summary": "Pilot feedback is ready for team review.",
                "node_type": "milestone",
                "status": "ai_generated",
                "priority": "",
                "owner_id": "",
                "due_date": "2026-06-15",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
                "metadata": {},
            },
        ],
        "edges": [
            {
                "id": "edge-workstream-task",
                "source_node_id": "workstream-1",
                "target_node_id": "task-1",
                "relationship_type": "depends_on",
                "metadata": {},
            },
            {
                "id": "edge-task-risk",
                "source_node_id": "risk-1",
                "target_node_id": "task-1",
                "relationship_type": "blocks",
                "metadata": {},
            },
            {
                "id": "edge-workstream-decision",
                "source_node_id": "workstream-1",
                "target_node_id": "decision-1",
                "relationship_type": "contains",
                "metadata": {},
            },
            {
                "id": "edge-task-milestone",
                "source_node_id": "task-1",
                "target_node_id": "milestone-1",
                "relationship_type": "contains",
                "metadata": {},
            },
        ],
        "tasks": [
            {
                "id": "task-task-1",
                "node_id": "task-1",
                "title": "Security review task",
                "description": "Complete security review before pilot.",
                "status": "ai_generated",
                "priority": "high",
                "due_date": "2026-06-01",
                "assignee": "security",
                "confidence": "",
                "source_refs": [source_ref],
                "external_refs": {},
            }
        ],
        "views": {},
    }
