import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents.ingestion import (
    build_source_document,
    build_source_set_metadata,
    chunk_text,
    source_document_with_source_set_metadata,
)
from export.workspace_graph import (
    build_workspace_graph,
    graph_to_completeness_markdown,
    graph_to_completeness_review,
)
from graph.schemas import WorkspaceGraph


def test_workspace_graph_projects_source_library_from_components_and_citations():
    document_text = (
        "Electrical Scope\n\n"
        "Panel schedules must include breaker naming standards and QA review notes."
    )
    source_document = build_source_document("Electrical Scope.md", document_text.encode("utf-8"))
    chunks = chunk_text(document_text, source_document["id"], page=3)
    flow = {
        "_id": "workspace-sources",
        "flow_name": "Source Workspace",
        "summary": "",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "nodes": [
                    {
                        "id": "source-node",
                        "type": "dataSource",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "title": "Electrical Scope.md",
                            "source_refs": [{"document_id": source_document["id"]}],
                        },
                    },
                    {
                        "id": "task-node",
                        "type": "response",
                        "position": {"x": 240, "y": 0},
                        "data": {
                            "title": "Review panel schedules",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": source_document["id"],
                                    "page": 3,
                                    "section": "Electrical Scope",
                                    "chunk_id": chunks[0]["id"],
                                    "quote_snippet": "Panel schedules must include breaker naming standards.",
                                    "confidence": 0.9,
                                }
                            ],
                        },
                    },
                ],
                "edges": [{"id": "edge-1", "source": "source-node", "target": "task-node"}],
            }
        ),
    }
    components = [
        {
            "source_document_id": source_document["id"],
            "source_document": source_document,
            "document_chunks": chunks,
            "source_segments": [
                {
                    "text": document_text,
                    "page": 3,
                    "heading": "Electrical Scope",
                    "start_char": 0,
                    "end_char": len(document_text),
                }
            ],
        }
    ]

    graph = build_workspace_graph(flow, source_components=components)
    library = graph["source_library"]

    assert library["summary"] == {
        "document_count": 1,
        "citation_count": 2,
        "failure_count": 0,
    }
    assert library["citations"][1] == {
        "node_id": "task-node",
        "node_title": "Review panel schedules",
        "document_id": source_document["id"],
        "chunk_id": chunks[0]["id"],
        "page": 3,
        "section": "Electrical Scope",
        "quote_snippet": "Panel schedules must include breaker naming standards.",
        "confidence": 0.9,
    }
    assert library["documents"][0]["id"] == source_document["id"]
    assert library["documents"][0]["filename"] == "Electrical-Scope.md"
    assert library["documents"][0]["source_node_ids"] == ["source-node"]
    assert library["documents"][0]["cited_node_ids"] == ["source-node", "task-node"]
    assert library["documents"][0]["chunk_count"] == 1
    assert library["documents"][0]["segment_count"] == 1
    assert library["documents"][0]["coverage"] == {
        "cited_chunks": 1,
        "total_chunks": 1,
        "cited_pages": 1,
        "total_pages": 1,
    }
    assert library["documents"][0]["chunks"][0]["snippet"]
    assert library["documents"][0]["chunks"][0]["cited_by_count"] == 1
    WorkspaceGraph.model_validate(graph)


def test_workspace_graph_preserves_saved_source_library_without_components():
    flow = {
        "_id": "workspace-saved-sources",
        "flow_name": "Saved Source Workspace",
        "flow_json": json.dumps(
            {
                "source_library": {
                    "documents": [
                        {
                            "id": "src_saved_v1",
                            "filename": "Saved.md",
                            "type": "md",
                            "status": "uploaded",
                            "chunks": [
                                {
                                    "id": "chunk-1",
                                    "document_id": "src_saved_v1",
                                    "index": 0,
                                    "text": "Saved chunk text",
                                }
                            ],
                        }
                    ],
                    "failures": [
                        {
                            "document_id": "src_failed_v1",
                            "filename": "Bad.pdf",
                            "status": "failed",
                            "message": "Could not parse PDF.",
                        }
                    ],
                },
                "nodes": [
                    {
                        "id": "task-node",
                        "type": "response",
                        "data": {
                            "title": "Saved citation",
                            "node_type": "task",
                            "source_refs": [
                                {
                                    "document_id": "src_saved_v1",
                                    "chunk_id": "chunk-1",
                                    "page": 4,
                                }
                            ],
                        },
                    }
                ],
                "edges": [],
            }
        ),
    }

    graph = build_workspace_graph(flow)

    assert graph["source_library"]["summary"] == {
        "document_count": 1,
        "citation_count": 1,
        "failure_count": 1,
    }
    assert graph["source_library"]["documents"][0]["coverage"]["cited_chunks"] == 1
    assert graph["source_library"]["documents"][0]["chunks"][0]["snippet"] == "Saved chunk text"
    assert graph["source_library"]["failures"][0]["filename"] == "Bad.pdf"


