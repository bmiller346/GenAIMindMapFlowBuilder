import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from export.package_projections import (
    action_graph,
    concept_graph,
    connected_picture_package_projections,
    data_graph,
    dependency_graph,
    evidence_graph,
    process_graph,
    relationship_graph,
)


SOURCE_REF = {
    "document_id": "doc-1",
    "page": 2,
    "section": "Plan",
    "quote_snippet": "Launch depends on approval.",
    "confidence": 0.9,
}


def test_connected_picture_package_projections_are_pure_and_source_cited():
    graph = _package_graph()
    before = copy.deepcopy(graph)
    accepted_artifacts = [
        {
            "id": "artifact-data",
            "artifact_type": "data_table",
            "data": {"title": "Pilot metrics", "source_refs": [SOURCE_REF], "rows": [{"metric": "cycle"}]},
        },
        {
            "id": "artifact-plan",
            "artifact_type": "team_roadmap",
            "data": {"title": "Roadmap"},
        },
    ]

    projections = connected_picture_package_projections(graph, accepted_artifacts)

    assert graph == before
    assert set(projections) == {
        "concept_graph",
        "relationship_graph",
        "process_graph",
        "dependency_graph",
        "evidence_graph",
        "data_graph",
        "action_graph",
    }
    concept = projections["concept_graph"]
    assert [node["id"] for node in concept["nodes"]] == ["concept-1"]
    assert concept["nodes"][0]["source_refs"] == [SOURCE_REF]
    assert concept["nodes"][0]["source_backed"] is True
    assert concept["nodes"][0]["needs_review"] is False

    action = projections["action_graph"]
    task = next(node for node in action["nodes"] if node["id"] == "task-1")
    assert task["status"] == "needs_review"
    assert task["needs_review"] is True
    assert action["evidence_gaps"] == [
        {
            "item_type": "node",
            "item_id": "task-1",
            "title": "Prepare pilot checklist",
            "status": "needs_review",
            "reason": "Missing source evidence.",
        },
        {
            "item_type": "artifact",
            "item_id": "artifact-plan",
            "title": "Roadmap",
            "status": "needs_review",
            "reason": "Missing source evidence.",
        },
    ]

    data = projections["data_graph"]
    assert data["artifacts"][0]["id"] == "artifact-data"
    assert data["artifacts"][0]["source_refs"] == [SOURCE_REF]


def test_package_projection_helpers_filter_expected_layers():
    graph = _package_graph()
    accepted_artifacts = [{"id": "artifact-evidence", "artifact_type": "newsletter", "source_refs": [SOURCE_REF]}]

    assert [node["id"] for node in concept_graph(graph)["nodes"]] == ["concept-1"]
    assert [edge["id"] for edge in relationship_graph(graph)["edges"]] == [
        "edge-concept-process",
        "edge-task-dependency",
    ]
    assert [node["id"] for node in process_graph(graph)["nodes"]] == ["process-1"]
    assert [edge["id"] for edge in dependency_graph(graph)["edges"]] == ["edge-task-dependency"]
    assert [artifact["id"] for artifact in evidence_graph(graph, accepted_artifacts)["artifacts"]] == [
        "artifact-evidence"
    ]
    assert [artifact["id"] for artifact in data_graph(graph, accepted_artifacts)["artifacts"]] == []
    assert [node["id"] for node in action_graph(graph)["nodes"]] == ["task-1"]


def _package_graph():
    return {
        "workspace": {"id": "workspace-package", "title": "Package fixture"},
        "nodes": [
            {
                "id": "concept-1",
                "parent_id": None,
                "title": "Pilot launch",
                "summary": "Coordinate the pilot launch.",
                "node_type": "concept",
                "status": "accepted",
                "confidence": 0.9,
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
            {
                "id": "process-1",
                "parent_id": "concept-1",
                "title": "Run launch process",
                "summary": "Sequence launch work.",
                "node_type": "process",
                "status": "accepted",
                "confidence": 0.8,
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
            {
                "id": "task-1",
                "parent_id": "process-1",
                "title": "Prepare pilot checklist",
                "summary": "Prepare the launch checklist.",
                "node_type": "task",
                "status": "accepted",
                "source_refs": [],
                "metadata": {},
            },
            {
                "id": "dependency-1",
                "parent_id": "task-1",
                "title": "Approval dependency",
                "summary": "Launch depends on approval.",
                "node_type": "dependency",
                "status": "accepted",
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
        ],
        "edges": [
            {
                "id": "edge-concept-process",
                "source_node_id": "concept-1",
                "target_node_id": "process-1",
                "relationship_type": "enables",
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
            {
                "id": "edge-task-dependency",
                "source_node_id": "task-1",
                "target_node_id": "dependency-1",
                "relationship_type": "depends_on",
                "source_refs": [SOURCE_REF],
                "metadata": {},
            },
        ],
        "tasks": [{"node_id": "task-1", "title": "Prepare pilot checklist"}],
    }
