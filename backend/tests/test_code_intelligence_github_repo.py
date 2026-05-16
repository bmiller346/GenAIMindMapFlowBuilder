import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from code_intelligence import code_intelligence_to_markdown, scan_github_repo
from integrations.github import GitHubClient, GitHubClientError


class FakeGitHubClient:
    def __init__(self, files, token="ghp_SECRET_SENTINEL_123"):
        self.files = files
        self.token = token
        self.calls = []

    def get_recursive_tree(self, repo, ref):
        self.calls.append(("GET_TREE", repo, ref))
        return [
            {
                "path": path,
                "type": "blob",
                "sha": f"sha-{index:03d}",
                "size": len(text.encode("utf-8")),
            }
            for index, (path, text) in enumerate(self.files.items(), start=1)
        ]

    def get_blob_text(self, repo, sha):
        self.calls.append(("GET_BLOB", repo, sha))
        index = int(sha.rsplit("-", 1)[-1]) - 1
        return list(self.files.values())[index]


def test_scan_github_repo_uses_fake_client_and_never_echoes_token():
    client = FakeGitHubClient(
        {
            "src/app.py": "from src.service import run\n\n\ndef handler():\n    return run()\n",
            "src/service.py": "def run():\n    return {'ok': True}\n",
            ".env": "SECRET=do-not-emit\n",
            "node_modules/pkg/index.js": "export const ignored = true;\n",
        }
    )

    graph = scan_github_repo(client, repo="org/repo", ref="main")
    serialized = json.dumps(graph)

    assert graph["source_type"] == "github_repo"
    assert graph["repo"]["name"] == "org/repo"
    assert graph["repo"]["branch"] == "main"
    assert "ghp_SECRET_SENTINEL_123" not in serialized
    assert "do-not-emit" not in serialized
    assert {entry["path"] for entry in graph["files"]} == {"src/app.py", "src/service.py"}
    assert graph["metadata"]["skipped_files"]["by_reason"]["secret_path"] == 1
    assert graph["metadata"]["skipped_files"]["by_reason"]["ignored_path"] == 1
    assert all(call[0] in {"GET_TREE", "GET_BLOB"} for call in client.calls)

    app_node = next(node for node in graph["nodes"] if node["title"] == "src/app.py")
    source_ref = app_node["source_refs"][0]
    assert source_ref["source_type"] == "github_file"
    assert source_ref["repo"] == "org/repo"
    assert source_ref["branch"] == "main"
    assert source_ref["source_url"].startswith("https://github.com/org/repo/blob/main/src/app.py")


def test_scan_github_repo_honors_path_file_count_and_size_limits():
    client = FakeGitHubClient(
        {
            "src/a.py": "def a():\n    return 1\n",
            "src/too_big.py": "x = '" + ("a" * 200) + "'\n",
            "src/b.py": "def b():\n    return 2\n",
            "docs/readme.md": "# Docs\n",
        }
    )

    graph = scan_github_repo(
        client,
        repo="org/repo",
        ref="dev",
        path_prefix="src",
        max_files=2,
        max_file_bytes=80,
    )

    assert graph["repo"]["path_prefix"] == "src"
    assert {entry["path"] for entry in graph["files"]} == {"src/a.py", "src/b.py"}
    assert graph["metadata"]["skipped_files"]["by_reason"]["too_large"] == 1
    assert graph["metadata"]["skipped_files"]["by_reason"]["max_files_reached"] >= 1
    assert len([call for call in client.calls if call[0] == "GET_BLOB"]) == 2


def test_scan_github_repo_skips_unsafe_paths_without_fetching_blobs():
    client = FakeGitHubClient(
        {
            "../escape.py": "def bad():\n    return True\n",
            "C:/escape.py": "def drive():\n    return True\n",
            "src/app.py": "def app():\n    return True\n",
        }
    )

    graph = scan_github_repo(client, repo="org/repo", ref="main")

    assert {entry["path"] for entry in graph["files"]} == {"src/app.py"}
    assert graph["metadata"]["skipped_files"]["by_reason"]["unsafe_path"] == 2
    assert all(call[-1] != "sha-001" for call in client.calls if call[0] == "GET_BLOB")


def test_code_intelligence_markdown_report_includes_engineering_sections():
    client = FakeGitHubClient(
        {
            "package.json": '{"scripts":{"dev":"vite"},"dependencies":{"react":"^19.0.0"}}',
            "src/main.jsx": "import React from 'react';\n",
        }
    )
    graph = scan_github_repo(client, repo="org/repo", ref="main")

    markdown = code_intelligence_to_markdown(graph)

    assert "# org/repo Code Knowledge Graph" in markdown
    assert "## Architecture Map" in markdown
    assert "## Relationship Summary" in markdown
    assert "## Dependencies" in markdown
    assert "react" in markdown
    assert "## Entrypoints" in markdown


