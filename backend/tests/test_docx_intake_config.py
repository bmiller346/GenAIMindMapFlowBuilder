import sys
from pathlib import Path
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi import UploadFile
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app


def test_docx_intake_role_is_optional():
    assert app.resolve_source_intake_role(None) == ""
    assert app.resolve_source_intake_role("") == ""
    assert app.build_source_intake_instruction(None, None) == ""


def test_docx_intake_accepts_explicit_strategic_advisor():
    assert app.resolve_source_intake_role("strategic-advisor") == "Strategic Advisor"
    instruction = app.build_source_intake_instruction(
        "strategic-advisor",
        "Focus on risks and decisions.",
    )

    assert "Selected intake role: Strategic Advisor." in instruction
    assert "User intake brief: Focus on risks and decisions." in instruction
    assert "Do not let role guidance override source-grounding" in instruction


def test_docx_intake_rejects_unknown_role():
    with pytest.raises(HTTPException) as exc_info:
        app.resolve_source_intake_role("mystery-persona")

    assert exc_info.value.status_code == 400
    assert "Unknown DOCX intake role" in exc_info.value.detail


def test_legacy_assistants_model_resolver_no_longer_downshifts_to_gpt_4_1():
    assert app.resolve_assistants_model(None) == "gpt-5.5"
    assert app.resolve_assistants_model("gpt-5.4") == "gpt-5.4"


def test_legacy_assistants_model_resolver_rejects_old_models():
    with pytest.raises(HTTPException) as exc_info:
        app.resolve_assistants_model("gpt-4.1")

    assert exc_info.value.status_code == 400
    assert "Unsupported OpenAI model 'gpt-4.1'" in exc_info.value.detail


def test_legacy_assistants_fallback_can_be_disabled(monkeypatch):
    monkeypatch.setenv("DOCMAP_ALLOW_LEGACY_ASSISTANTS", "false")

    with pytest.raises(HTTPException) as exc_info:
        app.require_legacy_assistants_fallback("docx", purpose="graph generation")

    assert exc_info.value.status_code == 503
    assert "DOCMAP_ALLOW_LEGACY_ASSISTANTS=true" in exc_info.value.detail


def test_legacy_assistants_fallback_defaults_to_disabled(monkeypatch):
    monkeypatch.delenv("DOCMAP_ALLOW_LEGACY_ASSISTANTS", raising=False)

    assert app.legacy_assistants_fallback_enabled() is False


def test_legacy_assistants_fallback_can_be_enabled(monkeypatch):
    monkeypatch.setenv("DOCMAP_ALLOW_LEGACY_ASSISTANTS", "true")

    assert app.legacy_assistants_fallback_enabled() is True


class FakeComponentCollection:
    def __init__(self, record):
        self.record = record
        self.updates = []

    def find_one(self, query):
        return self.record

    def update_one(self, query, update):
        self.updates.append((query, update))


def test_component_qa_uses_responses_context_without_assistants(monkeypatch):
    component_id = "665f1f77bcf86cd799439011"
    flow_id = "665f1f77bcf86cd799439012"
    fake_collection = FakeComponentCollection(
        {
            "_id": app.ObjectId(component_id),
            "flow_id": app.ObjectId(flow_id),
            "type": "docx",
            "document_chunks": [
                {
                    "id": "chunk-1",
                    "page": 2,
                    "heading": "Scope",
                    "text": "Use source-backed requirements.",
                }
            ],
            "persona_name": "Research Assistant",
            "instructions": "Be concise.",
        }
    )
    calls = []

    def fake_generate_component_answer(**kwargs):
        calls.append(kwargs)
        return {"summ": "Use source-backed requirements.", "df": [], "graph": ""}

    monkeypatch.setattr(app, "component_collection", fake_collection)
    monkeypatch.setattr(app, "generate_component_answer", fake_generate_component_answer)

    response = app.DOCX_QA(
        app.DOCXNodeQueryRequest(
            node_id="665f1f77bcf86cd799439013",
            query="What should we use?",
            flow_id=flow_id,
            component_id=component_id,
            request_type="question",
            workspace_brief={"goal": "Review source handling"},
        )
    )

    assert response[0].data["summ"] == "Use source-backed requirements."
    assert calls[0]["persona"] == "Research Assistant"
    assert "Use source-backed requirements." in calls[0]["context"]
    assert calls[0]["workspace_brief"]["goal"] == "Review source handling"
    assert calls[0]["model"] is None


