"""Read-only GitHub evidence collector with strict security boundaries.

Security guarantees:
1. Disabled without server-side owner-provided credentials.
2. Read-only: only HTTP GET operations are supported.
3. Strict host pin: strictly pinned to https://api.github.com.
4. Strict repository allowlist: only approved repos/patterns can be queried.
5. No redirects: follow_redirects=False prevents SSRF.
6. Bounded pagination: page requests beyond max_pages are rejected.
7. Body limits: responses exceeding max_body_bytes are rejected.
8. Rate-limit resilience: 429/403 rate limits handled gracefully without leaking credentials.
9. Secret redaction: tokens are never logged or returned in error strings.
10. Fail closed: any invalid state or security violation aborts safely.
"""

from __future__ import annotations

import fnmatch
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

import httpx

from .config import ProjectStewardSettings, get_steward_settings

logger = logging.getLogger("lumen.project_steward.github")


PINNED_GITHUB_API_HOST = "api.github.com"


class ProjectStewardSecurityError(Exception):
    """Raised when an operation violates security boundaries."""


class GitHubCollectorDisabledError(Exception):
    """Raised when GitHub collector is called without configured credentials."""


class PaginationAbuseError(Exception):
    """Raised when pagination parameters exceed safety limits."""


class PayloadTooLargeError(Exception):
    """Raised when upstream payload exceeds byte limits."""


class MalformedPayloadError(Exception):
    """Raised when upstream API returns malformed JSON or unexpected structure."""


@dataclass
class CollectorResult:
    """Standard result container from GitHub collector queries."""

    status: Literal["ok", "disabled", "rate_limited", "timeout", "error", "security_denied"]
    data: Any = None
    error: Optional[str] = None
    observed_at: Optional[str] = None
    rate_limit_remaining: Optional[int] = None
    rate_limit_reset: Optional[int] = None


def is_repo_allowed(repo: str, allowlist: List[str]) -> bool:
    """Check if repository matches any pattern in the allowlist."""
    if not repo or "/" not in repo:
        return False
    parts = repo.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return False

    for pattern in allowlist:
        if fnmatch.fnmatchcase(repo, pattern):
            return True
    return False


def validate_api_url(url: str) -> None:
    """Validate that a URL uses HTTPS and strictly targets the pinned official GitHub API host."""
    parsed = urlparse(url)
    if parsed.scheme.lower() != "https":
        raise ProjectStewardSecurityError(f"Insecure scheme '{parsed.scheme}': only HTTPS is allowed.")
    if parsed.netloc.lower() != PINNED_GITHUB_API_HOST:
        raise ProjectStewardSecurityError(
            f"Forbidden host '{parsed.netloc}': host must be strictly pinned to {PINNED_GITHUB_API_HOST}."
        )


