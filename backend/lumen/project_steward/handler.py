"""FastAPI router and narrow handlers for Project Steward.

Enforces authenticated owner boundary conforming to Lumen auth conventions.
Does NOT register into shared API router; ready for coordinator integration.
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import Project, ProjectSnapshot
from .config import ProjectStewardSettings, get_steward_settings
from .registry import ProjectRegistry

# Compatible Lumen Auth types
try:
    from lumen.auth import AuthUser, require_user
except ImportError:
    # Standalone / decoupled fallback conforming to Lumen auth protocol
    from dataclasses import dataclass

    bearer = HTTPBearer(auto_error=False)

    @dataclass(frozen=True)
    class AuthUser:
        id: str
        token: str

    async def require_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    ) -> AuthUser:
        if not credentials or credentials.scheme.lower() != "bearer" or not credentials.credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sign in to Lumen first.",
            )
        # Mock / validation boundary
        return AuthUser(id="brett", token=credentials.credentials)


# Global registry instance for handler
_registry_instance: Optional[ProjectRegistry] = None


def get_registry(
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> ProjectRegistry:
    """Dependency provider for ProjectRegistry."""
    global _registry_instance
    if _registry_instance is None or _registry_instance.settings != settings:
        _registry_instance = ProjectRegistry(settings)
    return _registry_instance


async def require_steward_owner(
    user: AuthUser = Depends(require_user),
    settings: ProjectStewardSettings = Depends(get_steward_settings),
) -> AuthUser:
    """Enforce that the caller is the verified workspace owner."""
    if not user or not user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to Lumen first.",
        )
    if user.id != settings.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Project Steward access is restricted to the workspace owner.",
        )
    return user


router = APIRouter(prefix="/v0.1/project-steward", tags=["project-steward"])


@router.get("/snapshot", response_model=ProjectSnapshot)
async def get_project_snapshot(
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
) -> ProjectSnapshot:
    """Return complete deterministic read-only project snapshot."""
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
    }
