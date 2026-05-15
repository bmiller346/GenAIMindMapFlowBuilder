import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from ai_helpers import (
    accept_ai_draft_revision,
    append_ai_draft_revision,
    build_ai_draft_revision,
    build_ai_draft_session,
)


def sample_graph():
    return {
        "workspace": {"id": "workspace-1", "title": "Demo"},
        "nodes": [
            {
                "id": "root",
                "parent_id": None,
                "title": "Root",
                "summary": "",
                "node_type": "concept",
                "status": "approved",
                "source_refs": [{"document_id": "doc-1"}],
                "external_refs": {},
                "metadata": {},
            }
        ],
        "edges": [],
        "tasks": [],
        "views": {},
    }


def draft_node(node_id="draft-1", *, sourced=False):
    return {
        "id": node_id,
        "parent_id": "root",
        "title": "Draft branch",
        "summary": "Proposed branch",
        "node_type": "concept",
        "status": "ai_generated",
        "source_refs": [{"document_id": "doc-1"}] if sourced else [],
        "external_refs": {},
        "metadata": {"source": "test"},
    }


def build_session_with_revision():
    session = build_ai_draft_session(
        workspace_id="workspace-1",
        prompt="Add a branch",
        scope={"type": "node", "node_id": "root"},
        role="Custom",
        intent="custom_prompt",
    )
    revision = build_ai_draft_revision(
        session=session,
        prompt="Add a branch",
        draft_nodes=[draft_node()],
        draft_edges=[
            {
                "id": "edge-draft-1",
                "source_node_id": "root",
                "target_node_id": "draft-1",
                "relationship_type": "contains",
                "metadata": {},
            }
        ],
    )
    return append_ai_draft_revision(session, revision, prompt="Add a branch")


def test_create_and_revise_draft_session_are_non_canonical():
    graph = sample_graph()
    original = copy.deepcopy(graph)
    session = build_session_with_revision()
    revision = build_ai_draft_revision(
        session=session,
        prompt="Try a second branch",
        draft_nodes=[draft_node("draft-2")],
    )
    updated = append_ai_draft_revision(session, revision, prompt="Try a second branch")

    assert graph == original
    assert updated["status"] == "drafting"
    assert len(updated["revisions"]) == 2
    assert updated["revisions"][0]["draft_nodes"][0]["id"] == "draft-1"


def test_accept_selected_mutates_only_selected_items_and_marks_unsourced_needs_review():
    graph = sample_graph()
    session = build_ai_draft_session(
        workspace_id="workspace-1",
        prompt="Add two branches",
        scope={"type": "node", "node_id": "root"},
        role="Custom",
        intent="custom_prompt",
    )
    revision = build_ai_draft_revision(
        session=session,
        prompt="Add two branches",
        draft_nodes=[draft_node("draft-1"), draft_node("draft-2", sourced=True)],
        draft_edges=[
            {
                "id": "edge-draft-1",
                "source_node_id": "root",
                "target_node_id": "draft-1",
                "relationship_type": "contains",
                "metadata": {},
            },
            {
                "id": "edge-draft-2",
                "source_node_id": "root",
                "target_node_id": "draft-2",
                "relationship_type": "contains",
                "metadata": {},
            },
        ],
    )
    session = append_ai_draft_revision(session, revision, prompt="Add two branches")

    accepted_graph, updated_session, result = accept_ai_draft_revision(
        graph,
        session,
        accept_mode="selected",
        selected_item_ids=["item_draft-1"],
    )

    accepted_ids = {node["id"] for node in accepted_graph["nodes"]}
    accepted_node = next(node for node in accepted_graph["nodes"] if node["id"] == "draft-1")
    assert "draft-1" in accepted_ids
    assert "draft-2" not in accepted_ids
    assert accepted_node["status"] == "needs_review"
    assert result["accepted_node_ids"] == ["draft-1"]
    assert updated_session["ai_action_run"] is None
    assert updated_session["status"] == "accepted"


def test_draft_session_endpoints_persist_without_graph_changes_until_accept(monkeypatch):
    graph = sample_graph()
    persisted = {}
    saved_flow_json = {}
    flow = {
        "_id": "workspace-1",
        "flow_name": "Demo",
        "summary": "",
        "flow_type": "manual",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "root",
                        "type": "custom",
                        "position": {"x": 0, "y": 0},
                        "data": {"title": "Root", "status": "approved", "source_refs": [{"document_id": "doc-1"}]},
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
    }

    def fake_save(session):
        persisted[session["session_id"]] = copy.deepcopy(session)
        return session

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: copy.deepcopy(graph))
    monkeypatch.setattr(app, "get_workspace_flow_or_404", lambda flow_id: copy.deepcopy(flow))
    monkeypatch.setattr(app, "get_source_components", lambda flow_id: [])
    monkeypatch.setattr(app, "save_ai_draft_session", fake_save)
    monkeypatch.setattr(
        app,
        "get_ai_draft_session_or_404",
        lambda flow_id, session_id: copy.deepcopy(persisted[session_id]),
    )
    monkeypatch.setattr(app, "_persist_flow_snapshot", lambda flow_id, snapshot: saved_flow_json.update(snapshot))

    create_response = app.create_ai_draft_session(
        "workspace-1",
        {
            "prompt": "Add a branch",
            "scope": {"type": "node", "node_id": "root"},
            "draft_nodes": [draft_node()],
            "draft_edges": [
                {
                    "id": "edge-draft-1",
                    "source_node_id": "root",
                    "target_node_id": "draft-1",
                    "relationship_type": "contains",
                    "metadata": {},
                }
            ],
        },
    )
    session_id = create_response["session_id"]

    assert graph["nodes"] == sample_graph()["nodes"]
    assert persisted[session_id]["status"] == "drafting"

    app.create_ai_draft_revision(
        "workspace-1",
        session_id,
        {"prompt": "Second pass", "draft_nodes": [draft_node("draft-2")]},
    )
    assert graph["nodes"] == sample_graph()["nodes"]
    assert len(persisted[session_id]["revisions"]) == 2

    app.accept_ai_draft_session_endpoint(
        "workspace-1",
        session_id,
        {"revision_id": persisted[session_id]["revisions"][0]["revision_id"], "mode": "selected", "selected_item_ids": ["item_draft-1"]},
    )

    assert any(node["id"] == "draft-1" for node in saved_flow_json["nodes"])
    assert persisted[session_id]["accept_history"][-1]["metadata"]["undo_snapshot"] == flow["flow_json"]
