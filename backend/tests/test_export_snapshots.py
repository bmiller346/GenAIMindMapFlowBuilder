import json

from export.csv_tasks import export_task_rows
from export.internal_graph_json import export_internal_graph
from export.workspace_graph import (
    build_workspace_graph,
    graph_to_markdown,
    graph_to_mermaid,
    graph_to_mmd_json,
    graph_to_opml,
    graph_to_task_rows,
    select_branch,
)
from graph.schemas import WorkspaceGraph


def test_validated_graph_json_snapshot_includes_report_and_task_projection():
    graph = _validated_export_graph()

    assert graph["workspace"] == {
        "id": "workspace-1",
        "title": "Training Rollout",
        "summary": "Plan rollout work.",
        "flow_type": "mind_map",
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
