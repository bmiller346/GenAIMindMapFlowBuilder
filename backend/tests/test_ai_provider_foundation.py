import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.providers import DocMapGenerationRequest, FixtureDocMapAIProvider
from ai.schemas import AI_DRAFT_REVISION_OUTPUT_SCHEMA
from ai.responses_client import (
    OpenAIResponsesDocMapProvider,
    build_responses_create_payload,
    post_openai_responses_json,
    response_output_text,
)


def _object_schema_paths(schema, path="$"):
    if not isinstance(schema, dict):
        return
    node_type = schema.get("type")
    is_object = node_type == "object" or (
        isinstance(node_type, list) and "object" in node_type
    )
    if is_object:
        yield path, schema
        for key, value in schema.get("properties", {}).items():
            yield from _object_schema_paths(value, f"{path}.properties.{key}")
    if node_type == "array" or (isinstance(node_type, list) and "array" in node_type):
        yield from _object_schema_paths(schema.get("items"), f"{path}.items")
    for combiner in ("anyOf", "oneOf", "allOf"):
        for index, option in enumerate(schema.get(combiner, []) or []):
            yield from _object_schema_paths(option, f"{path}.{combiner}[{index}]")


def test_build_responses_payload_uses_structured_outputs_shape():
    schema = {
        "type": "object",
        "properties": {"nodes": {"type": "array"}},
        "required": ["nodes"],
        "additionalProperties": False,
    }
    request = DocMapGenerationRequest(
        model="gpt-5.5",
        instructions="Return a DocMap JSON object.",
        input=[{"role": "user", "content": "Draft the workspace graph."}],
        response_schema=schema,
        schema_name="docmap_graph",
        metadata={"workspace_id": "workspace-1"},
    )

    payload = build_responses_create_payload(request)

    assert payload["model"] == "gpt-5.5"
    assert payload["instructions"] == "Return a DocMap JSON object."
    assert payload["input"] == [{"role": "user", "content": "Draft the workspace graph."}]
    assert payload["store"] is False
    assert payload["metadata"] == {"workspace_id": "workspace-1"}
    assert payload["text"]["format"] == {
        "type": "json_schema",
        "name": "docmap_graph",
        "strict": True,
        "schema": schema,
    }


def test_ai_draft_revision_schema_is_strict_for_responses_api():
    object_schemas = list(_object_schema_paths(AI_DRAFT_REVISION_OUTPUT_SCHEMA))

    assert object_schemas
    for path, object_schema in object_schemas:
        assert object_schema.get("additionalProperties") is False, path
        properties = object_schema.get("properties")
        required = object_schema.get("required")
        assert isinstance(properties, dict), path
        assert isinstance(required, list), path
        assert set(required) == set(properties.keys()), path
        for field in required:
            assert field in properties, f"{path}.{field}"


def test_fixture_provider_records_requests_and_returns_static_json():
    provider = FixtureDocMapAIProvider('{"nodes": [], "edges": []}')
    request = DocMapGenerationRequest(
        model="fixture-model",
        instructions="No network.",
        input="Generate.",
    )

    result = provider.generate_json(request)

    assert result.text == '{"nodes": [], "edges": []}'
    assert result.provider == "fixture"
    assert provider.requests == [request]


def test_openai_responses_provider_calls_injected_client_without_network():
    calls = []

    class FakeResponses:
        def create(self, **payload):
            calls.append(payload)
            return SimpleNamespace(output_text='{"nodes": []}')

    fake_client = SimpleNamespace(responses=FakeResponses())
    provider = OpenAIResponsesDocMapProvider(client=fake_client)

    result = provider.generate_json(
        DocMapGenerationRequest(
            model="gpt-5.5",
            instructions="Return JSON.",
            input="Generate a graph.",
        )
    )

    assert result.text == '{"nodes": []}'
    assert result.provider == "openai_responses"
    assert calls == [
        {
            "model": "gpt-5.5",
            "instructions": "Return JSON.",
            "input": "Generate a graph.",
            "store": False,
        }
    ]


def test_openai_responses_provider_falls_back_to_direct_http(monkeypatch):
    calls = []

    def fake_post(api_key, payload):
        calls.append((api_key, payload))
        return {"output_text": '{"nodes": []}', "model": "gpt-5.5"}

    fake_client = SimpleNamespace()
    monkeypatch.setattr(
        "ai.responses_client.post_openai_responses_json",
        fake_post,
    )
    provider = OpenAIResponsesDocMapProvider(client=fake_client, api_key="test-key")

    result = provider.generate_json(
        DocMapGenerationRequest(
            model="gpt-5.5",
            instructions="Return JSON.",
            input="Generate a graph.",
        )
    )

    assert result.text == '{"nodes": []}'
    assert result.model == "gpt-5.5"
    assert calls == [
        (
            "test-key",
            {
                "model": "gpt-5.5",
                "instructions": "Return JSON.",
                "input": "Generate a graph.",
                "store": False,
            },
        )
    ]


def test_response_output_text_falls_back_to_output_items():
    response = SimpleNamespace(
        output=[
            SimpleNamespace(
                content=[
                    SimpleNamespace(text='{"nodes":'),
                    SimpleNamespace(text=" []}"),
                ]
            )
        ]
    )

    assert response_output_text(response) == '{"nodes": []}'


def test_response_output_text_supports_raw_dict_responses():
    response = {
        "output": [
            {
                "content": [
                    {"text": '{"nodes":'},
                    {"text": " []}"},
                ]
            }
        ]
    }

    assert response_output_text(response) == '{"nodes": []}'
