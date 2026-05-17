import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from ai.providers import FixtureDocMapAIProvider
from ai_helpers import (
    accept_ai_draft_revision,
    append_ai_draft_revision,
    build_ai_draft_generation_request,
    build_ai_draft_source_context,
    build_ai_draft_revision,
    build_ai_draft_session,
    generate_ai_draft_session_with_provider,
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


def test_draft_generation_prompt_respects_explicit_node_counts():
    request = build_ai_draft_generation_request(
        prompt='Give me 5 more nodes for this branch.',
        graph=sample_graph(),
        scope={"type": "node", "node_id": "root"},
        role="Workflow Mapper",
        classification={"intent": "generate_child_nodes", "output_shape": "mind_map"},
        model="gpt-test",
        source_refs=[],
        source_chunks=[],
        source_context={
            "draft_preferences": {
                "expansion_mode": "strict",
                "expansion_target": "leaves",
                "evidence_mode": "uploaded_sources",
                "citation_policy": "required",
            }
        },
    )

    user_prompt = request.input[0]["content"]
    assert "Respect explicit user quantities" in user_prompt
    assert "exactly N more nodes/items" in user_prompt
    assert "unless they explicitly ask for nested descendants too" in user_prompt
    assert "source_context.draft_preferences.expansion_mode" in user_prompt
    assert "source_context.draft_preferences.expansion_target" in user_prompt
    assert "source_context.draft_preferences.evidence_mode" in user_prompt
    assert "leadership business case / decision memo" in user_prompt
    assert "recommendation or decision requested" in user_prompt
    assert "why now, proposed scope, business value, governance/risk controls" in user_prompt
    assert "planning-level ranges" in user_prompt
    assert "unsourced claims, quotes, costs, timelines, ROI estimates" in user_prompt
    assert '"expansion_mode": "strict"' in user_prompt
    assert '"expansion_target": "leaves"' in user_prompt
    assert '"evidence_mode": "uploaded_sources"' in user_prompt
    assert '"citation_policy": "required"' in user_prompt


def test_react_node_projection_uses_registered_response_node_shape():
    react_node = app._react_node_from_graph_node(
        {
            "id": "draft-1",
            "title": "Visible branch",
            "summary": "Visible details",
            "node_type": "branch",
            "status": "needs_review",
            "source_refs": [],
            "metadata": {"position": {"x": 10, "y": 20}},
        },
        1,
    )

    assert react_node["type"] == "response"
    assert react_node["data"]["title"] == "Visible branch"
    assert react_node["data"]["body"] == "Visible details"
    assert react_node["data"]["data"]["summ"] == "Visible details"
    assert react_node["targetPosition"] == "left"
    assert react_node["sourcePosition"] == "right"


def test_react_node_projection_keeps_semantic_questions_as_content_nodes():
    react_node = app._react_node_from_graph_node(
        {
            "id": "decision-1",
            "title": "Decision: Is intake complete?",
            "summary": "Choose the ready path or route missing information back.",
            "node_type": "question",
            "status": "needs_review",
            "source_refs": [],
            "metadata": {"position": {"x": 10, "y": 20}},
        },
        1,
    )

    assert react_node["type"] == "response"
    assert react_node["data"]["node_type"] == "question"
    assert react_node["data"]["title"] == "Decision: Is intake complete?"


def test_source_context_can_skip_workspace_library_for_unsourced_generation():
    graph = {
        "workspace": {"id": "workspace-1"},
        "nodes": [],
        "edges": [],
        "source_library": {
            "documents": [
                {
                    "id": "doc-1",
                    "chunks": [
                        {
                            "id": "chunk-1",
                            "heading": "Old source",
                            "snippet": "This should not bias a generic prompt.",
                        }
                    ],
                }
            ]
        },
    }

    context = build_ai_draft_source_context(
        graph,
        scope={"type": "workspace"},
        include_source_library=False,
    )

    assert context["source_chunks"] == []
    assert context["source_refs"] == []
    assert context["source_library_gaps"]["documents_with_uncited_chunks"] == []


def source_library_graph(chunk_count=16):
    return {
        "workspace": {"id": "workspace-1", "title": "Demo"},
        "nodes": [],
        "edges": [],
        "tasks": [],
        "views": {},
        "source_library": {
            "documents": [
                {
                    "id": "doc-1",
                    "filename": "strategy.pdf",
                    "chunks": [
                        {
                            "id": f"chunk-{index}",
                            "heading": f"Section {index}",
                            "snippet": f"Source library evidence snippet {index}.",
                        }
                        for index in range(1, chunk_count + 1)
                    ],
                }
            ]
        },
    }


def draft_response_json():
    return json.dumps(
        {
            "output_shape": "graph_draft",
            "draft_nodes": [
                {
                    "id": "draft_root",
                    "title": "Draft root",
                    "summary": "Fixture draft.",
                    "node_type": "concept",
                    "status": "ai_generated",
                    "source_refs": [],
                    "metadata": {},
                }
            ],
            "draft_edges": [],
            "draft_annotations": [],
            "draft_items": [],
            "source_refs": [],
            "assumptions": [],
            "generated_artifacts": [],
            "source_coverage": [],
            "tasks": [],
            "checklist": [],
            "outline": [],
            "table": [],
            "kanban": [],
            "presentation_sections": [],
            "review_annotations": [],
        }
    )


def request_prompt_text(provider):
    request_input = provider.requests[0].input
    if isinstance(request_input, list):
        return "\n".join(str(item.get("content") or "") for item in request_input)
    return str(request_input)


def test_generic_business_prompt_does_not_send_source_library_chunks_to_provider():
    provider = FixtureDocMapAIProvider(draft_response_json())

    session = generate_ai_draft_session_with_provider(
        source_library_graph(),
        workspace_id="workspace-1",
        prompt="Create a SaaS business model map",
        scope={"type": "workspace"},
        role="Workflow Mapper",
        provider=provider,
    )

    prompt_text = request_prompt_text(provider)
    assert "Source library evidence snippet" not in prompt_text
    assert '"source_chunks": []' in prompt_text
    assert session["metadata"]["source_context_mode"] == "none"
    assert session["metadata"]["source_chunks_included"] == 0
    assert session["metadata"]["source_refs_included"] == 0
    assert session["metadata"]["source_context_truncated"] is False


def test_source_prompt_sends_bounded_source_library_chunks_to_provider():
    provider = FixtureDocMapAIProvider(draft_response_json())

    session = generate_ai_draft_session_with_provider(
        source_library_graph(chunk_count=16),
        workspace_id="workspace-1",
        prompt="Create a citation-backed source coverage map from the document evidence",
        scope={"type": "workspace"},
        role="Source Librarian",
        provider=provider,
    )

    prompt_text = request_prompt_text(provider)
    assert "Source library evidence snippet 1." in prompt_text
    assert "Source library evidence snippet 12." in prompt_text
    assert "Source library evidence snippet 13." not in prompt_text
    assert session["metadata"]["source_context_mode"] == "source_library"
    assert session["metadata"]["source_chunks_included"] == 12
    assert session["metadata"]["source_refs_included"] == 12
    assert session["metadata"]["source_context_truncated"] is True


def test_requested_prompt_includes_follow_up_memory_context():
    prompt = app._requested_prompt(
        {
            "prompt": "make this specific to AEC consulting",
            "change_intent": "update",
            "memory_context": {
                "scope": {"type": "branch", "node_id": "aec-root"},
                "graph_context": {
                    "nodes": [{"id": "aec-root", "title": "Consulting Offer"}],
                    "edges": [],
                },
                "source_refs": [{"document_id": "doc-aec", "chunk_id": "chunk-1"}],
                "prior_draft_session": {
                    "session_id": "session-aec",
                    "latest_revision_id": "revision-aec-1",
                },
            },
        }
    )

    assert "Use this follow-up AI memory while answering." in prompt
    assert "Change intent: update" in prompt
    assert '"node_id": "aec-root"' in prompt
    assert '"session_id": "session-aec"' in prompt
    assert "make this specific to AEC consulting" in prompt


def test_generated_draft_session_stores_visible_prompt_not_follow_up_memory():
    request = {
        "prompt": "Improve this flowchart with source-backed review notes.",
        "change_intent": "update",
        "memory_context": {
            "scope": {"type": "workspace"},
            "graph_context": {
                "nodes": [{"id": "root", "title": "Root"}],
                "edges": [],
            },
        },
    }
    provider = FixtureDocMapAIProvider(draft_response_json())

    session = generate_ai_draft_session_with_provider(
        sample_graph(),
        workspace_id="workspace-1",
        prompt=app._requested_prompt(request),
        display_prompt=app._display_prompt(request),
        scope={"type": "workspace"},
        provider=provider,
    )

    provider_prompt = request_prompt_text(provider)
    assert "Use this follow-up AI memory while answering." in provider_prompt
    assert "Improve this flowchart with source-backed review notes." in provider_prompt
    assert session["prompt_history"][0]["content"] == "Improve this flowchart with source-backed review notes."
    assert session["revisions"][0]["prompt"] == "Improve this flowchart with source-backed review notes."
    assert "Follow-up memory context JSON" not in session["prompt_history"][0]["content"]


def test_accept_snapshot_keeps_merge_update_nodes_when_saved_snapshot_is_stale():
    snapshot = app._append_accepted_graph_to_flow_snapshot(
        {
            "flow_id": "workspace-1",
            "flow_json": json.dumps({"nodes": [], "edges": [], "viewport": {}}),
        },
        {
            "accepted_node_ids": [],
            "accepted_edge_ids": [],
            "patch_operations": [{"op": "update_node", "node_id": "existing-root"}],
        },
        {
            "nodes": [
                {
                    "id": "existing-root",
                    "title": "Existing root updated by draft",
                    "summary": "The merge response retained the graph node even though it was not newly added.",
                    "node_type": "workflow",
                    "status": "needs_review",
                    "source_refs": [],
                    "metadata": {"position": {"x": 240, "y": 120}},
                }
            ],
            "edges": [],
        },
    )

    assert len(snapshot["nodes"]) == 1
    assert snapshot["nodes"][0]["id"] == "existing-root"
    assert snapshot["nodes"][0]["data"]["title"] == "Existing root updated by draft"


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
    cited_snapshot = next(node for node in accept_response["graph"]["nodes"] if node["id"] == "cited-branch")
    uncited_snapshot = next(node for node in accept_response["graph"]["nodes"] if node["id"] == "uncited-branch")
    assert cited_snapshot["type"] == "response"
    assert cited_snapshot["data"]["title"] == "Draft branch"
    assert cited_snapshot["data"]["body"] == "Proposed branch"
    assert cited_snapshot["data"]["source_refs"] == [{"document_id": "doc-1"}]
    assert cited_snapshot["data"]["data"]["summ"] == "Proposed branch"
    assert cited_snapshot["data"]["data"]["source_refs"] == [{"document_id": "doc-1"}]
    assert uncited_snapshot["type"] == "response"
    assert uncited_snapshot["data"]["status"] == "needs_review"
    assert uncited_snapshot["data"]["data"]["status"] == "needs_review"
    assert accept_response["graph"]["viewport"]["zoom"] > 0
    assert accept_response["graph"]["viewport"] != {}


def test_markdown_export_endpoints_use_accepted_article_artifacts(monkeypatch):
    graph = sample_graph()
    accepted_session = {
        "session_id": "session-article",
        "workspace_id": "workspace-1",
        "updated_at": "2026-05-17T01:00:00Z",
        "accept_history": [
            {
                "accepted_at": "2026-05-17T01:00:00Z",
                "accepted_artifacts": [
                    {
                        "id": "artifact-exec",
                        "artifact_type": "executive_summary",
                        "data": {
                            "title": "Leadership Brief",
                            "summary": "The workspace is ready for leadership review.",
                            "key_points": [],
                            "recommended_actions": [],
                            "risks": [],
                            "source_backed_appendix": [],
                            "assumptions": [],
                        },
                        "provenance": {
                            "evidence_mode": "uploaded_sources",
                            "citation_policy": "required",
                            "input_source_refs": [{"document_id": "doc-1"}],
                        },
                    },
                    {
                        "id": "artifact-news",
                        "artifact_type": "news_article",
                        "data": {
                            "headline": "Coffee Cart Launch Update",
                            "dek": "The launch plan is ready for review.",
                            "lede": "The team has a review-ready launch plan.",
                            "body": "",
                            "sections": [],
                            "quotes": [],
                            "fact_checks": [],
                            "source_refs": [],
                            "assumptions": ["Publish date still needs confirmation."],
                        },
                        "metadata": {
                            "evidence_mode": "sharepoint",
                            "citation_policy": "required",
                        },
                    },
                ],
            }
        ],
    }

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: graph)
    monkeypatch.setattr(app, "list_ai_draft_sessions_for_workspace", lambda flow_id: [accepted_session])

    executive = app.export_workspace_executive_markdown("workspace-1").body.decode("utf-8")
    article = app.export_workspace_news_article_markdown("workspace-1").body.decode("utf-8")

    assert "# Leadership Brief" in executive
    assert "ready for leadership review" in executive
    assert "Evidence: Uploaded sources | Citations required | 1 cited ref" in executive
    assert "# Coffee Cart Launch Update" in article
    assert "Evidence: SharePoint/internal | Citations required | 0 cited refs" in article
    assert "Publish date still needs confirmation." in article


