from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any


DEFAULT_FAST_MODEL = os.getenv("openai_fast_model", "gpt-5.4-mini")
DEFAULT_CONTEXT_MODEL = os.getenv("openai_context_model", DEFAULT_FAST_MODEL)
DEFAULT_BALANCED_MODEL = os.getenv("openai_balanced_model", "gpt-5.4")
DEFAULT_DEEP_MODEL = os.getenv("openai_default_model", "gpt-5.4")
SUPPORTED_MODELS = frozenset(
    {
        DEFAULT_FAST_MODEL,
        DEFAULT_CONTEXT_MODEL,
        DEFAULT_BALANCED_MODEL,
        DEFAULT_DEEP_MODEL,
        "gpt-5.4-mini",
        "gpt-5.4",
        "gpt-5.5",
    }
)
MODEL_POLICY_ALIASES = {
    "speed": "speed",
    "fast": "speed",
    "context": "context",
    "context_only": "context",
    "read_only": "context",
    "lookup": "context",
    "balanced": "balanced",
    "auto": "balanced",
    "deep": "deep_review",
    "deep_review": "deep_review",
    "deep review": "deep_review",
    "explicit": "explicit_model",
    "explicit_model": "explicit_model",
    "explicit model": "explicit_model",
}

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
    policy: str = "balanced"


def normalize_model_name(model: str | None) -> str:
    requested = str(model or "").strip()
    if not requested:
        return ""
    if requested not in SUPPORTED_MODELS:
        allowed = ", ".join(sorted(SUPPORTED_MODELS))
        raise ValueError(f"Unsupported OpenAI model '{requested}'. Choose one of: {allowed}.")
    return requested


def normalize_model_policy(policy: str | None, *, requested_model: str | None = None) -> str:
    if requested_model:
        return "explicit_model"
    normalized = str(policy or "balanced").strip().lower().replace("-", "_")
    return MODEL_POLICY_ALIASES.get(normalized, "balanced")


def choose_openai_model(
    *,
    requested_model: str | None = None,
    model_policy: str | None = None,
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
            policy="explicit_model",
        )

    policy = normalize_model_policy(model_policy)
    if policy == "speed":
        return ModelDecision(
            model=DEFAULT_FAST_MODEL,
            tier="speed",
            reason="Speed policy selected the fast draft model.",
            tool_policy="responses_tools" if requires_tools else "none",
            policy=policy,
        )
    if policy == "context":
        return ModelDecision(
            model=DEFAULT_CONTEXT_MODEL,
            tier="context",
            reason="Context policy selected the lightweight read-only model.",
            tool_policy="responses_tools" if requires_tools else "none",
            policy=policy,
        )
    if policy == "deep_review":
        return ModelDecision(
            model=DEFAULT_DEEP_MODEL,
            tier="deep",
            reason="Deep Review policy selected the strongest review model.",
            tool_policy="responses_tools" if requires_tools else "none",
            policy=policy,
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
            policy=policy,
        )

    if requires_source_grounding or len(chunks) > 2 or chunk_text_chars > 7000 or has_deep_terms:
        return ModelDecision(
            model=DEFAULT_DEEP_MODEL,
            tier="deep",
            reason="Source-grounded, multi-chunk, validation, or architecture work gets the deep model.",
            policy=policy,
        )

    if has_fast_terms or len(content) < 1200:
        return ModelDecision(
            model=DEFAULT_FAST_MODEL,
            tier="fast",
            reason="Small/simple transform can use the fast model.",
            policy=policy,
        )

    return ModelDecision(
        model=DEFAULT_BALANCED_MODEL,
        tier="balanced",
        reason="Balanced policy selected the default draft model for low-risk generation.",
        policy=policy,
    )


def _terms(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z][A-Za-z0-9_/-]{2,}", text.lower()))
