from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any


DEFAULT_FAST_MODEL = os.getenv("openai_fast_model", "gpt-5.4")
DEFAULT_DEEP_MODEL = os.getenv("openai_default_model", "gpt-5.5")
SUPPORTED_MODELS = frozenset({DEFAULT_FAST_MODEL, DEFAULT_DEEP_MODEL})

DEEP_INTENT_TERMS = frozenset(
    {
        "architecture",
        "audit",
        "compliance",
        "contradiction",
        "derive",
        "design",
        "graph",
        "migration",
        "needs_review",
        "refactor",
        "source",
        "source_refs",
        "technical",
        "validate",
        "workflow",
    }
)

FAST_INTENT_TERMS = frozenset(
    {
        "color",
        "colors",
        "format",
        "rename",
        "rainbow",
        "summarize",
        "title",
        "typo",
    }
)


@dataclass(frozen=True)
class ModelDecision:
    model: str
    tier: str
    reason: str
    tool_policy: str = "none"


def normalize_model_name(model: str | None) -> str:
    requested = str(model or "").strip()
    if not requested:
        return ""
    if requested not in SUPPORTED_MODELS:
        allowed = ", ".join(sorted(SUPPORTED_MODELS))
        raise ValueError(f"Unsupported OpenAI model '{requested}'. Choose one of: {allowed}.")
    return requested


def choose_openai_model(
    *,
    requested_model: str | None = None,
    task: str = "",
    content: str = "",
    source_chunks: list[dict[str, Any]] | None = None,
    requires_source_grounding: bool = False,
    requires_tools: bool = False,
) -> ModelDecision:
    explicit = normalize_model_name(requested_model)
    if explicit:
        return ModelDecision(
            model=explicit,
            tier="explicit",
            reason="User or workflow selected the model explicitly.",
            tool_policy="responses_tools" if requires_tools else "none",
        )

    tokens = _terms(f"{task}\n{content}")
    chunks = source_chunks or []
    chunk_text_chars = sum(len(str(chunk.get("text") or "")) for chunk in chunks if isinstance(chunk, dict))
    has_deep_terms = bool(tokens & DEEP_INTENT_TERMS)
    has_fast_terms = bool(tokens & FAST_INTENT_TERMS)

    if requires_tools:
        return ModelDecision(
            model=DEFAULT_DEEP_MODEL,
            tier="deep",
            reason="Tool-using workflows need stronger planning and error recovery.",
            tool_policy="responses_tools",
        )

    if requires_source_grounding or len(chunks) > 2 or chunk_text_chars > 7000 or has_deep_terms:
        return ModelDecision(
            model=DEFAULT_DEEP_MODEL,
            tier="deep",
            reason="Source-grounded, multi-chunk, validation, or architecture work gets the deep model.",
        )

    if has_fast_terms or len(content) < 1200:
        return ModelDecision(
            model=DEFAULT_FAST_MODEL,
            tier="fast",
            reason="Small/simple transform can use the fast model.",
        )

    return ModelDecision(
        model=DEFAULT_FAST_MODEL,
        tier="fast",
        reason="Defaulting to fast model for low-risk generation.",
    )


def _terms(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z][A-Za-z0-9_/-]{2,}", text.lower()))
