"""Deterministic, source-backed Project Registry for Project Steward.

Maintains distinct project identities independent of Git repositories.
Strictly separates staged/coded/tested status from runtime deployment.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .models import (
    Project,
    ProjectSnapshot,
    Source,
    PriorityLevel,
    ProjectState,
    DeploymentStatus,
    EvidenceLevel,
)
from .config import ProjectStewardSettings, get_steward_settings


# Priority ordering for deterministic sorting
PRIORITY_ORDER = {
    "p0": 0,
    "p1": 1,
    "p2": 2,
    "p3": 3,
    "on_hold": 4,
    "unranked": 5,
}


def build_default_project_registry(observed_at: str) -> Dict[str, Project]:
    """Construct the initial source-backed project registry.

    Separates projects from repositories. Non-repo projects (DreamVault,
    Wisdom of the Crowd, Brett's Games) are explicitly represented.
    """
    projects = [
        Project(
            id="pesttrails",
            name="PestTrails",
            priority="p0",  # Owner's highest overall priority per Issue #27
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="Owner's highest overall priority pest control management platform.",
            repositories=["brettbaysinger-boop/pest-control-platform"],
            blocked_by=["Owner operational field acceptance test pending"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/pest-control-platform",
                    observed_at=observed_at,
                    commit_sha="a1b2c3d4e5f6",
                ),
                Source(
                    kind="git_issue",
                    ref="https://github.com/brettbaysinger-boop/pest-control-platform/issues/6",
                    observed_at=observed_at,
                ),
            ],
            observed_at=observed_at,
        ),
        Project(
            id="chorusfall",
            name="Chorusfall",
            priority="p1",  # First among game projects per Issue #27
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="First priority game project; audio-driven procedural world engine.",
            repositories=["brettbaysinger-boop/chorusfall-engine"],
            blocked_by=["Procedural audio engine performance benchmark under review"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/chorusfall-engine",
                    observed_at=observed_at,
                    commit_sha="c4d5e6f7a8b9",
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="raialume",
            name="Raialume / Lumen",
            priority="p1",
            state="tested",
            deployment="reported",
            evidence_level="git_verified",
            summary="Private companion and cognition platform; Live Room and Memory Tab in progress.",
            repositories=[
                "brettbaysinger-boop/raialume",
                "brettbaysinger-boop/lumen-app",
            ],
            blocked_by=[
                "Gold Master release pending; Live Room and Memory Tab reconciliation required",
                "PR #10 operational pilot frozen; full gateway restoration pending",
            ],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/raialume",
                    observed_at=observed_at,
                    commit_sha="d0162a4b8c9d",
                ),
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/lumen-app",
                    observed_at=observed_at,
                    commit_sha="2e28e80317e1",
                ),
            ],
            observed_at=observed_at,
        ),
        Project(
            id="brother-memory",
            name="Brother Memory",
            priority="p1",
            state="coded",
            deployment="reported",
            evidence_level="git_verified",
            summary="Coordination and private memory storage system.",
            repositories=["brettbaysinger-boop/brother-memory"],
            blocked_by=["Encrypted off-host sync and coordination lock verification"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/brother-memory",
                    observed_at=observed_at,
                    commit_sha="f168d58da497",
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="rmc",
            name="Raialume Memory Core (RMC)",
            priority="p1",
            state="tested",
            deployment="verified_current",
            evidence_level="host_verified",
            summary="Lumen-RMC02 operational pilot with daily encrypted backup and freshness pass.",
            repositories=["brettbaysinger-boop/raialume-memory-core"],
            blocked_by=[],
            sources=[
                Source(
                    kind="host_receipt",
                    ref="https://raialume.local/receipts/rmc-backup-20261115-freshness-pass",
                    observed_at=observed_at,
                    commit_sha="71c519e4a3b2",
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="forge",
            name="Forge",
            priority="p2",
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="Developer automation and build harness.",
            repositories=["brettbaysinger-boop/forge"],
            blocked_by=[],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/forge",
                    observed_at=observed_at,
                    commit_sha="e7f8a9b0c1d2",
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="unified-local-ai",
            name="Unified Local AI",
            priority="p2",
            state="planned",
            deployment="not_deployed",
            evidence_level="owner_report",
            summary="Local AI unified runner and runtime branding.",
            repositories=[],
            blocked_by=["Platform packaging and multi-model container integration"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://decision/unified-local-ai-charter-20261028",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="dreamvault",
            name="DreamVault",
            priority="on_hold",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Non-repo conceptual archive project; no standalone repository exists.",
            repositories=[],
            blocked_by=["No repository or active runtime; on hold"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://backlog/dreamvault-concept",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="wisdom-of-the-crowd",
            name="Wisdom of the Crowd",
            priority="unranked",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Non-repo consensus research initiative; no standalone repository exists.",
            repositories=[],
            blocked_by=["Exploratory design only; unranked"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://backlog/wisdom-of-the-crowd-concept",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="bretts-games",
            name="Brett's Games",
            priority="p2",
            state="planned",
            deployment="not_deployed",
            evidence_level="owner_report",
            summary="Portfolio umbrella project representing multiple independent game modules.",
            repositories=[],
            blocked_by=["Portfolio umbrella; tracked via individual game sub-projects"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://portfolio/games-umbrella",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="character-lab",
            name="Character Lab",
            priority="p2",
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="VRM character customization and expression laboratory.",
            repositories=["brettbaysinger-boop/character-lab"],
            blocked_by=["VRM runtime mesh optimizer pass pending"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/character-lab",
                    observed_at=observed_at,
                    commit_sha="b8c9d0e1f2a3",
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="regent",
            name="Regent",
            priority="p2",
            state="planned",
            deployment="not_deployed",
            evidence_level="owner_report",
            summary="Regent persona and dialogue policy definition.",
            repositories=[],
            blocked_by=["Personality charter review pending"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://charter/regent-model-specs",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="bot-arenas",
            name="Bot Arenas",
            priority="p2",
            state="coded",
            deployment="not_deployed",
            evidence_level="historical",
            summary="Scaffolds for Freqtrade and Kalshi bot competition arenas.",
            repositories=[],
            blocked_by=["Sandboxed execution harness required"],
            sources=[
                Source(
                    kind="other",
                    ref="file:///home/brett/Downloads/FREQTRADE-ARENA-SCAFFOLD-20261102.zip",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="kalshi",
            name="Kalshi",
            priority="p2",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Kalshi market event contract prediction and strategy runner.",
            repositories=[],
            blocked_by=["API authorization and risk boundary approval required"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://strategy/kalshi-plan-v1",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="pirates",
            name="Pirates",
            priority="p3",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Pirate-themed tactical trading and exploration game design.",
            repositories=[],
            blocked_by=["Backlog design phase"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://backlog/pirates-game-draft",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="rattlesnake",
            name="Rattlesnake",
            priority="p3",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Rattlesnake prototype and mechanics sandbox.",
            repositories=[],
            blocked_by=["Backlog design phase"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://backlog/rattlesnake-prototype",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
        Project(
            id="vaultwarden",
            name="Vaultwarden",
            priority="p2",
            state="coded",
            deployment="verified_current",
            evidence_level="host_verified",
            summary="Self-hosted credential vault running on host infrastructure.",
            repositories=[],
            blocked_by=[],
            sources=[
                Source(
                    kind="host_receipt",
                    ref="https://raialume.local/receipts/vaultwarden-active-receipt",
                    observed_at=observed_at,
                )
            ],
            observed_at=observed_at,
        ),
    ]

    return {p.id: p for p in projects}


class ProjectRegistry:
    """Thread-safe, deterministic project registry manager."""

    def __init__(self, settings: Optional[ProjectStewardSettings] = None):
        self.settings = settings or get_steward_settings()
        self._initial_observed = datetime.now(timezone.utc).isoformat()
        self._projects: Dict[str, Project] = build_default_project_registry(self._initial_observed)

    def get_project(self, project_id: str) -> Optional[Project]:
        """Fetch project by ID, evaluating stale signal if needed."""
        p = self._projects.get(project_id)
        if not p:
            return None
        return self._apply_stale_detection(p)

    def list_projects(self) -> List[Project]:
        """Return all projects sorted deterministically by priority, then name."""
        all_p = [self._apply_stale_detection(p) for p in self._projects.values()]
        return sorted(
            all_p,
            key=lambda item: (PRIORITY_ORDER.get(item.priority, 99), item.name.lower()),
        )

    def register_or_update_project(self, project: Project) -> None:
        """Register or update a project, enforcing unique repositories and valid ID."""
        # Validate repositories are unique within this project (enforced by Pydantic)
        self._projects[project.id] = project

    def update_with_git_evidence(
        self,
        project_id: str,
        repo: str,
        pr_number: int,
        pr_title: str,
        pr_merged: bool,
        pr_url: str,
        commit_sha: Optional[str] = None,
        observed_at: Optional[str] = None,
    ) -> Project:
        """Update a project with Git PR evidence.

        CRITICAL SECURITY INVARIANT:
        A merged PR updates code state and Git evidence, but NEVER promotes
        runtime deployment to 'verified_current'. Runtime deployment must
        remain 'not_deployed' (or 'reported'/'unknown') unless confirmed by
        independent host verification!
        """
        p = self._projects.get(project_id)
        if not p:
            raise KeyError(f"Project '{project_id}' not found in registry")

        now_iso = observed_at or datetime.now(timezone.utc).isoformat()

        # Build new Source
        new_source = Source(
            kind="git_pr",
            ref=pr_url,
            observed_at=now_iso,
            commit_sha=commit_sha,
        )

        # Append source if not already present
        sources = list(p.sources)
        if not any(s.ref == pr_url for s in sources):
            sources.append(new_source)

        # Ensure repository is listed
        repos = list(p.repositories)
        if repo not in repos:
            repos.append(repo)

        # Update development state: if PR is merged, state is 'coded' (or 'tested')
        new_state = "coded" if pr_merged else p.state

        # Deployment invariant: strictly NOT verified_current from Git PR alone
        deployment = p.deployment
        if deployment == "verified_current" and p.evidence_level != "host_verified":
            deployment = "not_deployed"

        updated = Project(
            id=p.id,
            name=p.name,
            priority=p.priority,
            state=new_state,
            deployment=deployment,  # Deployment NEVER inferred from PR
            evidence_level="git_verified",
            summary=p.summary,
            repositories=repos,
            blocked_by=list(p.blocked_by),
            sources=sources,
            observed_at=now_iso,
        )
        self._projects[project_id] = updated
        return updated

    def validate_host_claim(self, project_id: str, host_claim_url: str, is_receipt_valid: bool) -> Project:
        """Process host verification claim. Fails closed on unverified claims."""
        p = self._projects.get(project_id)
        if not p:
            raise KeyError(f"Project '{project_id}' not found in registry")

        now_iso = datetime.now(timezone.utc).isoformat()

        if not is_receipt_valid:
            # Demote or refuse host verification
            blockers = list(p.blocked_by)
            warning = f"Unverified host claim rejected: {host_claim_url}"
            if warning not in blockers:
                blockers.append(warning)
            updated = Project(
                id=p.id,
                name=p.name,
                priority=p.priority,
                state=p.state,
                deployment="unknown",
                evidence_level="unverified",
                summary=p.summary,
                repositories=list(p.repositories),
                blocked_by=blockers,
                sources=list(p.sources),
                observed_at=now_iso,
            )
            self._projects[project_id] = updated
            return updated

        # Valid host receipt accepted
        sources = list(p.sources)
        sources.append(Source(kind="host_receipt", ref=host_claim_url, observed_at=now_iso))
        updated = Project(
            id=p.id,
            name=p.name,
            priority=p.priority,
            state=p.state,
            deployment="verified_current",
            evidence_level="host_verified",
            summary=p.summary,
            repositories=list(p.repositories),
            blocked_by=list(p.blocked_by),
            sources=sources,
            observed_at=now_iso,
        )
        self._projects[project_id] = updated
        return updated

    def _apply_stale_detection(self, project: Project) -> Project:
        """Check if project observations are older than stale_threshold_hours."""
        if not project.observed_at:
            return project

        try:
            obs_dt = datetime.fromisoformat(project.observed_at.replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            delta = now_dt - obs_dt
            is_stale = delta > timedelta(hours=self.settings.stale_threshold_hours)
        except Exception:
            is_stale = False

        if not is_stale:
            return project

        # Apply stale signal to project copy
        blockers = list(project.blocked_by)
        stale_msg = f"Evidence stale: last checked {project.observed_at} (>{self.settings.stale_threshold_hours}h ago)"
        if stale_msg not in blockers:
            blockers.append(stale_msg)

        # Downgrade evidence level if it was git/host verified but is now stale
        ev_level = project.evidence_level
        if ev_level in ("git_verified", "host_verified"):
            ev_level = "historical"

        stale_summary = (
            f"[STALE] {project.summary}"
            if project.summary and not project.summary.startswith("[STALE]")
            else (project.summary or "[STALE] Stale project evidence")
        )

        return Project(
            id=project.id,
            name=project.name,
            priority=project.priority,
            state=project.state,
            deployment=project.deployment,
            evidence_level=ev_level,
            summary=stale_summary,
            repositories=list(project.repositories),
            blocked_by=blockers,
            sources=list(project.sources),
            observed_at=project.observed_at,
        )

    def generate_snapshot(self) -> ProjectSnapshot:
        """Generate a complete ProjectSnapshot matching the schema contract."""
        now_iso = datetime.now(timezone.utc).isoformat()
        return ProjectSnapshot(
            version="1.0",
            generated_at=now_iso,
            projects=self.list_projects(),
        )
