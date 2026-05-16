from __future__ import annotations

import re
import hashlib
import tempfile
from pathlib import Path
from typing import Any

from integrations.github import GitHubClient

from .local_repo import (
    DEFAULT_IGNORE_PARTS,
    SUPPORTED_EXTENSIONS,
    _is_secret_path,
    scan_local_repo,
)


class GitHubRepoScanError(ValueError):
    pass


def scan_github_repo(
    client: GitHubClient,
    *,
    repo: str,
    ref: str = "main",
    path_prefix: str = "",
    max_files: int = 200,
    max_file_bytes: int = 256_000,
    large_file_line_threshold: int = 500,
) -> dict[str, Any]:
    if not re.match(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", repo):
        raise GitHubRepoScanError("GitHub repo must use owner/name format.")
    if max_files < 1:
        raise GitHubRepoScanError("max_files must be at least 1.")

    prefix = path_prefix.strip().strip("/")
    tree = client.get_recursive_tree(repo, ref)
    entries, skipped_files = _select_tree_entries(
        tree,
        path_prefix=prefix,
        max_files=max_files,
        max_file_bytes=max_file_bytes,
    )

    with tempfile.TemporaryDirectory(prefix="tracespace-github-") as temp_dir:
        root = Path(temp_dir)
        for entry in entries:
            relative_path = str(entry["path"])
            if not _safe_relative_path(relative_path):
                skipped_files = _record_skipped_file(skipped_files, "unsafe_path", relative_path)
                continue
            target = root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(client.get_blob_text(repo, str(entry["sha"])), encoding="utf-8")

        graph = scan_local_repo(
            root,
            repo_label=repo,
            max_file_bytes=max_file_bytes,
            large_file_line_threshold=large_file_line_threshold,
        )

    sha_by_path = {str(entry["path"]): str(entry["sha"]) for entry in entries}
    _mark_github_graph(graph, repo=repo, ref=ref, sha_by_path=sha_by_path)
    graph["source_type"] = "github_repo"
    graph["repo"] = {
        **graph.get("repo", {}),
        "name": repo,
        "branch": ref,
        "path_prefix": prefix,
        "file_count": len(entries),
        "skipped_file_count": skipped_files["total"],
    }
    graph["metadata"]["github"] = {
        "repo": repo,
        "branch": ref,
        "path_prefix": prefix,
        "token_echoed": False,
    }
    graph["metadata"]["skipped_files"] = skipped_files
    return graph


def _select_tree_entries(
    tree: list[dict[str, Any]],
    *,
    path_prefix: str,
    max_files: int,
    max_file_bytes: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    skipped_files = _empty_skipped_files()
    for item in tree:
        if item.get("type") != "blob":
            continue
        path = str(item.get("path", ""))
        if path_prefix and not (path == path_prefix or path.startswith(f"{path_prefix}/")):
            continue
        if not _safe_relative_path(path):
            skipped_files = _record_skipped_file(skipped_files, "unsafe_path", path)
            continue
        if _is_ignored_path(path):
            reason = "secret_path" if _is_secret_path(path) else "ignored_path"
            skipped_files = _record_skipped_file(skipped_files, reason, path)
            continue
        if Path(path).suffix.lower() not in SUPPORTED_EXTENSIONS:
            skipped_files = _record_skipped_file(skipped_files, "unsupported_extension", path)
            continue
        if int(item.get("size") or 0) > max_file_bytes:
            skipped_files = _record_skipped_file(skipped_files, "too_large", path)
            continue
        entries.append(item)
        if len(entries) >= max_files:
            remaining = [
                str(later.get("path", ""))
                for later in tree[tree.index(item) + 1 :]
                if later.get("type") == "blob"
            ]
            for remaining_path in remaining[:5]:
                skipped_files = _record_skipped_file(skipped_files, "max_files_reached", remaining_path)
            break
    return entries, skipped_files


def _is_ignored_path(path: str) -> bool:
    parts = Path(path).parts
    return (
        any(part in DEFAULT_IGNORE_PARTS for part in parts)
        or _is_secret_path(path)
    )


def _safe_relative_path(path: str) -> bool:
    candidate = Path(path)
    if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
        return False
    return ":" not in candidate.parts[0] if candidate.parts else False


def _empty_skipped_files() -> dict[str, Any]:
    return {
        "total": 0,
        "by_reason": {},
        "samples": {},
    }


def _record_skipped_file(skipped_files: dict[str, Any], reason: str, path: str) -> dict[str, Any]:
    skipped_files["total"] += 1
    skipped_files["by_reason"][reason] = skipped_files["by_reason"].get(reason, 0) + 1
    samples = skipped_files["samples"].setdefault(reason, [])
    if len(samples) < 5:
        samples.append(path)
    return skipped_files


def _mark_github_graph(
    graph: dict[str, Any],
    *,
    repo: str,
    ref: str,
    sha_by_path: dict[str, str],
) -> None:
    for document in graph.get("source_documents", []):
        path = document.get("filename", "")
        sha = sha_by_path.get(path, document.get("file_hash", ""))
        document["id"] = f"github:{repo}:{path}:{sha[:12]}"
        document["file_hash"] = sha
        metadata = document.setdefault("metadata", {})
        metadata["source_type"] = "github_file"
        metadata["repo"] = repo
        metadata["branch"] = ref
        metadata["sha"] = sha
        metadata["source_url"] = _github_url(repo, ref, path)

    for ref_payload in _iter_source_refs(graph):
        path = ref_payload.get("path", "")
        sha = sha_by_path.get(path, ref_payload.get("sha", ""))
        ref_payload["document_id"] = f"github:{repo}:{path}:{sha[:12]}"
        ref_payload["chunk_id"] = _chunk_id(ref_payload["document_id"], ref_payload.get("line_start"), ref_payload.get("line_end"))
        ref_payload["repo"] = repo
        ref_payload["branch"] = ref
        ref_payload["sha"] = sha
        ref_payload["source_type"] = "github_file"
        ref_payload["source_url"] = _github_url(
            repo,
            ref,
            path,
            line_start=ref_payload.get("line_start"),
            line_end=ref_payload.get("line_end"),
        )

    for chunk in graph.get("document_chunks", []):
        metadata = chunk.setdefault("metadata", {})
        path = metadata.get("path", "")
        sha = sha_by_path.get(path, "")
        chunk["document_id"] = f"github:{repo}:{path}:{sha[:12]}"
        chunk["id"] = _chunk_id(chunk["document_id"], metadata.get("line_start"), metadata.get("line_end"))
        metadata["repo"] = repo
        metadata["branch"] = ref
        metadata["sha"] = sha
        metadata["source_type"] = "github_file"
        metadata["source_url"] = _github_url(
            repo,
            ref,
            path,
            line_start=metadata.get("line_start"),
            line_end=metadata.get("line_end"),
        )


def _iter_source_refs(value: Any):
    if isinstance(value, dict):
        refs = value.get("source_refs")
        if isinstance(refs, list):
            for ref in refs:
                if isinstance(ref, dict):
                    yield ref
        for item in value.values():
            yield from _iter_source_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_source_refs(item)


def _github_url(
    repo: str,
    ref: str,
    path: str,
    *,
    line_start: Any = None,
    line_end: Any = None,
) -> str:
    url = f"https://github.com/{repo}/blob/{ref}/{path}"
    if line_start:
        url = f"{url}#L{line_start}"
        if line_end and line_end != line_start:
            url = f"{url}-L{line_end}"
    return url


def _chunk_id(document_id: str, line_start: Any = None, line_end: Any = None) -> str:
    digest = hashlib.sha256(f"{document_id}:L{line_start or 1}-L{line_end or line_start or 1}".encode("utf-8")).hexdigest()
    return f"code_chk_{digest[:20]}"
