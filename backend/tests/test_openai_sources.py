import json
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

config_stub = types.ModuleType("config")


class MissingConfigurationError(RuntimeError):
    pass


def configuration_http_error(exc):
    return RuntimeError(str(exc))


def get_setting(name):
    return ""


def require_settings(*names):
    return True


def reset_request_settings():
    return None


def set_request_settings(*args, **kwargs):
    return None


config_stub.MissingConfigurationError = MissingConfigurationError
config_stub.configuration_http_error = configuration_http_error
config_stub.get_setting = get_setting
config_stub.require_settings = require_settings
config_stub.reset_request_settings = reset_request_settings
config_stub.set_request_settings = set_request_settings
sys.modules.setdefault("config", config_stub)

import openai_sources


VALID_GRAPH = {
    "nodes": [
        {
            "id": "source-1",
            "type": "dataSource",
            "data": {"content": "source"},
        },
        {
            "id": "topic-1",
            "type": "response",
            "data": {"title": "Topic", "data": {"summ": "A generated topic."}},
        },
    ],
    "edges": [{"source": "source-1", "target": "topic-1"}],
    "viewport": {},
}


def test_responses_json_posts_to_openai_responses_with_web_search(monkeypatch):
    requests = []

    monkeypatch.setattr(openai_sources, "_require_openai_api_key", lambda: "test-key")

    def fake_post(payload, api_key):
        requests.append((payload, api_key))
        return {"output_text": json.dumps(VALID_GRAPH)}

    monkeypatch.setattr(openai_sources, "_post_openai_json", fake_post)

    graph = openai_sources.generate_web_mindmap(
        url="https://example.com/docs",
        flow_id="flow-1",
        model="gpt-5.4",
    )

    assert graph["nodes"][0]["data"]["content"] == "source"
    assert graph["metadata"]["ai_provider"]["provider"] == "responses"
    assert graph["metadata"]["ai_provider"]["model"] == "gpt-5.4"
    assert requests[0][1] == "test-key"
    assert requests[0][0]["model"] == "gpt-5.4"
    assert requests[0][0]["tools"] == [{"type": "web_search"}]
    assert requests[0][0]["text"]["format"]["type"] == "json_schema"
    assert requests[0][0]["text"]["format"]["name"] == "tracespace_mindmap"
    assert requests[0][0]["text"]["format"]["strict"] is True
    assert requests[0][0]["text"]["format"]["schema"]["required"] == [
        "nodes",
        "edges",
        "viewport",
        "metadata",
    ]
    prompt_text = requests[0][0]["input"][0]["content"][0]["text"]
    assert "Canonical AI graph contract:" in prompt_text
    assert 'metadata.ai_graph_contract_version as "1"' in prompt_text


def test_web_search_uses_model_policy_when_model_is_not_explicit(monkeypatch):
    requests = []

    monkeypatch.setattr(openai_sources, "_require_openai_api_key", lambda: "test-key")

    def fake_post(payload, api_key):
        requests.append((payload, api_key))
        return {"output_text": json.dumps(VALID_GRAPH)}

    monkeypatch.setattr(openai_sources, "_post_openai_json", fake_post)

    graph = openai_sources.generate_web_mindmap(
        url="https://example.com/docs",
        flow_id="flow-1",
    )

    assert requests[0][0]["model"] == "gpt-5.5"
    assert graph["metadata"]["ai_provider"]["model_tier"] == "deep"
    assert graph["metadata"]["ai_provider"]["tool_policy"] == "responses_tools"


def test_extract_output_text_accepts_nested_responses_output():
    output = openai_sources._extract_output_text(
        {
            "output": [
                {
                    "content": [
                        {"type": "output_text", "text": json.dumps(VALID_GRAPH)}
                    ]
                }
            ]
        }
    )

    assert json.loads(output)["nodes"][1]["id"] == "topic-1"


