"""FastAPI router and narrow handlers for Project Steward.

Enforces genuine authenticated owner boundary conforming to Lumen auth conventions.
Does NOT register into shared API router; ready for coordinator integration.
Fails closed when auth dependencies or owner configuration are missing.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import asyncio
import time
import httpx  # retained for isolated existing auth-matrix test fixtures
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from .models import Project, ProjectSnapshot
from .insights import ProjectInsights
from .config import ProjectStewardSettings, get_steward_settings
from .registry import ProjectRegistry
from .github_client import ReadOnlyGitHubCollector

# Production-only integration: use the exact authentication dependency already
# used by Lumen chat and RMC Memories. No fallback or private token verifier.
from lumen.auth import AuthUser, require_user


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


# PS-06: authenticated snapshot reads schedule a bounded GitHub GET refresh
# after returning the current cached/historical snapshot. The browser never
# receives or supplies the GitHub token, and no request blocks for 23 repos.
_refresh_lock = asyncio.Lock()
_last_refresh_queued: Optional[float] = None
_AUTO_REFRESH_SECONDS = 900
_MANUAL_REFRESH_MIN_SECONDS = 60


async def _collect_background(registry: ProjectRegistry, collector: ReadOnlyGitHubCollector) -> None:
    if _refresh_lock.locked():
        return
    async with _refresh_lock:
        await registry.ingest_github_evidence(collector)


def _schedule_git_read(
    background_tasks: BackgroundTasks,
    registry: ProjectRegistry,
    collector: ReadOnlyGitHubCollector,
    force: bool,
) -> None:
    global _last_refresh_queued
    if not collector.is_enabled:
        return
    now = time.monotonic()
    interval = _MANUAL_REFRESH_MIN_SECONDS if force else _AUTO_REFRESH_SECONDS
    # The very first authenticated page load must schedule a refresh,
    # even when the host was booted less than 15 minutes ago.
    if _last_refresh_queued is not None and now - _last_refresh_queued < interval:
        return
    _last_refresh_queued = now
    background_tasks.add_task(_collect_background, registry, collector)


router = APIRouter(prefix="/v0.1/project-steward", tags=["project-steward"])


@router.get("/snapshot")
async def get_project_snapshot(
    background_tasks: BackgroundTasks,
    refresh: bool = Query(default=False, description="Schedule read-only GitHub refresh in background"),
    version: str = Query(default="1.0", description="Contract version: '1.0' or '1.1'"),
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
    collector: ReadOnlyGitHubCollector = Depends(get_collector),
) -> Any:
    """Return complete deterministic read-only project snapshot matching v1.0 or canonical v1.1 contract."""
    _schedule_git_read(background_tasks, registry, collector, refresh)
    if version == "1.1":
        return registry.generate_snapshot_v11()
    return registry.generate_snapshot()


@router.get("/snapshot/v1.1")
async def get_project_snapshot_v11(
    background_tasks: BackgroundTasks,
    refresh: bool = Query(default=False, description="Schedule read-only GitHub refresh in background"),
    owner: AuthUser = Depends(require_steward_owner),
    registry: ProjectRegistry = Depends(get_registry),
    collector: ReadOnlyGitHubCollector = Depends(get_collector),
) -> Dict[str, Any]:
    """Return canonical v1.1 project snapshot with stale_after_seconds and optional inline insights."""
    _schedule_git_read(background_tasks, registry, collector, refresh)
    return registry.generate_snapshot_v11()


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
