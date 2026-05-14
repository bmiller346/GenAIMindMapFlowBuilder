import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from documents.ingestion import (
    DocumentIngestionError,
    build_source_document,
    chunk_source_segments,
    chunk_text,
    deterministic_chunk_id,
    source_segments_from_text,
    sanitize_filename,
    validate_upload_bytes,
)


def test_sanitize_filename_removes_paths_and_keeps_extension_lowercase():
    assert sanitize_filename("../Unsafe Report (Final).PDF") == "Unsafe-Report-Final.pdf"


def test_validate_upload_rejects_unsupported_extensions():
    with pytest.raises(DocumentIngestionError):
        validate_upload_bytes("demo.exe", b"not a document")


def test_source_document_metadata_is_hash_and_version_based():
    source = build_source_document("Notes.md", b"# Plan\n\nShip it.", version=2)

    assert source["filename"] == "Notes.md"
    assert source["type"] == "md"
    assert source["version"] == 2
    assert source["id"].startswith("src_")
    assert source["file_hash"]


def test_chunk_ids_are_deterministic_and_source_aware():
    source = build_source_document("Notes.md", b"# Heading\n\nFirst paragraph.\n\nSecond paragraph.")
    chunks = chunk_text("# Heading\n\nFirst paragraph.\n\nSecond paragraph.", source["id"])

    assert chunks
    assert chunks[0]["document_id"] == source["id"]
    assert chunks[0]["id"] == deterministic_chunk_id(source["id"], 0, chunks[0]["text"])
    assert chunks[0]["heading"] == "Heading"


def test_markdown_segments_preserve_heading_and_offsets():
    segments = source_segments_from_text("# Scope\n\nInstall conduit.\n\n## QA\n\nInspect labels.", "md")

    assert segments[0]["heading"] == "Scope"
    assert segments[0]["start_char"] == 0
    assert segments[-1]["heading"] == "QA"
    assert segments[-1]["end_char"] > segments[-1]["start_char"]


def test_chunk_source_segments_preserves_page_location():
    chunks = chunk_source_segments(
        [
            {
                "text": "Panel schedule requirements.\n\nBreaker naming standard.",
                "page": 4,
                "heading": "Electrical",
                "start_char": 10,
                "end_char": 64,
            }
        ],
        "src_demo_v1",
    )

    assert chunks[0]["page"] == 4
    assert chunks[0]["heading"] == "Electrical"
    assert chunks[0]["start_char"] == 10
