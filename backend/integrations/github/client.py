from __future__ import annotations

import base64
from typing import Any

import requests

from integrations.common.auth import BearerTokenAuth


class GitHubClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        reason_code: str = "github_request_failed",
        retry_after: str = "",
    ):
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.retry_after = retry_after


class GitHubClient:
    """Read-only GitHub API client for BYO-token code intelligence scans."""

    def __init__(self, token: str, base_url: str = "https://api.github.com"):
        if not token.strip():
            raise GitHubClientError("GitHub token is required.")
        self.token = token
        self.base_url = base_url.rstrip("/")

    def get_recursive_tree(self, repo: str, ref: str) -> list[dict[str, Any]]:
        response = self._get(f"/repos/{repo}/git/trees/{ref}", params={"recursive": "1"})
        tree = response.get("tree", [])
        if not isinstance(tree, list):
            raise GitHubClientError("GitHub tree response did not include a file tree.")
        return [item for item in tree if isinstance(item, dict)]

    def get_blob_text(self, repo: str, sha: str) -> str:
        response = self._get(f"/repos/{repo}/git/blobs/{sha}")
        content = response.get("content", "")
        encoding = response.get("encoding", "")
        if encoding != "base64" or not isinstance(content, str):
            raise GitHubClientError("GitHub blob response is not base64 text.")
        return base64.b64decode(content).decode("utf-8", errors="replace")

    def _get(self, path: str, *, params: dict[str, str] | None = None) -> dict[str, Any]:
        response = requests.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            params=params or {},
            timeout=30,
        )
        if response.status_code >= 400:
            raise self._error_from_response(response)
        payload = response.json()
        if not isinstance(payload, dict):
            raise GitHubClientError("GitHub API response was not an object.")
        return payload

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/vnd.github+json",
            **BearerTokenAuth(self.token).as_headers(),
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _error_from_response(self, response: requests.Response) -> GitHubClientError:
        status_code = response.status_code
        retry_after = response.headers.get("Retry-After", "")
        rate_remaining = response.headers.get("X-RateLimit-Remaining", "")
        rate_reset = response.headers.get("X-RateLimit-Reset", "")
        reason_code = {
            401: "github_unauthorized",
            403: "github_forbidden",
            404: "github_repo_not_found",
            429: "github_rate_limited",
        }.get(status_code, "github_request_failed")

        message = f"GitHub API request failed with status {status_code}."
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        github_message = payload.get("message") if isinstance(payload, dict) else ""
        normalized_message = str(github_message or "").lower()
        if status_code == 403 and (
            rate_remaining == "0" or "rate limit" in normalized_message or "abuse" in normalized_message
        ):
            reason_code = "github_rate_limited"
            status_code = 429
            if not retry_after and rate_reset:
                retry_after = rate_reset
        if github_message and len(str(github_message)) <= 220:
            message = str(github_message)
        return GitHubClientError(
            message,
            status_code=status_code,
            reason_code=reason_code,
            retry_after=retry_after,
        )