def test_component_follow_up_uses_responses_and_updates_persona(monkeypatch):
    component_id = "665f1f77bcf86cd799439014"
    flow_id = "665f1f77bcf86cd799439015"
    fake_collection = FakeComponentCollection(
        {
            "_id": app.ObjectId(component_id),
            "flow_id": app.ObjectId(flow_id),
            "type": "pdf",
            "summary": "The source explains export validation.",
        }
    )
    calls = []

    def fake_follow_ups(**kwargs):
        calls.append(kwargs)
        return ["What validation runs before export?"]

    monkeypatch.setattr(app, "component_collection", fake_collection)
    monkeypatch.setattr(
        app,
        "generate_component_follow_up_questions",
        fake_follow_ups,
    )

    response = app.create_follow_up_questions(
        app.ComponentFollowUpQueryRequest(
            flow_id=flow_id,
            component_id=component_id,
            component_type="pdf",
            persona_name="Strategic Advisor",
            temperature=0.2,
            top_p=1,
            instructions="Find review questions.",
            model_name="gpt-5.4",
        )
    )

    assert response[0].data["question"] == "What validation runs before export?"
    assert response[-1].type == "question"
    assert calls[0]["persona"] == "Strategic Advisor"
    assert calls[0]["model"] == "gpt-5.4"
    assert fake_collection.updates[0][1]["$set"]["persona_name"] == "Strategic Advisor"


def test_docx_intake_brief_is_sanitized_and_limited():
    brief = app.clean_source_intake_value("  one\n\n two\tthree  ", max_length=9)

    assert brief == "one two t"


def test_prepare_source_upload_reuses_existing_component(monkeypatch):
    flow_id = ObjectId()
    source_document = {
        "id": "doc-existing",
        "filename": "sample.docx",
        "original_filename": "sample.docx",
        "type": "docx",
        "file_hash": "existing-hash",
        "version": 1,
    }
    existing_component = {
        "_id": ObjectId(),
        "source_document": source_document,
        "source_segments": [{"text": "Install conduit.", "heading": "Scope"}],
        "document_chunks": [{"id": "chk-1", "document_id": "doc-existing", "text": "Install conduit."}],
    }

    monkeypatch.setattr(
        app,
        "validate_upload_bytes",
        lambda filename, file_bytes: {
            "filename": "sample.docx",
            "original_filename": "sample.docx",
            "extension": "docx",
            "file_hash": "existing-hash",
            "size": len(file_bytes),
        },
    )
    monkeypatch.setattr(app.component_collection, "find_one", lambda query: existing_component)
    monkeypatch.setattr(app.component_collection, "count_documents", lambda query: 1)

    upload = UploadFile(filename="sample.docx", file=SimpleNamespace(
        seek=lambda position: None,
        read=lambda: b"fake-docx",
    ))

    context = app.prepare_source_upload(upload, str(flow_id), expected_extension="docx")

    assert context["reused_existing_source"] is True
    assert context["existing_component"] == existing_component
    assert context["source_document"]["id"] == "doc-existing"
    assert context["document_chunks"][0]["id"] == "chk-1"


def test_docx_component_rejects_pdf_before_processing(monkeypatch):
    token_checks = []

    monkeypatch.setattr(app, "get_upload_flow_or_400", lambda flow_id: {"flow_type": "manual"})
    monkeypatch.setattr(
        app,
        "is_within_gpt4o_token_limit",
        lambda file: token_checks.append(file) or True,
    )

    upload = UploadFile(filename="sample.pdf", file=SimpleNamespace(
        seek=lambda position: None,
        read=lambda: b"%PDF-1.4",
    ))

    with pytest.raises(HTTPException) as exc_info:
        app.create_docx_component(upload, flow_id=str(ObjectId()))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Only DOCX files are allowed."
    assert token_checks == []