def test_accepting_publishable_artifact_preserves_evidence_context():
    session = build_ai_draft_session(
        workspace_id="workspace-1",
        prompt="Create executive summary.",
        scope={"type": "workspace"},
        role="enterprise-readiness-planner",
        intent="create_stakeholder_review_package",
        draft_items=[],
        generated_artifacts=[
            {
                "id": "artifact-exec",
                "artifact_type": "executive_summary",
                "data": {
                    "title": "Leadership Brief",
                    "summary": "Approve the controlled pilot.",
                    "key_points": [],
                    "recommended_actions": [],
                    "risks": [],
                    "source_backed_appendix": [],
                    "assumptions": ["Pilot cost needs final validation."],
                },
                "source_refs": [{"document_id": "doc-1"}],
            }
        ],
    )
    session["revisions"][0]["metadata"].update(
        {"evidence_mode": "uploaded_sources", "citation_policy": "required"}
    )

    _graph, _session, result = accept_ai_draft_revision(sample_graph(), session)
    [artifact] = result["accepted_artifacts"]

    assert artifact["metadata"]["evidence_mode"] == "uploaded_sources"
    assert artifact["metadata"]["citation_policy"] == "required"
    assert artifact["provenance"]["evidence_mode"] == "uploaded_sources"
    assert artifact["provenance"]["citation_policy"] == "required"


