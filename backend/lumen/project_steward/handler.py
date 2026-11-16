"""FastAPI router and narrow handlers for Project Steward.

Enforces genuine authenticated owner boundary conforming to Lumen auth conventions.
Does NOT register into shared API router; ready for coordinator integration.
Fails closed when auth dependencies or owner configuration are missing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import Project, ProjectSnapshot
from .insights import ProjectInsights
from .config import ProjectStewardSettings, get_steward_settings
from .registry import ProjectRegistry
from .github_client import ReadOnlyGitHubCollector

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    """Verified authenticated user from Supabase session."""
    id: str
    token: str


# Attempt to import production Lumen auth if installed
_has_production_lumen_auth = False
try:
    from lumen.auth import require_user as _prod_require_user, AuthUser as _ProdAuthUser  # type: ignore
    _has_production_lumen_auth = True
except ImportError:
    _prod_require_user = None


async def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> AuthUser:
    """Verify bearer token against Supabase Auth API; fails closed on missing service or invalid token."""
    if _has_production_lumen_auth and _prod_require_user:
        prod_user = await _prod_require_user(credentials)
        return AuthUser(id=prod_user.id, token=prod_user.token)

    if not credentials or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to Lumen first.",
        )

    # Fail closed if Supabase auth service configuration is missing
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local login service is unavailable (Supabase unconfigured).",
        )

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            resp = await client.get(
                settings.supabase_url.rstrip("/") + "/auth/v1/user",
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
            if resp.status_code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Your session expired. Sign in again.",
                )
            resp.raise_for_status()
            user_data = resp.json()
            if not isinstance(user_data, dict) or not user_data.get("id") or user_data.get("is_anonymous"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="A registered account is required.",
                )
            return AuthUser(id=user_data["id"], token=credentials.credentials)
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local login service is unavailable.",
        ) from exc


async def require_steward_owner(
    user: AuthUser = Depends(require_user),
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> AuthUser:
    """Enforce that caller is the explicitly configured workspace owner.

    FAILS CLOSED if owner identity is unconfigured or if caller does not match.
    """
    if not settings.owner_user_id or not settings.owner_user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project Steward owner identity is not configured. Access denied.",
        )
    if user.id != settings.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Project Steward access is restricted to the workspace owner.",
        )
    return user


_registry_instance: Optional[ProjectRegistry] = None


def get_registry(
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> ProjectRegistry:
    """Dependency provider for ProjectRegistry."""
    global _registry_instance
    if _registry_instance is None or _registry_instance.settings != settings:
        _registry_instance = ProjectRegistry(settings)
    return _registry_instance


def get_collector(
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> ReadOnlyGitHubCollector:
    """Dependency provider for ReadOnlyGitHubCollector."""
    return ReadOnlyGitHubCollector(settings)


router = APIRouter(prefix="/v0.1/project-steward", tags=["project-steward"])


@router.get("/snapshot", response_model=ProjectSnapshot)
async def get_project_snapshot(
    refresh: bool = Query(default=False, description="Whether to collect latest read-only GitHub evidence"),
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
    collector: ReadOnlyGitHubCollector = Depends(get_collector),
) -> ProjectSnapshot:
    """Return complete deterministic read-only project snapshot matching v1 contract."""
    if refresh and collector.is_enabled:
        await registry.ingest_github_evidence(collector)
    return registry.generate_snapshot()


@router.get("/projects", response_model=List[Project])
async def list_projects(
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
) -> List[Project]:
    """Return all registered projects sorted by priority and name."""
    return registry.list_projects()


@router.get("/projects/{project_id}", response_model=Project)
async def get_project(
    project_id: str,
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
) -> Project:
    """Return single project details or 404."""
    project = registry.get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    return project


@router.get("/projects/{project_id}/insights", response_model=Optional[ProjectInsights])
async def get_project_insights(
    project_id: str,
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
    collector: ReadOnlyGitHubCollector = Depends(get_collector),
) -> Optional[ProjectInsights]:
    """Return project insights (open PRs, commits, CI, activity, links) matching Claude's v1.1 model."""
    project = registry.get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    # If insights not populated and collector is enabled, attempt ingestion
    insights = registry.get_project_insights(project_id)
    if not insights and collector.is_enabled and project.repositories:
        await registry.ingest_github_evidence(collector, project_id=project_id)
        insights = registry.get_project_insights(project_id)
    return insights


@router.post("/refresh")
async def refresh_evidence(
    project_id: Optional[str] = Query(default=None),
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
    collector: ReadOnlyGitHubCollector = Depends(get_collector),
) -> Dict[str, Any]:
    """Trigger read-only GitHub evidence collection for allowlisted projects."""
    return await registry.ingest_github_evidence(collector, project_id=project_id)


@router.get("/health")
async def health(
    owner: AuthUser = Depends(require_steward_owner),
    settings: ProjectStewardSettings = Depends(get_steward_settings),
    registry: ProjectRegistry = Depends(get_registry),
) -> dict:
    """Return Project Steward component health and security status."""
    return {
        "status": "ok",
        "github_collector_enabled": settings.is_github_collector_enabled,
        "pinned_host": settings.github_api_host,
        "allowed_repositories_count": len(settings.allowed_repositories),
        "projects_count": len(registry.list_projects()),
        "freshness_policy_hours": settings.stale_threshold_hours,
    }
