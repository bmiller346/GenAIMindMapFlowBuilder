import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_helpers import (
    accept_ai_draft_revision,
    append_ai_draft_revision,
    build_ai_draft_revision,
    build_ai_draft_session,
)


def _graph():
    return {
        "workspace": {"id": "workspace-1", "title": "Cereal Workspace"},
        "nodes": [
            _node("root", "Cereals", node_type="workspace", status="system_generated"),
            _node("kellogg", "Kellogg's", parent_id="root"),
            _node("cheerios", "Cheerios", parent_id="general-mills"),
        ],
        "edges": [
            _edge("edge-root-kellogg", "root", "kellogg"),
            _edge("edge-orphan-parent", "general-mills", "cheerios"),
        ],
        "tasks": [],
    }


def _clean_graph():
    return {
        "workspace": {"id": "workspace-1", "title": "Cereal Workspace"},
        "nodes": [
            _node("root", "Cereals", node_type="workspace", status="system_generated"),
            _node("kellogg", "Kellogg's", parent_id="root"),
        ],
        "edges": [_edge("edge-root-kellogg", "root", "kellogg")],
        "tasks": [],
    }


def _node(node_id, title, parent_id=None, node_type="category", status="ai_generated", source_refs=None):
    return {
        "id": node_id,
        "title": title,
        "summary": "",
        "node_type": node_type,
        "parent_id": parent_id,
        "status": status,
        "source_refs": source_refs or [],
        "external_refs": {},
        "metadata": {},
    }


def _edge(edge_id, source, target):
    return {
        "id": edge_id,
        "source_node_id": source,
        "target_node_id": target,
        "relationship_type": "contains",
        "metadata": {},
    }


def _session(draft_nodes, draft_edges=None, draft_annotations=None, generated_artifacts=None):
    session = build_ai_draft_session(
        workspace_id="workspace-1",
        prompt="create a mind map for cereals by manufacturer",
        scope={"type": "branch", "node_id": "root"},
        role="Strategic Advisor",
        intent="custom_prompt",
        session_id="session-cereal",
    )
    revision = build_ai_draft_revision(
        session=session,
        prompt="create a mind map for cereals by manufacturer",
        draft_nodes=draft_nodes,
        draft_edges=draft_edges or [],
        draft_annotations=draft_annotations or [],
        generated_artifacts=generated_artifacts or [],
        revision_id="revision-cereal-1",
    )
    return append_ai_draft_revision(session, revision)


def _source_ref():
    return {
        "document_id": "doc-cereal",
        "page": 1,
        "chunk_id": "chunk-cereal-1",
        "quote_snippet": "Approval is required before deployment.",
    }


def _connected_picture_package_artifact():
    source_ref = _source_ref()
    metadata = {
        "source": None,
        "scope": None,
        "artifact_type": "connected_picture_package",
        "layout_hint": None,
        "rationale": None,
        "review_reason": None,
        "source_signal": None,
    }
    return {
        "id": "artifact-connected-package",
        "artifact_type": "connected_picture_package",
        "title": "Connected Package",
        "status": "draft",
        "data": {
            "package_id": "connected-package-1",
            "primary_nodes": [
                {
                    "id": "primary-root",
                    "node_id": "root",
                    "title": "Deployment procedure",
                    "summary": "Approval and rollout process.",
                    "node_type": "procedure",
                    "status": "reviewed",
                    "review_state": "reviewed",
                    "needs_review": False,
                    "source_refs": [source_ref],
                    "assumptions": [],
                    "metadata": metadata,
                }
            ],
            "relationship_edges": [],
            "view_lenses": [],
            "structured_evidence": [],
            "evidence_links": [],
            "tasks": [],
            "risks": [],
            "decisions": [],
            "repair_targets": [],
            "source_refs": [source_ref],
            "assumptions": [],
            "acceptance_groups": [],
        },
        "source_refs": [source_ref],
        "assumptions": [],
    }


def test_merge_accept_updates_matching_node_without_duplicate_ids():
    graph = _clean_graph()
    session = _session(
        [
            _node(
                "draft-kellogg",
                "Kellogg's",
                parent_id="root",
                source_refs=[{"document_id": "doc-cereal", "page": 1}],
            )
        ],
        [_edge("draft-edge-kellogg", "root", "draft-kellogg")],
    )
    session["revisions"][-1]["draft_nodes"][0]["summary"] = "Updated manufacturer details."

    accepted_graph, _, result = accept_ai_draft_revision(graph, session, accept_mode="merge")

    assert [node["id"] for node in accepted_graph["nodes"]].count("kellogg") == 1
    kellogg = next(node for node in accepted_graph["nodes"] if node["id"] == "kellogg")
    assert kellogg["summary"] == "Updated manufacturer details."
    assert "update_node" in {op["op"] for op in result["patch_operations"]}


def test_replace_branch_removes_descendants_and_incident_edges_without_orphans():
    graph = _clean_graph()
    graph["nodes"].append(_node("old-child", "Old Child", parent_id="root"))
    graph["nodes"].append(_node("old-grandchild", "Old Grandchild", parent_id="old-child"))
    graph["edges"].append(_edge("edge-root-old", "root", "old-child"))
    graph["edges"].append(_edge("edge-old-grand", "old-child", "old-grandchild"))
    session = _session(
        [_node("general-mills", "General Mills", parent_id="root")],
        [_edge("draft-edge-general-mills", "root", "general-mills")],
    )

    accepted_graph, _, result = accept_ai_draft_revision(graph, session, accept_mode="replace")

    node_ids = {node["id"] for node in accepted_graph["nodes"]}
    assert "old-child" not in node_ids
    assert "old-grandchild" not in node_ids
    assert "general-mills" in node_ids
    assert all(edge["source_node_id"] in node_ids and edge["target_node_id"] in node_ids for edge in accepted_graph["edges"])
    assert {"remove_node", "remove_edge", "add_node", "add_edge"} <= {op["op"] for op in result["patch_operations"]}


