import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_model_policy import choose_openai_model, normalize_model_name


def test_simple_low_risk_prompt_uses_fast_model():
    decision = choose_openai_model(task="mind map the colors of the rainbow", content="colors")

    assert decision.model == "gpt-5.4"
    assert decision.tier == "fast"


def test_source_grounded_review_uses_deep_model():
    decision = choose_openai_model(
        task="validate source_refs and derive technical graph",
        source_chunks=[{"text": "A" * 800}, {"text": "B" * 800}, {"text": "C" * 800}],
        requires_source_grounding=True,
    )

    assert decision.model == "gpt-5.5"
    assert decision.tier == "deep"


def test_explicit_model_selection_wins():
    decision = choose_openai_model(
        requested_model="gpt-5.4",
        task="validate source_refs and derive technical graph",
        requires_source_grounding=True,
    )

    assert decision.model == "gpt-5.4"
    assert decision.tier == "explicit"


def test_rejects_models_outside_docmap_policy():
    with pytest.raises(ValueError):
        normalize_model_name("gpt-4.1")
