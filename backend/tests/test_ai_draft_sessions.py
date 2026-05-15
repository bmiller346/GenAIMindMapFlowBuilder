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
from export.workspace_graph import build_workspace_graph


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


def react_root_flow():
    return {
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
                        "data": {
                            "title": "Root",
                            "status": "approved",
                            "source_refs": [{"document_id": "doc-1"}],
                            "metadata": {"workspace_role": "root"},
                        },
                    }
                ],
                "edges": [],
                "viewport": {},
            }
        ),
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
    flow = react_root_flow()

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


def test_accept_endpoint_save_reload_preserves_source_refs_needs_review_and_audit(monkeypatch):
    persisted = {}
    flow = react_root_flow()

    def fake_save(session):
        persisted[session["session_id"]] = copy.deepcopy(session)
        return session

    def fake_persist(flow_id, snapshot):
        flow["flow_json"] = json.dumps(snapshot)

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: build_workspace_graph(flow))
    monkeypatch.setattr(app, "get_workspace_flow_or_404", lambda flow_id: copy.deepcopy(flow))
    monkeypatch.setattr(app, "get_source_components", lambda flow_id: [])
    monkeypatch.setattr(app, "save_ai_draft_session", fake_save)
    monkeypatch.setattr(
        app,
        "get_ai_draft_session_or_404",
        lambda flow_id, session_id: copy.deepcopy(persisted[session_id]),
    )
    monkeypatch.setattr(app, "_persist_flow_snapshot", fake_persist)

    session = app.create_ai_draft_session(
        "workspace-1",
        {
            "prompt": "Add cited and uncited cereal branches",
            "scope": {"type": "node", "node_id": "root"},
            "draft_nodes": [draft_node("cited-branch", sourced=True), draft_node("uncited-branch")],
            "draft_edges": [
                {
                    "id": "edge-cited",
                    "source_node_id": "root",
                    "target_node_id": "cited-branch",
                    "relationship_type": "contains",
                    "metadata": {},
                },
                {
                    "id": "edge-uncited",
                    "source_node_id": "root",
                    "target_node_id": "uncited-branch",
                    "relationship_type": "contains",
                    "metadata": {},
                },
            ],
        },
    )
    accept_response = app.accept_ai_draft_session_endpoint(
        "workspace-1",
        session["session_id"],
        {
            "mode": "selected",
            "selected_item_ids": ["item_cited-branch", "item_uncited-branch"],
        },
    )

    reloaded_graph = build_workspace_graph(flow)
    cited = next(node for node in reloaded_graph["nodes"] if node["id"] == "cited-branch")
    uncited = next(node for node in reloaded_graph["nodes"] if node["id"] == "uncited-branch")
    accepted_session = persisted[session["session_id"]]

    assert cited["source_refs"] == [{"document_id": "doc-1"}]
    assert cited["metadata"]["ai_draft_session_id"] == session["session_id"]
    assert uncited["status"] == "needs_review"
    assert uncited["metadata"]["ai_draft_session_id"] == session["session_id"]
    assert accepted_session["accept_history"][-1]["metadata"]["undo_snapshot"]
    assert accept_response["accept_result"]["accepted_node_ids"] == [
        "cited-branch",
        "uncited-branch",
    ]
    assert accept_response["graph"]["nodes"][1]["data"]["source_refs"] == [{"document_id": "doc-1"}]


def test_workspace_custom_prompt_draft_session_uses_backend_preview(monkeypatch):
    graph = sample_graph()
    persisted = {}

    def fake_save(session):
        persisted[session["session_id"]] = copy.deepcopy(session)
        return session

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: copy.deepcopy(graph))
    monkeypatch.setattr(app, "save_ai_draft_session", fake_save)

    session = app.create_ai_draft_session(
        "workspace-1",
        {
            "role": "workflow_mapper",
            "action": "custom_prompt",
            "intent": "custom_prompt",
            "prompt": "show a SAAS business model",
            "custom_prompt": "show a SAAS business model",
            "scope": {"type": "workspace"},
        },
    )

    revision = session["revisions"][0]
    titles = [node["title"] for node in revision["draft_nodes"]]
    child_edges = [
        edge
        for edge in revision["draft_edges"]
        if edge["source_node_id"] == revision["draft_nodes"][0]["id"]
    ]
    assert session["status"] == "drafting"
    assert session["selected_model"]
    assert revision["draft_nodes"][0]["title"] == "SaaS business model"
    assert "Pricing and packaging" in titles
    assert "Revenue engine" in titles
    assert len(revision["draft_nodes"]) >= 7
    assert len(child_edges) >= 6
    assert revision["metadata"]["preview_mode"] == "deterministic_draft"


def test_discard_endpoint_persists_rejection_without_graph_mutation(monkeypatch):
    persisted = {}
    flow = react_root_flow()
    original_flow_json = flow["flow_json"]
    persist_calls = []

    def fake_save(session):
        persisted[session["session_id"]] = copy.deepcopy(session)
        return session

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: build_workspace_graph(flow))
    monkeypatch.setattr(app, "save_ai_draft_session", fake_save)
    monkeypatch.setattr(
        app,
        "get_ai_draft_session_or_404",
        lambda flow_id, session_id: copy.deepcopy(persisted[session_id]),
    )
    monkeypatch.setattr(app, "_persist_flow_snapshot", lambda flow_id, snapshot: persist_calls.append(snapshot))

    session = app.create_ai_draft_session(
        "workspace-1",
        {
            "prompt": "Add a branch",
            "scope": {"type": "node", "node_id": "root"},
            "draft_nodes": [draft_node("discarded-branch")],
        },
    )

    discarded = app.discard_ai_draft_session_endpoint(
        "workspace-1",
        session["session_id"],
        {"discarded_by": "tester"},
    )

    assert discarded["status"] == "discarded"
    assert flow["flow_json"] == original_flow_json
    assert persist_calls == []
