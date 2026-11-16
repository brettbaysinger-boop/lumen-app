"""Pydantic data models for Project Insights (proposed v1.1 extension).

Coordinated with Claude's PR #32 frontend contract (lib/project-steward/insights.ts).
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

PrReviewState = Literal["draft", "review_required", "changes_requested", "approved"]
CiState = Literal["passing", "failing", "pending", "none", "unknown"]
NextKind = Literal["owner_decision", "milestone"]
ActivityKind = Literal["commit", "pr", "issue", "ci", "deploy", "decision", "note"]
LinkKind = Literal["repo", "live", "issues", "docs"]

PR_REF_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#\d+$")
COMMIT_SHA_PATTERN = re.compile(r"^[a-f0-9]{7,40}$")


class OpenPr(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ref: str = Field(..., pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#\d+$")
    title: str = Field(..., min_length=1, max_length=300)
    review: PrReviewState
    opened_at: str
    updated_at: str
    head_sha: Optional[str] = Field(default=None)

    @field_validator("head_sha")
    @classmethod
    def validate_head_sha(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not COMMIT_SHA_PATTERN.match(v):
            raise ValueError("head_sha must be 7-40 hex chars")
        return v


class OpenPrsGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observed_at: str
    items: List[OpenPr] = Field(default_factory=list)


class CiEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: CiState
    branch: str = Field(..., max_length=120)
    run_ref: Optional[str] = Field(default=None, max_length=512)
    commit_sha: Optional[str] = Field(default=None)
    observed_at: str

    @field_validator("commit_sha")
    @classmethod
    def validate_commit_sha(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not COMMIT_SHA_PATTERN.match(v):
            raise ValueError("commit_sha must be 7-40 hex chars")
        return v


class LastCommit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    at: str
    branch: str = Field(..., max_length=120)
    ref: Optional[str] = Field(default=None, max_length=512)
    commit_sha: Optional[str] = Field(default=None)
    observed_at: str

    @field_validator("commit_sha")
    @classmethod
    def validate_commit_sha(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not COMMIT_SHA_PATTERN.match(v):
            raise ValueError("commit_sha must be 7-40 hex chars")
        return v


class LastDeploy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    at: str
    target: str = Field(..., max_length=120)
    ref: Optional[str] = Field(default=None, max_length=512)
    commit_sha: Optional[str] = Field(default=None)
    observed_at: str

    @field_validator("commit_sha")
    @classmethod
    def validate_commit_sha(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not COMMIT_SHA_PATTERN.match(v):
            raise ValueError("commit_sha must be 7-40 hex chars")
        return v


class NextStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: NextKind
    text: str = Field(..., min_length=1, max_length=240)
    ref: Optional[str] = Field(default=None, max_length=512)


class ActivityEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    at: str
    kind: ActivityKind
    text: str = Field(..., min_length=1, max_length=240)
    ref: Optional[str] = Field(default=None, max_length=512)


class ProjectLink(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LinkKind
    label: str = Field(..., min_length=1, max_length=60)
    url: str = Field(..., max_length=512)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Only https URLs are permitted")
        return v


class ProjectInsights(BaseModel):
    """Detailed activity, CI, and PR evidence for a project."""

    model_config = ConfigDict(extra="forbid")

    observed_at: str
    open_prs: Optional[OpenPrsGroup] = None
    last_commit: Optional[LastCommit] = None
    last_deploy: Optional[LastDeploy] = None
    ci: Optional[CiEvidence] = None
    next: List[NextStep] = Field(default_factory=list)
    activity: List[ActivityEvent] = Field(default_factory=list)
    links: List[ProjectLink] = Field(default_factory=list)
