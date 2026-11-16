"""Configuration and security parameters for Project Steward backend."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional
from pydantic import BaseModel, Field

# Exact inventory of approved repositories under brettbaysinger-boop
ALLOWED_REPOSITORIES = [
    "brettbaysinger-boop/pest-control-platform",
    "brettbaysinger-boop/chorusfall",
    "brettbaysinger-boop/monarch-private",
    "brettbaysinger-boop/rattlesnake-website",
    "brettbaysinger-boop/pirates-game",
    "brettbaysinger-boop/bot-arenas",
    "brettbaysinger-boop/character-lab",
    "brettbaysinger-boop/raialume",
    "brettbaysinger-boop/lumen-app",
    "brettbaysinger-boop/raialume-memory-core",
    "brettbaysinger-boop/forge",
    "brettbaysinger-boop/forge-phase-b-r1",  # historical delivery drop, not production Forge
    "brettbaysinger-boop/kalshi-arena",
    "brettbaysinger-boop/kalshi-bot-arena",
    "brettbaysinger-boop/florabot1",
    "brettbaysinger-boop/FloraBot",
    "brettbaysinger-boop/buffett-bot-arena",
    "brettbaysinger-boop/sports-bot-arena",
    "brettbaysinger-boop/lumen-avatar-lab",
    "brettbaysinger-boop/private-companion",
    "brettbaysinger-boop/model-weight-editing",
    "brettbaysinger-boop/voicelist",
    "brettbaysinger-boop/lumen",
]


class ProjectStewardSettings(BaseModel):
    """Immutable settings for Project Steward."""

    # Server-side owner identifier. MUST be explicitly configured.
    # NO hardcoded default (e.g. "brett"); fails closed if None.
    owner_user_id: Optional[str] = Field(
        default_factory=lambda: os.getenv("PROJECT_STEWARD_OWNER_ID", os.getenv("LUMEN_OWNER_USER_ID"))
    )

    # Supabase authentication connection settings
    supabase_url: Optional[str] = Field(
        default_factory=lambda: os.getenv("SUPABASE_URL")
    )
    supabase_service_role_key: Optional[str] = Field(
        default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    # Server-side GitHub token. If None or empty, the collector is strictly disabled.
    # NEVER expose this token to clients, logs, PRs, or chat.
    github_token: Optional[str] = Field(
        default_factory=lambda: os.getenv("PROJECT_STEWARD_GITHUB_TOKEN", os.getenv("GITHUB_TOKEN"))
    )

    # Host pin: strictly pinned to official GitHub API host.
    github_api_host: str = "api.github.com"

    # Repository allowlist: exact approved repositories.
    allowed_repositories: List[str] = Field(
        default_factory=lambda: list(ALLOWED_REPOSITORIES)
    )

    # Network timeouts (seconds)
    connect_timeout_seconds: float = 5.0
    request_timeout_seconds: float = 10.0

    # Bounds on upstream responses
    max_pages: int = 2
    per_page: int = 30
    max_body_bytes: int = 1024 * 1024  # 1 MB

    # Freshness threshold (hours before evidence is considered stale)
    # Unified with UI 48-hour freshness policy.
    stale_threshold_hours: int = 48

    @property
    def is_github_collector_enabled(self) -> bool:
        """Returns True only when a valid server-side GitHub token is configured."""
        return bool(self.github_token and self.github_token.strip())


@lru_cache(maxsize=1)
def get_steward_settings() -> ProjectStewardSettings:
    """Return cached settings instance."""
    return ProjectStewardSettings()
