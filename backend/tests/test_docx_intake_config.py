import sys
from pathlib import Path
import json

import pytest
from fastapi import HTTPException

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


def test_legacy_assistants_paths_are_gated_by_default():
    with pytest.raises(HTTPException) as exc_info:
        app.require_legacy_assistants_enabled("component Q&A")

    assert exc_info.value.status_code == 410
    assert "legacy Assistants API path" in exc_info.value.detail
    assert "preview-first Ask AI" in exc_info.value.detail


def test_legacy_assistants_model_resolver_no_longer_downshifts_to_gpt_4_1():
    assert app.resolve_assistants_model(None) == "gpt-5.5"
    assert app.resolve_assistants_model("gpt-5.4") == "gpt-5.4"


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


def test_docx_intake_brief_is_sanitized_and_limited():
    brief = app.clean_source_intake_value("  one\n\n two\tthree  ", max_length=9)

    assert brief == "one two t"


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
