import json
import sys
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest

UploadFile = pytest.importorskip("fastapi").UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app
from bson import ObjectId
from documents.ingestion import (
    DocumentIngestionError,
    build_source_document,
    build_source_set_metadata,
    source_document_with_source_set_metadata,
)


def test_source_set_metadata_preserves_relative_folder_context():
    source_set = build_source_set_metadata(
        ["Standards/Policy.md", "Standards/SOPs/Install.txt"],
        source_set_id="Team Standards!",
        label="  Team standards folder  ",
    )
    source_document = build_source_document("Policy.md", b"Policy\n\nUse approved standards.")

    decorated = source_document_with_source_set_metadata(
        source_document,
        relative_path="../Standards/Policy.md",
        source_set=source_set,
    )

    assert source_set["id"] == "Team-Standards"
    assert source_set["label"] == "Team standards folder"
    assert source_set["root_folder"] == "Standards"
    assert source_set["native_folder_upload"] is True
    assert decorated["relative_path"] == "Standards/Policy.md"
    assert decorated["folder"] == "Standards"
    assert decorated["source_set_id"] == "Team-Standards"
    assert decorated["source_set"] == source_set


class FakeComponentCollection:
    def __init__(self):
        self.records = []

    def count_documents(self, query):
        filename = query.get("source_document.filename")
        return sum(
            1
            for record in self.records
            if record.get("source_document", {}).get("filename") == filename
        )

    def insert_one(self, record):
        inserted_id = ObjectId()
        self.records.append({**record, "_id": inserted_id})
        return SimpleNamespace(inserted_id=inserted_id)


def test_upload_workspace_source_set_returns_library_ready_sources(monkeypatch):
    flow_id = str(ObjectId())
    flow = {
        "_id": ObjectId(flow_id),
        "flow_name": "Source-set workspace",
        "flow_type": "manual",
        "flow_json": json.dumps({"nodes": [], "edges": []}),
    }
    fake_components = FakeComponentCollection()

    monkeypatch.setattr(app, "component_collection", fake_components)
    monkeypatch.setattr(app, "get_upload_flow_or_400", lambda requested_flow_id: flow)
    monkeypatch.setattr(app, "get_source_components", lambda requested_flow_id: [])

    files = [
        UploadFile(
            filename="Policy.md",
            file=BytesIO(b"Policy\n\nUse source-backed policy records."),
        ),
        UploadFile(
            filename="Install.txt",
            file=BytesIO(b"Install SOP\n\nCrews must record QA checks."),
        ),
        UploadFile(
            filename="Model.rvt",
            file=BytesIO(b"not currently source traceable"),
        ),
    ]

    response = app.upload_workspace_source_set(
        flow_id,
        files=files,
        relative_paths=[
            "Standards/Policy.md",
            "Standards/SOPs/Install.txt",
            "Models/Model.rvt",
        ],
        source_set_label="Standards",
    )

    assert response["source_set"]["native_folder_upload"] is True
    assert response["source_set"]["source_count"] == 2
    assert response["source_set"]["selected_count"] == 3
    assert response["source_set"]["skipped_count"] == 1
    assert response["skipped_sources"][0]["relative_path"] == "Models/Model.rvt"
    assert response["skipped_sources"][0]["reason_code"] == "unsupported_extension"
    assert [source["relative_path"] for source in response["uploaded_sources"]] == [
        "Standards/Policy.md",
        "Standards/SOPs/Install.txt",
    ]
    assert fake_components.records[0]["relative_path"] == "Standards/Policy.md"
    assert fake_components.records[0]["source_document"]["source_set"]["label"] == "Standards"
    assert (
        fake_components.records[0]["document_chunks"][0]["document_id"]
        == response["uploaded_sources"][0]["source_document_id"]
    )
    assert response["source_library"]["source_set_review"]["source_set"]["native_folder_upload"] is True


def test_source_set_upload_rejects_folder_with_no_source_traceable_documents():
    files = [
        UploadFile(filename="Model.rvt", file=BytesIO(b"model")),
        UploadFile(filename="Schedule.xlsx", file=BytesIO(b"spreadsheet")),
    ]

    try:
        app.prepare_source_set_uploads(
            files,
            flow_id=str(ObjectId()),
            relative_paths=["Models/Model.rvt", "Reports/Schedule.xlsx"],
        )
    except DocumentIngestionError as exc:
        assert "No source-traceable documents" in str(exc)
    else:
        raise AssertionError("Expected source-set upload with no supported files to fail.")