def test_completeness_review_projects_domain_coverage_from_sources_and_graph():
    document_text = (
        "Naming conventions\n\n"
        "Naming conventions must use discipline prefix codes.\n\n"
        "QA/QC\n\n"
        "QA/QC review process requires model checks before issue.\n\n"
        "Legacy templates\n\n"
        "The old template standard is deprecated and superseded."
    )
    source_document = build_source_document("BIM Standards.md", document_text.encode("utf-8"))
    chunks = chunk_text(document_text, source_document["id"], page=2)
    flow = {
        "_id": "workspace-completeness",
        "flow_name": "BIM Standards Review",
        "summary": "Review standards completeness.",
        "flow_type": "mind_map",
        "flow_json": json.dumps(
            {
                "workspace_brief": {
                    "domain_context": "Revit BIM standards",
                    "expected_coverage": [
                        "Naming conventions",
                        "QA/QC review process",
                        "Training and support",
                    ],
                },
                "nodes": [
                    {
                        "id": "source-node",
                        "type": "dataSource",
                        "data": {
                            "title": "BIM Standards.md",
                            "source_refs": [{"document_id": source_document["id"]}],
                        },
                    },
                    {
                        "id": "naming-1",
                        "type": "response",
                        "data": {
                            "title": "Naming conventions",
                            "summary": "Discipline prefix codes are required.",
                            "node_type": "requirement",
                            "source_refs": [
                                {
                                    "document_id": source_document["id"],
                                    "page": 2,
                                    "section": "Naming conventions",
                                    "chunk_id": chunks[0]["id"],
                                    "quote_snippet": "Naming conventions must use discipline prefix codes.",
                                    "confidence": 0.9,
                                }
                            ],
                        },
                    },
                    {
                        "id": "naming-2",
                        "type": "response",
                        "data": {
                            "title": "Naming conventions",
                            "summary": "Duplicate draft branch.",
                            "node_type": "requirement",
                        },
                    },
                ],
                "edges": [
                    {"id": "edge-source-naming", "source": "source-node", "target": "naming-1"},
                    {"id": "edge-naming-duplicate", "source": "naming-1", "target": "naming-2"},
                ],
            }
        ),
    }
    components = [
        {
            "source_document_id": source_document["id"],
            "source_document": source_document,
            "document_chunks": chunks,
            "source_segments": [
                {
                    "text": document_text,
                    "page": 2,
                    "heading": "BIM standards",
                    "start_char": 0,
                    "end_char": len(document_text),
                }
            ],
        }
    ]

    graph = build_workspace_graph(flow, source_components=components)
    review = graph["views"]["completeness_review"]

    assert [item["title"] for item in review["covered_areas"]] == ["Naming conventions"]
    assert [item["title"] for item in review["partial_areas"]] == ["QA/QC review process"]
    assert [item["title"] for item in review["missing_areas"]] == ["Training and support"]
    assert review["duplicate_conflicting_areas"][0]["candidate_type"] == "duplicate_node"
    assert any(
        item["candidate_type"] == "stale_source"
        for item in review["stale_deprecated_candidates"]
    )
    assert review["sme_questions"]
    assert review["recommended_roadmap"]
    assert graph_to_completeness_review(graph)["metadata"]["expected_area_count"] == 3
    assert "## Missing Areas" in graph_to_completeness_markdown(graph)


def test_source_library_projects_source_set_review_contract():
    flow = {
        "_id": "workspace-source-set-review",
        "flow_name": "Source Set Review",
        "flow_json": json.dumps(
            {
                "workspace_brief": {
                    "configured": True,
                    "desired_outputs": ["source_set_review"],
                    "expected_artifacts": ["SOP or workflow"],
                },
                "source_library": {
                    "documents": [
                        {
                            "id": "src_policy_old",
                            "filename": "Old BIM Policy.md",
                            "type": "md",
                            "file_hash": "same-hash",
                            "status": "deprecated",
                            "path": "standards/old/Old BIM Policy.md",
                        },
                        {
                            "id": "src_policy_copy",
                            "filename": "BIM Policy Copy.md",
                            "type": "md",
                            "file_hash": "same-hash",
                            "status": "uploaded",
                        },
                    ]
                },
                "nodes": [],
                "edges": [],
            }
        ),
    }

    graph = build_workspace_graph(flow)
    review = graph["source_library"]["source_set_review"]

    assert review["contract_version"] == "1"
    assert review["source_set"]["native_folder_upload"] is False
    assert review["file_inventory"][0]["classification"] == "standards_or_policy"
    assert review["duplicate_sources"][0]["document_ids"] == [
        "src_policy_copy",
        "src_policy_old",
    ]
    assert review["stale_sources"][0]["document_id"] == "src_policy_old"
    assert [item["artifact"] for item in review["missing_expected_artifacts"]] == [
        "SOP or workflow",
        "source-set review",
    ]


def test_source_library_marks_native_folder_upload_from_source_set_metadata():
    document_text = "Policy\n\nUse approved source-set procedures."
    source_set = build_source_set_metadata(
        ["Standards/Policy.md"],
        source_set_id="standards-folder",
        label="Standards folder",
    )
    source_document = source_document_with_source_set_metadata(
        build_source_document("Policy.md", document_text.encode("utf-8")),
        relative_path="Standards/Policy.md",
        source_set=source_set,
    )
    chunks = chunk_text(document_text, source_document["id"])
    flow = {
        "_id": "workspace-folder-sources",
        "flow_name": "Folder Sources",
        "flow_json": json.dumps({"nodes": [], "edges": []}),
    }

    graph = build_workspace_graph(
        flow,
        source_components=[
            {
                "_id": "component-folder-source",
                "source_document_id": source_document["id"],
                "source_document": source_document,
                "relative_path": "Standards/Policy.md",
                "folder": "Standards",
                "source_set": source_set,
                "document_chunks": chunks,
            }
        ],
    )

    review = graph["source_library"]["source_set_review"]

    assert review["source_set"]["native_folder_upload"] is True
    assert review["source_set"]["upload_mode"] == "native_folder_upload"
    assert review["source_set"]["source_set_ids"] == ["standards-folder"]
    assert review["file_inventory"][0]["relative_path"] == "Standards/Policy.md"
    assert graph["source_library"]["documents"][0]["source_set"]["label"] == "Standards folder"
