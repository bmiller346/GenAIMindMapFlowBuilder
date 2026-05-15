import json

from export.workspace_graph import build_workspace_graph
from graph.enterprise_scoring import enterprise_score_node
from graph.schemas import WorkspaceGraph


def test_enterprise_score_node_scores_core_readiness_dimensions():
    row = enterprise_score_node(
        {
            "id": "task-1",
            "title": "Deploy controls",
            "node_type": "task",
            "status": "ai_generated",
            "priority": "high",
            "owner_id": "ops-lead",
            "due_date": "2026-06-01",
            "metadata": {
                "enterprise_fields": {
                    "business_impact": "critical",
                    "implementation_effort": "medium",
                    "risk_severity": "high",
                }
            },
            "confidence": 0.9,
            "source_refs": [
                {
                    "document_id": "doc-1",
                    "page": 4,
                    "section": "Controls",
                    "quote_snippet": "Controls must be deployed before launch.",
                    "confidence": 0.9,
                }
            ],
        }
    )

    assert row["enterprise_scores"] == {
        "business_impact": 100,
        "implementation_effort": 70,
        "risk_severity": 85,
        "source_coverage": 99,
        "owner_clarity": 100,
    }
    assert row["enterprise_score"] == 76
    assert row["enterprise_readiness"] == "watchlist"


def test_workspace_graph_includes_enterprise_readiness_view():
    graph = build_workspace_graph(
        {
            "_id": "workspace-1",
            "flow_name": "Enterprise Launch",
            "summary": "",
            "flow_type": "mind_map",
            "flow_json": json.dumps(
                {
                    "nodes": [
                        {
                            "id": "task-1",
                            "type": "response",
                            "position": {"x": 0, "y": 0},
                            "data": {
                                "title": "Deploy controls",
                                "node_type": "task",
                                "priority": "high",
                                "owner_id": "ops-lead",
                                "due_date": "2026-06-01",
                                "business_impact": "critical",
                                "implementation_effort": "medium",
                                "risk_severity": "high",
                                "source_refs": [
                                    {
                                        "document_id": "doc-1",
                                        "page": 4,
                                        "section": "Controls",
                                        "quote_snippet": (
                                            "Controls must be deployed before launch."
                                        ),
                                        "confidence": 0.9,
                                    }
                                ],
                            },
                        },
                        {
                            "id": "risk-1",
                            "type": "response",
                            "position": {"x": 200, "y": 0},
                            "data": {
                                "title": "Unowned migration risk",
                                "node_type": "risk",
                                "status": "needs_review",
                                "implementation_effort": "high",
                            },
                        },
                    ],
                    "edges": [
                        {
                            "id": "edge-1",
                            "source": "risk-1",
                            "target": "task-1",
                            "relationship_type": "blocks",
                        }
                    ],
                    "viewport": {},
                }
            ),
        }
    )

    readiness = graph["views"]["enterprise_readiness"]

    assert readiness["node_count"] == 2
    assert readiness["score"] == 53
    assert readiness["label"] == "Not ready"
    assert readiness["ready_count"] == 0
    assert readiness["watchlist_count"] == 1
    assert readiness["not_ready_count"] == 1
    assert readiness["dimension_averages"] == {
        "business_impact": 85,
        "implementation_effort": 55,
        "risk_severity": 80,
        "source_coverage": 50,
        "owner_clarity": 58,
    }
    assert readiness["blockers"][0]["id"] == "task-1"
    assert any(blocker["id"] == "risk-1" for blocker in readiness["blockers"])
    WorkspaceGraph.model_validate(graph)
