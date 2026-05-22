import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_model_policy import choose_openai_model, normalize_model_name, normalize_model_policy


def test_simple_low_risk_prompt_uses_fast_model():
    decision = choose_openai_model(task="mind map the colors of the rainbow", content="colors")

    assert decision.model == "gpt-5.4-mini"
    assert decision.tier == "fast"


def test_source_grounded_review_uses_deep_model():
    decision = choose_openai_model(
        task="validate source_refs and derive technical graph",
        source_chunks=[{"text": "A" * 800}, {"text": "B" * 800}, {"text": "C" * 800}],
        requires_source_grounding=True,
    )

    assert decision.model == "gpt-5.4"
    assert decision.tier == "deep"


def test_explicit_model_selection_wins():
    decision = choose_openai_model(
        requested_model="gpt-5.4",
        task="validate source_refs and derive technical graph",
        requires_source_grounding=True,
    )

    assert decision.model == "gpt-5.4"
    assert decision.tier == "explicit"
    assert decision.policy == "explicit_model"


def test_named_draft_model_policies_choose_expected_tiers():
    speed = choose_openai_model(model_policy="speed", task="create a quick outline")
    context = choose_openai_model(model_policy="context", task="answer from selected node context")
    deep = choose_openai_model(model_policy="deep_review", task="create a quick outline")
    balanced = choose_openai_model(model_policy="balanced", task="create a longer draft", content="x" * 2000)

    assert speed.model == "gpt-5.4-mini"
    assert speed.tier == "speed"
    assert speed.policy == "speed"
    assert context.model == "gpt-5.4-mini"
    assert context.tier == "context"
    assert deep.model == "gpt-5.4"
    assert deep.policy == "deep_review"
    assert balanced.model == "gpt-5.4"
    assert balanced.tier == "balanced"
    assert normalize_model_policy("Deep Review") == "deep_review"


def test_rejects_models_outside_docmap_policy():
    with pytest.raises(ValueError):
        normalize_model_name("gpt-4.1")


def test_allows_explicit_stronger_model_selection():
    assert normalize_model_name("gpt-5.4-mini") == "gpt-5.4-mini"
    assert normalize_model_name("gpt-5.5") == "gpt-5.5"
