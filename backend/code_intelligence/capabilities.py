from __future__ import annotations

import os
from pathlib import Path
from typing import Any


ENABLE_ENV = "DOCMAP_ENABLE_CODE_INTELLIGENCE"
ROOTS_ENV = "DOCMAP_CODE_INTELLIGENCE_ROOTS"


class CodeIntelligenceCapabilityError(ValueError):
    pass


def code_intelligence_enabled() -> bool:
    return os.getenv(ENABLE_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def configured_code_intelligence_roots() -> list[Path]:
    raw_value = os.getenv(ROOTS_ENV, "")
    roots: list[Path] = []
    for item in re_split_roots(raw_value):
        try:
            roots.append(Path(item).expanduser().resolve())
        except OSError:
            continue
    return roots


def code_intelligence_capability_contract() -> dict[str, Any]:
    enabled = code_intelligence_enabled()
    roots = configured_code_intelligence_roots()
    local_reason_code = ""
    github_reason_code = ""
    if not enabled:
        local_reason_code = "not_enabled"
        github_reason_code = "not_enabled"
    elif not roots:
        local_reason_code = "no_allowlisted_roots"
    return {
        "contract_versions": {
            "capability_visibility": "1",
            "code_graph_relationship": "1",
        },
        "capabilities": {
            "docmap:developerMode": {
                "enabled": enabled,
                "source": "server_entitlement",
                "reason_code": github_reason_code,
            },
            "code_intelligence": {
                "enabled": enabled and bool(roots),
                "requires": ["docmap:developerMode"],
                "relationship_visibility": "hidden" if not enabled else "developer_only",
                "allowlisted_roots": [str(root) for root in roots] if enabled else [],
                "reason_code": local_reason_code,
            },
            "github_code_intelligence": {
                "enabled": enabled,
                "requires": ["docmap:developerMode", "github_byo_token"],
                "relationship_visibility": "hidden" if not enabled else "developer_only",
                "token_storage": "request_header_only",
                "writes_enabled": False,
                "reason_code": github_reason_code,
            },
        },
    }


def require_code_intelligence_enabled() -> None:
    if not code_intelligence_enabled():
        raise CodeIntelligenceCapabilityError("Code intelligence is disabled.")


def resolve_allowed_local_repo_root(requested_root: str | Path) -> Path:
    require_code_intelligence_enabled()
    roots = configured_code_intelligence_roots()
    if not roots:
        raise CodeIntelligenceCapabilityError("No code intelligence repo roots are allowlisted.")

    try:
        resolved = Path(requested_root).expanduser().resolve()
    except OSError as exc:
        raise CodeIntelligenceCapabilityError("Requested repo root is not accessible.") from exc

    if not resolved.exists() or not resolved.is_dir():
        raise CodeIntelligenceCapabilityError("Requested repo root is not a directory.")

    if not any(_is_within_root(resolved, allowed_root) for allowed_root in roots):
        raise CodeIntelligenceCapabilityError("Requested repo root is outside the code intelligence allowlist.")
    return resolved


def re_split_roots(raw_value: str) -> list[str]:
    return [item.strip() for item in raw_value.replace(";", os.pathsep).split(os.pathsep) if item.strip()]


def _is_within_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
