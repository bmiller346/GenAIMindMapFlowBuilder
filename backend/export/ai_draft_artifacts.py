from copy import deepcopy


def artifact_export_data(artifact: dict) -> dict:
    data = deepcopy(artifact.get("data")) if isinstance(artifact.get("data"), dict) else {}
    for key in ("metadata", "provenance"):
        value = artifact.get(key)
        if value is not None and key not in data:
            data[key] = deepcopy(value)
    for key in ("source_refs", "assumptions"):
        value = artifact.get(key)
        if value is not None and not data.get(key):
            data[key] = deepcopy(value)
    return data


def select_latest_ai_draft_artifact(
    sessions: list[dict],
    artifact_types: set[str],
) -> dict | None:
    candidates: list[tuple[int, str, dict]] = []
    for session in sessions:
        if not isinstance(session, dict):
            continue
        for acceptance in session.get("accept_history", []):
            if not isinstance(acceptance, dict):
                continue
            accepted_at = str(acceptance.get("accepted_at") or session.get("updated_at") or "")
            for artifact in acceptance.get("accepted_artifacts", []):
                if _artifact_type_matches(artifact, artifact_types):
                    candidates.append((1, accepted_at, artifact))
        for revision in session.get("revisions", []):
            if not isinstance(revision, dict):
                continue
            created_at = str(revision.get("created_at") or session.get("updated_at") or "")
            for artifact in revision.get("generated_artifacts", []):
                if _artifact_type_matches(artifact, artifact_types):
                    candidates.append((0, created_at, artifact))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates[-1][2]


def _artifact_type_matches(artifact: dict, artifact_types: set[str]) -> bool:
    if not isinstance(artifact, dict):
        return False
    artifact_type = str(artifact.get("artifact_type") or artifact.get("type") or "")
    return artifact_type in artifact_types
