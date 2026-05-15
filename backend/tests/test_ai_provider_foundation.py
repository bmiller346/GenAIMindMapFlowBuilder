import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.providers import DocMapGenerationRequest, FixtureDocMapAIProvider
from ai.responses_client import (
    OpenAIResponsesDocMapProvider,
    build_responses_create_payload,
    response_output_text,
)


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
