"""Configuration and security parameters for Project Steward backend."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional
from pydantic import BaseModel, Field


class ProjectStewardSettings(BaseModel):
    """Immutable settings for Project Steward."""

    # Server-side owner identifier. Only this user can query Project Steward.
    owner_user_id: str = Field(
        default_factory=lambda: os.getenv("PROJECT_STEWARD_OWNER_ID", os.getenv("LUMEN_OWNER_USER_ID", "brett"))
    )

    # Server-side GitHub token. If None or empty, the collector is strictly disabled.
    # NEVER expose this token to clients, logs, PRs, or chat.
    github_token: Optional[str] = Field(
        default_factory=lambda: os.getenv("PROJECT_STEWARD_GITHUB_TOKEN", os.getenv("GITHUB_TOKEN"))
    )

    # Host pin: strictly pinned to official GitHub API host.
    github_api_host: str = "api.github.com"

    # Repository allowlist: only repositories matching these patterns may be queried.
    # Format: "owner/repo" or "owner/*"
    allowed_repositories: List[str] = Field(
        default_factory=lambda: [
            "brettbaysinger-boop/*",
        ]
    )

    # Network timeouts (seconds)
    connect_timeout_seconds: float = 5.0
    request_timeout_seconds: float = 10.0

    # Bounds on upstream responses
    max_pages: int = 2
    per_page: int = 30
    max_body_bytes: int = 512 * 1024  # 512 KB

    # Freshness threshold (hours before evidence is considered stale)
    stale_threshold_hours: int = 72

    @property
    def is_github_collector_enabled(self) -> bool:
        """Returns True only when a valid server-side GitHub token is configured."""
        return bool(self.github_token and self.github_token.strip())


@lru_cache(maxsize=1)
def get_steward_settings() -> ProjectStewardSettings:
    """Return cached settings instance."""
    return ProjectStewardSettings()