def test_selected_accept_only_accepts_selected_nodes_and_safe_edges():
    session = _session(
        [
            _node("kellogg-draft", "Kellogg's", parent_id="root"),
            _node("general-mills", "General Mills", parent_id="root"),
        ],
        [
            _edge("draft-edge-kellogg", "root", "kellogg-draft"),
            _edge("draft-edge-general-mills", "root", "general-mills"),
        ],
    )

    accepted_graph, _, result = accept_ai_draft_revision(
        _clean_graph(),
        session,
        accept_mode="selected",
        selected_item_ids=["item_general-mills"],
    )

    node_ids = {node["id"] for node in accepted_graph["nodes"]}
    assert "general-mills" in node_ids
    assert "kellogg-draft" not in node_ids
    assert result["accepted_node_ids"] == ["general-mills"]


def test_selected_accept_without_selection_accepts_no_draft_items():
    session = _session(
        [_node("general-mills", "General Mills", parent_id="root")],
        [_edge("draft-edge-general-mills", "root", "general-mills")],
    )

    accepted_graph, _, result = accept_ai_draft_revision(
        _clean_graph(),
        session,
        accept_mode="selected",
        selected_item_ids=[],
    )

    assert {node["id"] for node in accepted_graph["nodes"]} == {"root", "kellogg"}
    assert result["accepted_node_ids"] == []


def test_cited_only_excludes_uncited_generated_nodes():
    session = _session(
        [
            _node("cited", "Cited", parent_id="root", source_refs=[{"document_id": "doc-1"}]),
            _node("uncited", "Uncited", parent_id="root"),
        ],
        [
            _edge("edge-cited", "root", "cited"),
            _edge("edge-uncited", "root", "uncited"),
        ],
    )

    accepted_graph, _, result = accept_ai_draft_revision(_clean_graph(), session, accept_mode="cited_only")

    node_ids = {node["id"] for node in accepted_graph["nodes"]}
    assert "cited" in node_ids
    assert "uncited" not in node_ids
    assert result["accepted_node_ids"] == ["cited"]


def test_notes_only_attaches_review_outputs_without_creating_nodes():
    session = _session(
        [_node("general-mills", "General Mills", parent_id="root")],
        [_edge("draft-edge-general-mills", "root", "general-mills")],
        [{"id": "review-1", "title": "Review", "content": "Check manufacturer coverage."}],
    )
    graph = _clean_graph()

    accepted_graph, _, result = accept_ai_draft_revision(graph, session, accept_mode="notes_only")

    assert [node["id"] for node in accepted_graph["nodes"]] == [node["id"] for node in graph["nodes"]]
    root = next(node for node in accepted_graph["nodes"] if node["id"] == "root")
    assert root["metadata"]["ai_draft_outputs"][0]["outputs"][0]["id"] == "review-1"
    assert result["accepted_node_ids"] == []
    assert result["patch_operations"][0]["op"] == "attach_note"


def test_unsourced_accepted_nodes_persist_as_needs_review_and_undo_snapshot_is_returned():
    session = _session(
        [_node("general-mills", "General Mills", parent_id="root")],
        [_edge("draft-edge-general-mills", "root", "general-mills")],
    )

    accepted_graph, _, result = accept_ai_draft_revision(_clean_graph(), session, accept_mode="append")

    accepted = next(node for node in accepted_graph["nodes"] if node["id"] == "general-mills")
    assert accepted["status"] == "needs_review"
    assert accepted["metadata"]["ai_draft_session_id"] == "session-cereal"
    assert result["undo"]["kind"] == "full_graph_snapshot"


def test_connected_picture_package_accept_preserves_artifact_and_undo_snapshot():
    artifact = _connected_picture_package_artifact()
    session = _session(
        [_node("deployment", "Deployment", parent_id="root", source_refs=[_source_ref()])],
        [_edge("draft-edge-deployment", "root", "deployment")],
        generated_artifacts=[artifact],
    )

    accepted_graph, accepted_session, result = accept_ai_draft_revision(
        _clean_graph(),
        session,
        accept_mode="append",
    )

    assert "deployment" in {node["id"] for node in accepted_graph["nodes"]}
    assert accepted_session["accept_history"][0]["accepted_artifacts"][0]["artifact_type"] == "connected_picture_package"
    assert result["accepted_artifacts"][0]["data"]["package_id"] == "connected-package-1"
    assert result["accepted_artifacts"][0]["metadata"]["ai_draft_revision_id"] == "revision-cereal-1"
    assert result["accepted_artifacts"][0]["metadata"]["ai_draft_session_id"] == "session-cereal"
    assert result["metadata"]["undo_kind"] == "full_graph_snapshot"
    assert result["metadata"]["accepted_artifact_ids"] == ["artifact-connected-package"]
    assert result["undo"]["before_graph"]["workspace"]["id"] == "workspace-1"
