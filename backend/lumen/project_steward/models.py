"""Pydantic data models for Project Steward v1 read-only project snapshot.

Strictly conforms to contracts/project-steward/project-snapshot.v1.schema.json.
additionalProperties: false is enforced on all models.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Allowed enums matching contract schema exactly
SourceKind = Literal[
    "git_repo",
    "git_pr",
    "git_issue",
    "owner_approved_memory",
    "host_receipt",
    "owner_report",
    "other",
]

PriorityLevel = Literal[
    "p0",
    "p1",
    "p2",
    "p3",
    "on_hold",
    "unranked",
]

ProjectState = Literal[
    "planned",
    "coded",
    "tested",
    "owner_accepted",
    "blocked",
    "on_hold",
    "unknown",
]

DeploymentStatus = Literal[
    "verified_current",
    "historically_verified",
    "reported",
    "not_deployed",
    "unknown",
]

EvidenceLevel = Literal[
    "host_verified",
    "git_verified",
    "owner_report",
    "historical",
    "unverified",
]

ISO_DATETIME_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
COMMIT_SHA_PATTERN = re.compile(r"^[a-f0-9]{7,40}$")
PROJECT_ID_PATTERN = re.compile(r"^[a-z0-9-]{2,64}$")


def _validate_iso_datetime(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not ISO_DATETIME_PATTERN.match(value):
        raise ValueError(f"Value '{value}' must be an ISO-8601 date-time string (e.g. 2026-11-15T18:00:00Z)")
    # Also parse with standard datetime to ensure calendar validity
    clean_val = value.replace("Z", "+00:00")
    try:
        datetime.fromisoformat(clean_val)
    except Exception as exc:
        raise ValueError(f"Invalid calendar date-time '{value}': {exc}") from exc
    return value


class Source(BaseModel):
    """Source reference supporting a project claim or evidence."""

    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    ref: str = Field(..., min_length=1, max_length=512)
    observed_at: str
    commit_sha: Optional[str] = Field(default=None)

    @field_validator("observed_at")
    @classmethod
    def validate_observed_at(cls, v: str) -> str:
        res = _validate_iso_datetime(v)
        if res is None:
            raise ValueError("observed_at cannot be null on Source")
        return res

    @field_validator("commit_sha")
    @classmethod
    def validate_commit_sha(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not COMMIT_SHA_PATTERN.match(v):
            raise ValueError("commit_sha must match pattern ^[a-f0-9]{7,40}$")
        return v


class Project(BaseModel):
    """Deterministic project entity distinct from code repositories."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., pattern=r"^[a-z0-9-]{2,64}$")
    name: str = Field(..., min_length=1, max_length=100)
    priority: PriorityLevel
    state: ProjectState
    deployment: DeploymentStatus
    evidence_level: EvidenceLevel
    summary: Optional[str] = Field(default=None, max_length=1000)
    repositories: list[str] = Field(default_factory=list)
    blocked_by: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    observed_at: Optional[str] = None

    @field_validator("observed_at")
    @classmethod
    def validate_observed_at(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_datetime(v)

    @field_validator("repositories")
    @classmethod
    def validate_repositories(cls, repos: list[str]) -> list[str]:
        seen = set()
        for repo in repos:
            if not isinstance(repo, str) or not REPO_PATTERN.match(repo):
                raise ValueError(
                    f"Repository '{repo}' must match pattern ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
                )
            if repo in seen:
                raise ValueError(f"Duplicate repository '{repo}' is not permitted")
            seen.add(repo)
        return repos

    @field_validator("blocked_by")
    @classmethod
    def validate_blocked_by(cls, blockers: list[str]) -> list[str]:
        for b in blockers:
            if len(b) > 240:
                raise ValueError(f"Blocker exceeds 240 characters: '{b[:30]}...'")
        return blockers

    @model_validator(mode="after")
    def validate_deployment_coupling(self) -> Project:
        """Enforce strict coupling: verified_current requires host_verified and a host_receipt source."""
        if self.deployment == "verified_current":
            if self.evidence_level != "host_verified":
                raise ValueError(
                    "deployment 'verified_current' strictly requires evidence_level 'host_verified'"
                )
            has_host_receipt = any(s.kind == "host_receipt" for s in self.sources)
            if not has_host_receipt:
                raise ValueError(
                    "deployment 'verified_current' strictly requires at least one source with kind 'host_receipt'"
                )
        return self


class ProjectSnapshot(BaseModel):
    """Project Steward v1 read-only project snapshot."""

    model_config = ConfigDict(extra="forbid")

    version: Literal["1.0"] = "1.0"
    generated_at: str
    projects: list[Project]

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, v: str) -> str:
        res = _validate_iso_datetime(v)
        if res is None:
            raise ValueError("generated_at cannot be null")
        return res


class ProjectV11(Project):
    """Project Steward v1.1 project with optional inline insights."""

    insights: Optional[Any] = None


class ProjectSnapshotV11(BaseModel):
    """Canonical Project Steward v1.1 read-only project snapshot."""

    model_config = ConfigDict(extra="forbid")

    version: Literal["1.1"] = "1.1"
    generated_at: str
    stale_after_seconds: int = 172800  # 48 hours
    projects: list[ProjectV11]

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, v: str) -> str:
        res = _validate_iso_datetime(v)
        if res is None:
            raise ValueError("generated_at cannot be null")
        return res