def test_github_client_uses_read_only_get_requests(monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "tree": [
                    {
                        "path": "app.py",
                        "type": "blob",
                        "sha": "abc123",
                        "size": 20,
                    }
                ]
            }

    def fake_get(url, headers, params, timeout):
        calls.append(
            {
                "method": "GET",
                "url": url,
                "headers": headers,
                "params": params,
                "timeout": timeout,
            }
        )
        return FakeResponse()

    import integrations.github.client as github_client_module

    monkeypatch.setattr(github_client_module.requests, "get", fake_get, raising=False)
    client = GitHubClient("ghp_SECRET_SENTINEL_123", base_url="https://api.github.test")

    tree = client.get_recursive_tree("org/repo", "main")

    assert tree[0]["path"] == "app.py"
    assert calls[0]["method"] == "GET"
    assert "/git/trees/main" in calls[0]["url"]
    assert calls[0]["headers"]["Authorization"] == "Bearer ghp_SECRET_SENTINEL_123"


def test_github_client_decodes_blob_text(monkeypatch):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "encoding": "base64",
                "content": base64.b64encode(b"def app():\n    return True\n").decode("ascii"),
            }

    def fake_get(url, headers, params, timeout):
        return FakeResponse()

    import integrations.github.client as github_client_module

    monkeypatch.setattr(github_client_module.requests, "get", fake_get, raising=False)
    client = GitHubClient("token", base_url="https://api.github.test")

    assert "def app" in client.get_blob_text("org/repo", "abc123")


def test_github_client_surfaces_structured_errors(monkeypatch):
    class FakeResponse:
        def __init__(self, status_code, message, headers=None):
            self.status_code = status_code
            self.headers = headers or {}
            self._message = message

        def json(self):
            return {"message": self._message}

    responses = [
        FakeResponse(401, "Bad credentials"),
        FakeResponse(403, "Resource not accessible by token"),
        FakeResponse(404, "Not Found"),
        FakeResponse(429, "rate limited", {"Retry-After": "42"}),
        FakeResponse(403, "API rate limit exceeded", {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "99"}),
    ]

    def fake_get(url, headers, params, timeout):
        return responses.pop(0)

    import integrations.github.client as github_client_module

    monkeypatch.setattr(github_client_module.requests, "get", fake_get, raising=False)
    client = GitHubClient("ghp_SECRET_SENTINEL_123", base_url="https://api.github.test")

    expected = [
        (401, "github_unauthorized", ""),
        (403, "github_forbidden", ""),
        (404, "github_repo_not_found", ""),
        (429, "github_rate_limited", "42"),
        (429, "github_rate_limited", "99"),
    ]
    for status_code, reason_code, retry_after in expected:
        with pytest.raises(GitHubClientError) as exc_info:
            client.get_recursive_tree("org/repo", "main")
        assert exc_info.value.status_code == status_code
        assert exc_info.value.reason_code == reason_code
        assert exc_info.value.retry_after == retry_after
        assert "ghp_SECRET_SENTINEL_123" not in str(exc_info.value)


def test_github_scan_endpoint_is_gated_and_does_not_echo_token(monkeypatch):
    testclient_module = pytest.importorskip("fastapi.testclient")
    import app

    sentinel = "ghp_SECRET_SENTINEL_123"
    client = testclient_module.TestClient(app.app)

    monkeypatch.delenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", raising=False)
    response = client.post(
        "/api/code-intelligence/github/scan",
        json={"owner": "org", "repo": "repo"},
        headers={"x-docmap-github-token": sentinel},
    )
    assert response.status_code == 403
    assert sentinel not in response.text

    def fake_scan(client_obj, **kwargs):
        return {
            "artifact_type": "code_knowledge_graph",
            "title": "org/repo Code Knowledge Graph",
            "source_type": "github_repo",
            "repo": {"name": kwargs["repo"], "branch": kwargs["ref"], "file_count": 0},
            "nodes": [],
            "edges": [],
            "files": [],
            "findings": [],
            "source_documents": [],
            "document_chunks": [],
            "reports": {},
            "metadata": {"visibility": "hidden_capability", "token_echoed": False},
        }

    monkeypatch.setenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", "true")
    monkeypatch.setattr(app, "scan_github_repo", fake_scan)
    response = client.post(
        "/api/code-intelligence/github/scan",
        json={"owner": "org", "repo": "repo", "ref": "main"},
        headers={"x-docmap-github-token": sentinel},
    )

    assert response.status_code == 200
    assert response.json()["source_type"] == "github_repo"
    assert sentinel not in response.text