def test_source_graph_generation_retries_schema_invalid_output(monkeypatch):
    requests = []

    monkeypatch.setattr(openai_sources, "_require_openai_api_key", lambda: "test-key")

    def fake_post(payload, api_key):
        requests.append(payload)
        if len(requests) == 1:
            return {
                "output_text": json.dumps(
                    {
                        "nodes": [
                            {
                                "id": "",
                                "type": "response",
                                "data": {},
                            }
                        ],
                        "edges": [{"source": "missing", "target": ""}],
                        "viewport": "bad",
                    }
                )
            }
        return {"output_text": json.dumps(VALID_GRAPH)}

    monkeypatch.setattr(openai_sources, "_post_openai_json", fake_post)

    graph, metadata = openai_sources.generate_document_mindmap(
        file_name="source.docx",
        source_type="docx",
        flow_id="flow-1",
        chunks=[
            {
                "id": "chunk-1",
                "text": "The portal setup requires a sandbox pilot and stakeholder review.",
                "heading": "Setup",
            }
        ],
        model="gpt-5.4",
    )

    assert graph["nodes"][1]["data"]["title"] == "Topic"
    assert metadata["model"] == "gpt-5.4"
    assert len(requests) == 2
    assert requests[1]["text"]["format"]["type"] == "json_schema"
    repair_prompt = requests[1]["input"][-1]["content"][0]["text"]
    assert "previous response did not satisfy" in repair_prompt
    assert "ai_mindmap.viewport: must be an object" in repair_prompt
    assert "Canonical AI graph contract:" in repair_prompt


def test_video_generation_uses_sampled_frames_without_cloud_upload(monkeypatch):
    requests = []

    monkeypatch.setattr(openai_sources, "_require_openai_api_key", lambda: "test-key")
    monkeypatch.setattr(openai_sources, "sample_video_frames", lambda *args, **kwargs: [b"frame"])
    monkeypatch.setattr(
        openai_sources,
        "extract_and_transcribe_video_audio",
        lambda *args, **kwargs: {
            "status": "transcribed",
            "transcript": "Discuss project risks and owner assignments.",
            "extractor": "ffmpeg",
        },
    )

    def fake_post(payload, api_key):
        requests.append(payload)
        return {"output_text": json.dumps(VALID_GRAPH)}

    monkeypatch.setattr(openai_sources, "_post_openai_json", fake_post)

    graph = openai_sources.generate_video_mindmap(
        file_name="clip.mp4",
        mime_type="video/mp4",
        contents=b"not-a-real-video",
        flow_id="flow-1",
        model="gpt-5.4",
    )

    content = requests[0]["input"][0]["content"]
    assert graph["metadata"]["ai_graph_contract_version"] == "1"
    assert graph["metadata"]["video_audio"]["status"] == "transcribed"
    assert graph["metadata"]["video_audio"]["extractor"] == "ffmpeg"
    assert content[0]["type"] == "input_text"
    assert "Video audio transcript" in content[0]["text"]
    assert "project risks" in content[0]["text"]
    assert "Canonical AI graph contract:" in content[0]["text"]
    assert 'status: "needs_review"' in content[0]["text"]
    assert "review_status" not in content[0]["text"]
    assert content[1]["type"] == "input_image"
    assert content[1]["image_url"].startswith("data:image/jpeg;base64,")


def test_video_audio_extraction_reports_missing_ffmpeg(monkeypatch):
    monkeypatch.setattr(openai_sources.shutil, "which", lambda command: None)

    result = openai_sources.extract_and_transcribe_video_audio(
        file_name="clip.mp4",
        contents=b"not-a-real-video",
    )

    assert result == {
        "status": "ffmpeg_unavailable",
        "transcript": "",
        "extractor": "",
    }


def test_resolve_ffmpeg_prefers_configured_packaged_path(monkeypatch, tmp_path):
    packaged_ffmpeg = tmp_path / "ffmpeg.exe"
    packaged_ffmpeg.write_text("")

    monkeypatch.setattr(
        openai_sources,
        "get_setting",
        lambda name: str(packaged_ffmpeg) if name == "DOCMAP_FFMPEG_PATH" else "",
    )
    monkeypatch.setattr(openai_sources.shutil, "which", lambda command: "")

    assert openai_sources._resolve_ffmpeg_path() == str(packaged_ffmpeg)