def test_flow_snapshot_repair_marks_unsourced_ai_nodes_needs_review_on_save():
    snapshot = {
        "nodes": [
            {
                "id": "ai-node-1",
                "type": "response",
                "position": {"x": 0, "y": 0},
                "data": {
                    "title": "Generated child",
                    "status": "ai_generated",
                    "source_refs": [],
                    "data": {
                        "summ": "Generated without source support.",
                        "status": "ai_generated",
                        "source_refs": [],
                    },
                },
            }
        ],
        "edges": [],
        "viewport": {},
    }

    repaired = json.loads(
        app.repair_flow_snapshot_for_persistence(
            json.dumps(snapshot),
            flow_id="workspace-1",
            flow_name="Workspace",
            flow_type="automatic",
        )
    )

    data = repaired["nodes"][0]["data"]
    assert data["status"] == "needs_review"
    assert data["data"]["status"] == "needs_review"


def test_flow_snapshot_repair_preserves_source_refs_on_save():
    source_ref = {"document_id": "doc-1", "page": 2, "quote_snippet": "Use A"}
    snapshot = {
        "nodes": [
            {
                "id": "ai-node-1",
                "type": "response",
                "position": {"x": 0, "y": 0},
                "data": {
                    "title": "Source-backed child",
                    "status": "ai_generated",
                    "source_refs": [source_ref],
                    "data": {
                        "summ": "Generated with source support.",
                        "status": "ai_generated",
                        "source_refs": [source_ref],
                    },
                },
            }
        ],
        "edges": [],
        "viewport": {},
    }

    repaired = json.loads(
        app.repair_flow_snapshot_for_persistence(
            json.dumps(snapshot),
            flow_id="workspace-1",
            flow_name="Workspace",
            flow_type="automatic",
        )
    )

    data = repaired["nodes"][0]["data"]
    assert data["status"] == "ai_generated"
    assert data["source_refs"] == [source_ref]
    assert data["data"]["source_refs"] == [source_ref]


def test_flow_snapshot_accepts_valid_workspace_brief_on_save():
    snapshot = {
        "nodes": [],
        "edges": [],
        "workspace_brief": {
            "configured": True,
            "preset": "custom",
            "goal": "Build a cited implementation map.",
            "audience": "Reviewers",
            "domain_context": "Internal standards",
            "desired_outputs": ["mind_map", "tasks"],
            "source_mode": "source_plus_context",
            "assumptions_allowed": False,
            "output_style": "technical_reference_map",
            "node_types": ["standard", "task"],
            "review_policy": ["mark_uncited_needs_review"],
            "review_rules": "Escalate uncited requirements.",
        },
    }

    repaired = json.loads(app.repair_flow_snapshot_for_persistence(json.dumps(snapshot)))

    assert repaired["workspace_brief"]["configured"] is True
    assert repaired["workspace_brief"]["desired_outputs"] == ["mind_map", "tasks"]


def test_flow_snapshot_rejects_invalid_workspace_brief_on_save():
    snapshot = {
        "nodes": [],
        "edges": [],
        "workspace_brief": {
            "configured": "yes",
            "desired_outputs": ["mind_map", 7],
            "review_policy": "mark_uncited_needs_review",
        },
    }

    with pytest.raises(app.GraphSchemaError) as exc_info:
        app.repair_flow_snapshot_for_persistence(json.dumps(snapshot))

    assert "workspace_brief.configured: must be a boolean" in exc_info.value.errors
    assert "workspace_brief.desired_outputs.1: must be a string" in exc_info.value.errors
    assert "workspace_brief.review_policy: must be a list" in exc_info.value.errors
