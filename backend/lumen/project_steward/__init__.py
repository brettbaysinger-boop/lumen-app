"""Project Steward: deterministic read-only project registry & evidence collector."""

from .models import (
    Project,
    ProjectSnapshot,
    Source,
    SourceKind,
    PriorityLevel,
    ProjectState,
    DeploymentStatus,
    EvidenceLevel,
)
from .insights import (
    ProjectInsights,
    OpenPr,
    OpenPrsGroup,
    CiEvidence,
    LastCommit,
    LastDeploy,
    NextStep,
    ActivityEvent,
    ProjectLink,
)
from .config import ProjectStewardSettings, get_steward_settings, ALLOWED_REPOSITORIES
from .github_client import (
    ReadOnlyGitHubCollector,
    CollectorResult,
    ProjectStewardSecurityError,
    GitHubCollectorDisabledError,
    PaginationAbuseError,
    PayloadTooLargeError,
    MalformedPayloadError,
)
from .registry import ProjectRegistry
from .handler import router, require_steward_owner, require_user, AuthUser

__all__ = [
    "Project",
    "ProjectSnapshot",
    "Source",
    "SourceKind",
    "PriorityLevel",
    "ProjectState",
    "DeploymentStatus",
    "EvidenceLevel",
    "ProjectInsights",
    "OpenPr",
    "OpenPrsGroup",
    "CiEvidence",
    "LastCommit",
    "LastDeploy",
    "NextStep",
    "ActivityEvent",
    "ProjectLink",
    "ProjectStewardSettings",
    "get_steward_settings",
    "ALLOWED_REPOSITORIES",
    "ReadOnlyGitHubCollector",
    "CollectorResult",
    "ProjectStewardSecurityError",
    "GitHubCollectorDisabledError",
    "PaginationAbuseError",
    "PayloadTooLargeError",
    "MalformedPayloadError",
    "ProjectRegistry",
    "router",
    "require_steward_owner",
    "require_user",
    "AuthUser",
]
