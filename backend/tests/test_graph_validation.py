import json

from export.workspace_graph import build_workspace_graph
from graph.schemas import WorkspaceGraph
from graph.validation import validate_and_repair_graph


def test_validation_repairs_duplicate_ids_bad_edges_and_multiple_roots():
    graph = {
        "workspace": {"id": "workspace-1", "title": "Workspace"},
        "nodes": [
            _node("alpha", "Alpha", source_refs=[{"document_id": "doc-1"}]),
            _node("alpha", "Duplicate Alpha", source_refs=[{"document_id": "doc-1"}]),
            _node("beta", "Beta", parent_id="missing-parent", source_refs=[{"document_id": "doc-1"}]),
        ],
        "edges": [
            {
                "id": "bad-edge",
                "source_node_id": "alpha",
                "target_node_id": "missing-node",
                "relationship_type": "contains",
                "metadata": {},
            }
        ],
        "tasks": [],
        "views": {},
    }

    repaired = validate_and_repair_graph(graph)

    node_ids = [node["id"] for node in repaired["nodes"]]
    issue_codes = {
        issue["code"]
        for issue in repaired["validation_report"]["issues"]
    }

    assert "alpha" in node_ids
    assert "alpha-duplicate-2" in node_ids
    assert "workspace-root" in node_ids
    assert repaired["validation_report"]["is_valid"] is True
    assert repaired["validation_report"]["repaired"] is True
    assert issue_codes >= {
        "duplicate_node_id",
        "invalid_edge_endpoint",
        "invalid_parent_id",
        "multiple_roots",
    }
    assert all(
        edge["target_node_id"] != "missing-node"
        for edge in repaired["edges"]
    )


def test_build_workspace_graph_marks_uncited_ai_nodes_needs_review():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {"title": "AI Summary", "node_type": "task"},
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["nodes"][0]["status"] == "needs_review"
    assert graph["tasks"][0]["status"] == "needs_review"
    assert graph["validation_report"]["issues"][0]["code"] == "missing_source_ref"
    WorkspaceGraph.model_validate(graph)


def test_build_workspace_graph_marks_low_confidence_ai_nodes_needs_review():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Low confidence task",
                            "node_type": "task",
                            "confidence": 0.55,
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    issue_codes = [
        issue["code"]
        for issue in graph["validation_report"]["issues"]
    ]
    assert graph["nodes"][0]["status"] == "needs_review"
    assert graph["tasks"][0]["status"] == "needs_review"
    assert issue_codes == ["low_confidence"]
    WorkspaceGraph.model_validate(graph)


def test_build_workspace_graph_parses_percent_confidence_without_false_review():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "High confidence task",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": "doc-1",
                                    "page": 2,
                                    "confidence": "85%",
                                }
                            ],
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["nodes"][0]["status"] == "ai_generated"
    assert graph["tasks"][0]["status"] == "ai_generated"
    assert graph["validation_report"]["issues"] == []


def test_build_workspace_graph_preserves_single_source_cited_root():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Cited Summary",
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["nodes"][0]["status"] == "ai_generated"
    assert graph["validation_report"]["root_node_id"] == "root"
    assert graph["validation_report"]["issues"] == []


def test_build_workspace_graph_reports_invalid_external_refs():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Synced task",
                            "node_type": "task",
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                            "external_refs": {
                                "miro": {
                                    "board_id": "board-1",
                                    "item_id": "miro-item-1",
                                    "last_pushed_at": "2026-05-14T12:00:00Z",
                                },
                                "monday": {
                                    "board_id": "board-1",
                                    "export_batch_id": "batch-1",
                                    "last_pushed_at": "2026-05-14T12:00:00Z",
                                },
                            },
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["validation_report"]["is_valid"] is True
    assert graph["validation_report"]["issues"] == [
        {
            "code": "invalid_external_ref",
            "severity": "warning",
            "message": "miro external ref is missing export_batch_id.",
            "node_id": "root",
            "edge_id": "",
            "repaired": False,
        },
        {
            "code": "invalid_external_ref",
            "severity": "warning",
            "message": "monday external ref is missing item_id.",
            "node_id": "root",
            "edge_id": "",
            "repaired": False,
        },
    ]
    WorkspaceGraph.model_validate(graph)


def test_build_workspace_graph_accepts_complete_external_refs():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Synced task",
                            "node_type": "task",
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                            "external_refs": {
                                "miro": {
                                    "board_id": "board-1",
                                    "item_id": "miro-item-1",
                                    "export_batch_id": "miro-export-1",
                                    "last_pushed_at": "2026-05-14T12:00:00Z",
                                },
                                "monday": {
                                    "board_id": "board-2",
                                    "item_id": "item-1",
                                    "export_batch_id": "monday-export-1",
                                    "last_pushed_at": "2026-05-14T12:00:00Z",
                                },
                            },
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["validation_report"]["issues"] == []
    WorkspaceGraph.model_validate(graph)


def test_build_workspace_graph_accepts_staged_monday_selection_input():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Accepted task",
                            "node_type": "task",
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                            "monday_selection_input": {
                                "selected": True,
                                "selected_at": "2026-05-14T12:00:00Z",
                                "source": "accepted_local_preview_metadata",
                                "accepted_flows": ["branch_to_task"],
                                "selection_reason": ["accepted task preview"],
                                "item": {
                                    "name": "Accepted task",
                                    "node_id": "root",
                                },
                            },
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["nodes"][0]["monday_selection_input"] == {
        "selected": True,
        "selected_at": "2026-05-14T12:00:00Z",
        "source": "accepted_local_preview_metadata",
        "accepted_flows": ["branch_to_task"],
        "selection_reason": ["accepted task preview"],
        "item": {
            "name": "Accepted task",
            "node_id": "root",
        },
    }
    assert graph["validation_report"]["issues"] == []
    WorkspaceGraph.model_validate(graph)


def test_build_workspace_graph_warns_on_invalid_staged_monday_selection_input():
    flow = {
        "_id": "workspace-1",
        "flow_name": "Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "response",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Accepted task",
                            "node_type": "task",
                            "source_refs": [{"document_id": "doc-1", "page": 2}],
                            "monday_selection_input": {
                                "selected": True,
                                "item": {
                                    "node_id": "other-node",
                                },
                            },
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["validation_report"]["is_valid"] is True
    assert graph["validation_report"]["issues"] == [
        {
            "code": "invalid_monday_selection_input",
            "severity": "warning",
            "message": (
                "Selected monday input item node_id must match the graph node id."
            ),
            "node_id": "root",
            "edge_id": "",
            "repaired": False,
        },
        {
            "code": "invalid_monday_selection_input",
            "severity": "warning",
            "message": "Selected monday input item is missing a name.",
            "node_id": "root",
            "edge_id": "",
            "repaired": False,
        },
    ]
    WorkspaceGraph.model_validate(graph)


def _node(node_id, title, parent_id=None, source_refs=None):
    return {
        "id": node_id,
        "parent_id": parent_id,
        "title": title,
        "summary": "",
        "node_type": "concept",
        "status": "ai_generated",
        "priority": "",
        "owner_id": "",
        "due_date": "",
        "confidence": "",
        "source_refs": source_refs or [],
        "external_refs": {},
        "metadata": {},
    }