class ReadOnlyGitHubCollector:
    """Hardened, read-only client for collecting GitHub project evidence."""

    def __init__(self, settings: Optional[ProjectStewardSettings] = None, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.settings = settings or get_steward_settings()
        self.transport = transport

    @property
    def is_enabled(self) -> bool:
        return self.settings.is_github_collector_enabled

    def _get_headers(self) -> Dict[str, str]:
        if not self.is_enabled:
            raise GitHubCollectorDisabledError("GitHub collector is disabled: owner credentials missing.")
        # Token is only passed in Authorization header, never serialized or logged
        return {
            "Authorization": f"Bearer {self.settings.github_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Lumen-Project-Steward-Reader/1.0",
        }

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> CollectorResult:
        """Issue a strictly bounded, non-redirecting GET request to api.github.com."""
        now_iso = datetime.now(timezone.utc).isoformat()
        if not self.is_enabled:
            return CollectorResult(
                status="disabled",
                error="GitHub collector is disabled without owner-provided server credentials.",
                observed_at=now_iso,
            )

        # Normalize path
        if not path.startswith("/"):
            path = "/" + path
        url = f"https://{self.settings.github_api_host}{path}"

        timeout = httpx.Timeout(
            connect=self.settings.connect_timeout_seconds,
            read=self.settings.request_timeout_seconds,
            write=self.settings.request_timeout_seconds,
            pool=self.settings.connect_timeout_seconds,
        )

        try:
            validate_api_url(url)
            headers = self._get_headers()
            async with httpx.AsyncClient(
                transport=self.transport,
                follow_redirects=False,  # Strict SSRF prevention: do not follow redirects
                timeout=timeout,
            ) as client:
                response = await client.get(url, headers=headers, params=params)

                # Check for redirects (301, 302, 303, 307, 308)
                if response.status_code in (301, 302, 303, 307, 308):
                    raise ProjectStewardSecurityError(
                        f"Redirect response ({response.status_code}) rejected: redirects are forbidden."
                    )

                # Extract rate limit headers safely
                rl_remaining = response.headers.get("x-ratelimit-remaining")
                rl_reset = response.headers.get("x-ratelimit-reset")
                rem_int = int(rl_remaining) if rl_remaining and rl_remaining.isdigit() else None
                reset_int = int(rl_reset) if rl_reset and rl_reset.isdigit() else None

                # Handle rate limiting
                if response.status_code == 429 or (response.status_code == 403 and rem_int == 0):
                    return CollectorResult(
                        status="rate_limited",
                        error="GitHub API rate limit reached or throttled.",
                        observed_at=now_iso,
                        rate_limit_remaining=rem_int,
                        rate_limit_reset=reset_int,
                    )

                # Verify content length
                content_len = response.headers.get("content-length")
                if content_len and content_len.isdigit():
                    if int(content_len) > self.settings.max_body_bytes:
                        raise PayloadTooLargeError(
                            f"Response content length {content_len} exceeds max {self.settings.max_body_bytes} bytes."
                        )

                # Read response bytes with bounding
                content_bytes = response.content
                if len(content_bytes) > self.settings.max_body_bytes:
                    raise PayloadTooLargeError(
                        f"Response body length {len(content_bytes)} exceeds max {self.settings.max_body_bytes} bytes."
                    )

                if response.status_code == 404:
                    return CollectorResult(
                        status="error",
                        error="Resource not found.",
                        observed_at=now_iso,
                        rate_limit_remaining=rem_int,
                        rate_limit_reset=reset_int,
                    )

                if response.status_code not in (200, 201):
                    return CollectorResult(
                        status="error",
                        error=f"Upstream returned HTTP {response.status_code}",
                        observed_at=now_iso,
                        rate_limit_remaining=rem_int,
                        rate_limit_reset=reset_int,
                    )

                try:
                    payload = json.loads(content_bytes.decode("utf-8"))
                except Exception as exc:
                    raise MalformedPayloadError(f"Failed to parse upstream JSON: {exc}") from exc

                return CollectorResult(
                    status="ok",
                    data=payload,
                    observed_at=now_iso,
                    rate_limit_remaining=rem_int,
                    rate_limit_reset=reset_int,
                )

        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as exc:
            logger.warning("Timeout while contacting GitHub API (details redacted)")
            return CollectorResult(
                status="timeout",
                error="Connection timed out while contacting GitHub API.",
                observed_at=now_iso,
            )
        except ProjectStewardSecurityError as exc:
            logger.warning("Security boundary violation prevented: %s", str(exc))
            return CollectorResult(
                status="security_denied",
                error=str(exc),
                observed_at=now_iso,
            )
        except (PayloadTooLargeError, MalformedPayloadError) as exc:
            logger.warning("Payload error: %s", str(exc))
            return CollectorResult(
                status="error",
                error=str(exc),
                observed_at=now_iso,
            )
        except Exception as exc:
            # Redact any accidental credential leak
            msg = str(exc)
            if self.settings.github_token and self.settings.github_token in msg:
                msg = msg.replace(self.settings.github_token, "***REDACTED***")
            return CollectorResult(
                status="error",
                error=f"Network error: {msg}",
                observed_at=now_iso,
            )

    async def fetch_repository(self, repo: str) -> CollectorResult:
        """Fetch repository details for an allowlisted repository."""
        if not is_repo_allowed(repo, self.settings.allowed_repositories):
            raise ProjectStewardSecurityError(
                f"Repository '{repo}' is not permitted by strict allowlist."
            )
        return await self._get(f"/repos/{repo}")

    async def fetch_pull_requests(
        self, repo: str, state: str = "all", page: int = 1
    ) -> CollectorResult:
        """Fetch bounded pull requests for an allowlisted repository."""
        if not is_repo_allowed(repo, self.settings.allowed_repositories):
            raise ProjectStewardSecurityError(
                f"Repository '{repo}' is not permitted by strict allowlist."
            )
        if page > self.settings.max_pages:
            raise PaginationAbuseError(
                f"Page {page} exceeds allowed maximum pagination depth of {self.settings.max_pages}."
            )
        if page < 1:
            raise PaginationAbuseError("Page must be >= 1.")

        params = {
            "state": state,
            "per_page": min(self.settings.per_page, 100),
            "page": page,
        }
        return await self._get(f"/repos/{repo}/pulls", params=params)

    async def fetch_latest_commit(self, repo: str, ref: str = "main") -> CollectorResult:
        """Fetch latest commit SHA and timestamp for an allowlisted repository."""
        if not is_repo_allowed(repo, self.settings.allowed_repositories):
            raise ProjectStewardSecurityError(
                f"Repository '{repo}' is not permitted by strict allowlist."
            )
        return await self._get(f"/repos/{repo}/commits/{ref}")