def test_workspace_custom_prompt_draft_session_prefers_model_generation(monkeypatch):
    graph = sample_graph()
    persisted = {}
    calls = []

    def fake_save(session):
        persisted[session["session_id"]] = copy.deepcopy(session)
        return session

    def fake_generate(graph, **kwargs):
        calls.append(kwargs)
        return build_ai_draft_session(
            workspace_id=kwargs["workspace_id"],
            prompt=kwargs["prompt"],
            scope=kwargs["scope"],
            role=kwargs["role"],
            intent="create_graph_draft",
            draft_nodes=[
                {
                    "id": "draft_saas_model",
                    "title": "SaaS business model",
                    "summary": "Model-generated SaaS map.",
                    "node_type": "concept",
                    "status": "ai_generated",
                    "source_refs": [],
                    "metadata": {},
                },
                {
                    "id": "draft_saas_metrics",
                    "title": "Core SaaS metrics",
                    "summary": "ARR, MRR, NRR, churn, CAC, and payback.",
                    "node_type": "category",
                    "parent_id": "draft_saas_model",
                    "status": "ai_generated",
                    "source_refs": [],
                    "metadata": {},
                },
                {
                    "id": "draft_retention",
                    "title": "Retention and NRR",
                    "summary": "Track logo churn, revenue churn, and expansion.",
                    "node_type": "concept",
                    "parent_id": "draft_saas_metrics",
                    "status": "ai_generated",
                    "source_refs": [],
                    "metadata": {},
                },
            ],
            draft_edges=[
                {
                    "id": "draft_edge_model_metrics",
                    "source_node_id": "draft_saas_model",
                    "target_node_id": "draft_saas_metrics",
                    "relationship_type": "contains",
                    "metadata": {},
                },
                {
                    "id": "draft_edge_metrics_retention",
                    "source_node_id": "draft_saas_metrics",
                    "target_node_id": "draft_retention",
                    "relationship_type": "contains",
                    "metadata": {},
                },
            ],
            selected_model="gpt-5.4",
            model_reason="Fixture model generation.",
            metadata={"preview_mode": "responses_structured_draft", "provider": "fixture"},
        )

    monkeypatch.setattr(app, "get_workspace_graph_or_404", lambda flow_id: copy.deepcopy(graph))
    monkeypatch.setattr(app, "save_ai_draft_session", fake_save)
    monkeypatch.setattr(app, "generate_ai_draft_session_with_provider", fake_generate)

    session = app.create_ai_draft_session(
        "workspace-1",
        {
            "role": "workflow_mapper",
            "action": "custom_prompt",
            "intent": "custom_prompt",
            "prompt": "show a SAAS business model",
            "custom_prompt": "show a SAAS business model",
            "scope": {"type": "workspace"},
            "metadata": {
                "expansion_mode": "exploratory",
                "expansion_target": "whole_branch",
                "evidence_mode": "general_knowledge",
                "citation_policy": "not_required",
            },
        },
    )

    revision = session["revisions"][0]
    titles = [node["title"] for node in revision["draft_nodes"]]
    assert calls
    assert calls[0]["prompt"] == "show a SAAS business model"
    assert calls[0]["role"] == "workflow_mapper"
    assert calls[0]["model"] is None
    assert calls[0]["metadata"]["expansion_mode"] == "exploratory"
    assert calls[0]["metadata"]["expansion_target"] == "whole_branch"
    assert calls[0]["metadata"]["evidence_mode"] == "general_knowledge"
    assert calls[0]["metadata"]["citation_policy"] == "not_required"
    assert session["status"] == "drafting"
    assert session["selected_model"] == "gpt-5.4"
    assert session["metadata"]["preview_mode"] == "responses_structured_draft"
    assert session["ai_action_run"]["generated_node_ids"] == [
        "draft_saas_model",
        "draft_saas_metrics",
        "draft_retention",
    ]
    assert revision["draft_nodes"][0]["title"] == "SaaS business model"
    assert "Core SaaS metrics" in titles
    assert "Retention and NRR" in titles
    assert revision["metadata"]["ai_draft_session_contract_version"] == "1"


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
