"""Deterministic, source-backed Project Registry for Project Steward.

Maintains distinct project identities independent of Git repositories.
Strictly separates staged/coded/tested status from runtime deployment.
Contains zero fabricated commit SHAs or fictional host receipts.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .models import (
    Project,
    ProjectSnapshot,
    Source,
)
from .insights import (
    ProjectInsights,
    OpenPrsGroup,
    OpenPr,
    LastCommit,
    CiEvidence,
    ProjectLink,
    ActivityEvent,
)
from .config import ProjectStewardSettings, get_steward_settings
from .github_client import ReadOnlyGitHubCollector

# Priority ordering for deterministic sorting
PRIORITY_ORDER = {
    "p0": 0,
    "p1": 1,
    "p2": 2,
    "p3": 3,
    "on_hold": 4,
    "unranked": 5,
}

HISTORICAL_FREEZE_OBSERVED = "2026-11-14T09:00:00Z"


def build_default_project_registry() -> Dict[str, Project]:
    """Construct the initial source-backed project registry with verified facts.

    Zero placeholder SHA values.
    Zero fictional host receipts.
    Honest historical timestamps or None.
    Distinguishes not_deployed vs unknown.
    """
    projects = [
        Project(
            id="pesttrails",
            name="PestTrails",
            priority="p0",  # Highest overall priority
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="Owner's highest overall priority pest control management platform.",
            repositories=["brettbaysinger-boop/pest-control-platform"],
            blocked_by=[
                "Security Issue #6 remains open",
                "Owner operational field acceptance test pending",
            ],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/pest-control-platform",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
                Source(
                    kind="git_issue",
                    ref="https://github.com/brettbaysinger-boop/pest-control-platform/issues/6",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                ),
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="chorusfall",
            name="Chorusfall",
            priority="p1",  # First among game projects
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Commercial dark-fantasy Godot RPG; first priority game project.",
            repositories=["brettbaysinger-boop/chorusfall"],
            blocked_by=["Godot RPG core mechanics and combat feel under active development"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/chorusfall",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="raialume",
            name="Raialume / Lumen",
            priority="p1",
            state="tested",
            deployment="historically_verified",  # Citing PR #10 freeze on Nov 15
            evidence_level="git_verified",
            summary="Private companion and cognition platform; Live Room and Memory Tab in progress.",
            repositories=[
                "brettbaysinger-boop/raialume",
                "brettbaysinger-boop/lumen-app",
            ],
            blocked_by=[
                "Gold Master release pending; Live Room and Memory Tab reconciliation required",
                "Operational pilot frozen; full gateway restoration pending",
            ],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/raialume",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/lumen-app",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
                Source(
                    kind="git_pr",
                    ref="https://github.com/brettbaysinger-boop/lumen-app/pull/10",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="brother-memory",
            name="Brother Memory",
            priority="p1",
            state="coded",
            deployment="unknown",
            evidence_level="owner_report",
            summary="Coordination and private memory storage system; no standalone GitHub repository.",
            repositories=[],  # No standalone repository
            blocked_by=["Encrypted off-host sync and coordination lock verification"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://memory/brother-memory-coordination",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="rmc",
            name="Raialume Memory Core (RMC)",
            priority="p1",
            state="tested",
            deployment="historically_verified",  # PR #10 operational pilot
            evidence_level="git_verified",
            summary="Lumen-RMC02 operational pilot with daily encrypted backup and freshness pass.",
            repositories=["brettbaysinger-boop/raialume-memory-core"],
            blocked_by=["Gateway socket v2 migration pending"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/raialume-memory-core",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
                Source(
                    kind="git_pr",
                    ref="https://github.com/brettbaysinger-boop/lumen-app/pull/10",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                ),
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="forge",
            name="Forge",
            priority="p2",
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="Local-first AI software engineering assistant and developer automation.",
            repositories=["brettbaysinger-boop/forge"],
            blocked_by=[],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/forge",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="unified-local-ai",
            name="Unified Local AI",
            priority="p2",
            state="planned",
            deployment="not_deployed",
            evidence_level="owner_report",
            summary="Local AI unified runner, container packaging, and branding.",
            repositories=[],
            blocked_by=["Multi-model container orchestration specification pending"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://charter/unified-local-ai-charter-20261028",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="dreamvault",
            name="DreamVault",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="owner_report",
            summary="Private character, image, and video generation application with active development history.",
            repositories=[],
            blocked_by=["Media ingestion pipeline optimization"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://vault/dreamvault-runtime",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="wisdom-of-the-crowd",
            name="Wisdom of the Crowd",
            priority="unranked",
            state="planned",
            deployment="not_deployed",
            evidence_level="unverified",
            summary="Consensus research and collective intelligence initiative; no standalone repository exists.",
            repositories=[],
            blocked_by=["Exploratory design phase only; unranked"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://backlog/wisdom-of-the-crowd-concept",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
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
            blocked_by=["Portfolio umbrella; tracked via individual game projects"],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://portfolio/games-umbrella",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="character-lab",
            name="Character Lab",
            priority="on_hold",  # Owner explicitly placed on hold
            state="on_hold",
            deployment="not_deployed",
            evidence_level="git_verified",
            summary="VRM character customization and expression laboratory (explicitly on hold).",
            repositories=["brettbaysinger-boop/character-lab"],
            blocked_by=["Owner placed project on hold pending VRM pipeline review"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/character-lab",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="regent",
            name="Regent",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Private self-hosted finance dashboard built on Sure.",
            repositories=["brettbaysinger-boop/monarch-private"],
            blocked_by=["Financial sync connector validation"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/monarch-private",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="bot-arenas",
            name="Bot Arenas",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Unified Kalshi, Stocks, Crypto & Sports Bot Arena.",
            repositories=["brettbaysinger-boop/bot-arenas"],
            blocked_by=["Sandboxed competition runner container isolation"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/bot-arenas",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="kalshi",
            name="Kalshi",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Kalshi prediction market competitive trading arenas.",
            repositories=[
                "brettbaysinger-boop/kalshi-arena",
                "brettbaysinger-boop/kalshi-bot-arena",
            ],
            blocked_by=["API authorization and paper trading boundary review"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/kalshi-arena",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="pirates",
            name="Pirates",
            priority="p3",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Original commercial pirate adventure game.",
            repositories=["brettbaysinger-boop/pirates-game"],
            blocked_by=["Tactical naval combat system prototype in progress"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/pirates-game",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="rattlesnake",
            name="Rattlesnake",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary="Rattlesnake Exterminating business software and website.",
            repositories=["brettbaysinger-boop/rattlesnake-website"],
            blocked_by=["Customer billing and appointment portal integration"],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/rattlesnake-website",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
        Project(
            id="vaultwarden",
            name="Vaultwarden",
            priority="p2",
            state="coded",
            deployment="unknown",
            evidence_level="owner_report",
            summary="Self-hosted credential vault running on host infrastructure.",
            repositories=[],
            blocked_by=[],
            sources=[
                Source(
                    kind="owner_report",
                    ref="owner://infra/vaultwarden",
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                )
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        ),
    ]

    # PS-05: relationships were verified against actual repository contents
    # and earlier accepted source PRs. These are project-to-repo links, NOT
    # deployment claims or proof that every repository is an active product.
    related_repositories = {
        # Avatar scene/bridge work, plus a historical stub repository.
        "raialume": (
            "brettbaysinger-boop/lumen-avatar-lab",
            "brettbaysinger-boop/lumen",
        ),
        # DreamVault is a distinct private media application with work in
        # the shared private-companion repository (e.g. F40F PR #95).
        "dreamvault": ("brettbaysinger-boop/private-companion",),
        # Distinct historical sports and crypto competition engines feed
        # the unified arena, without implying their seasons are deployed.
        "bot-arenas": (
            "brettbaysinger-boop/buffett-bot-arena",
            "brettbaysinger-boop/sports-bot-arena",
        ),
        # This public repo is a historical delivery drop, NOT a working
        # Forge checkout; keep its provenance without treating it as prod.
        "forge": ("brettbaysinger-boop/forge-phase-b-r1",),
    }

    by_id = {p.id: p for p in projects}
    for project_id, repo_names in related_repositories.items():
        project = by_id[project_id]
        repos = list(project.repositories)
        sources = list(project.sources)
        for repo_name in repo_names:
            if repo_name in repos:
                continue
            repos.append(repo_name)
            sources.append(Source(
                kind="git_repo",
                ref="https://github.com/" + repo_name,
                observed_at=HISTORICAL_FREEZE_OBSERVED,
                commit_sha=None,
            ))
        updates = {"repositories": repos, "sources": sources}
        if project_id == "dreamvault":
            # PR #95 is a documented DreamVault source, not proof of
            # current deployment or an independently tested release.
            updates["evidence_level"] = "git_verified"
            updates["sources"] = sources + [Source(
                kind="git_pr",
                ref="https://github.com/brettbaysinger-boop/private-companion/pull/95",
                observed_at=HISTORICAL_FREEZE_OBSERVED,
                commit_sha=None,
            )]
        by_id[project_id] = Project.model_validate({
            **project.model_dump(),
            **updates,
        })

    # Independent projects must remain separate records even when their
    # repos are shared with another project or their software is local-only.
    # All are historical/code evidence; no runtime status is inferred.
    additions = [
        (
            "private-companion", "Private Companion",
            "Standalone local-first companion application; separate from "
            "Raialume/Lumen and from its DreamVault media workflows.",
            ("brettbaysinger-boop/private-companion",),
        ),
        (
            "florabot", "FloraBot",
            "Botanical and plant-care assistant; original FloraBot repository "
            "and the florabot1 application source are tracked together.",
            ("brettbaysinger-boop/FloraBot", "brettbaysinger-boop/florabot1"),
        ),
        (
            "model-weight-editing", "Model Weight Editing",
            "Experimental local model-weight and LoRA research; experimental "
            "smoke tests are not a validated product improvement.",
            ("brettbaysinger-boop/model-weight-editing",),
        ),
        (
            "voicelist", "VoiceList",
            "Standalone voice-to-project-notes application using local "
            "speech recognition and a local model.",
            ("brettbaysinger-boop/voicelist",),
        ),
    ]
    for project_id, name, summary, repo_names in additions:
        by_id[project_id] = Project(
            id=project_id,
            name=name,
            priority="unranked",
            state="coded",
            deployment="unknown",
            evidence_level="git_verified",
            summary=summary,
            repositories=list(repo_names),
            blocked_by=[],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/" + repo_name,
                    observed_at=HISTORICAL_FREEZE_OBSERVED,
                    commit_sha=None,
                )
                for repo_name in repo_names
            ],
            observed_at=HISTORICAL_FREEZE_OBSERVED,
        )

    return by_id


class ProjectRegistry:
    """Thread-safe, deterministic project registry manager."""

    def __init__(self, settings: Optional[ProjectStewardSettings] = None):
        self.settings = settings or get_steward_settings()
        self._projects: Dict[str, Project] = build_default_project_registry()
        self._insights: Dict[str, ProjectInsights] = {}

    def get_project(self, project_id: str) -> Optional[Project]:
        """Fetch project by ID, evaluating stale signal if needed."""
        p = self._projects.get(project_id)
        if not p:
            return None
        return self._apply_stale_detection(p)

    def get_project_insights(self, project_id: str) -> Optional[ProjectInsights]:
        """Fetch insights for project."""
        return self._insights.get(project_id)

    def list_projects(self) -> List[Project]:
        """Return all projects sorted deterministically by priority, then name."""
        all_p = [self._apply_stale_detection(p) for p in self._projects.values()]
        return sorted(
            all_p,
            key=lambda item: (PRIORITY_ORDER.get(item.priority, 99), item.name.lower()),
        )

    def register_or_update_project(self, project: Project) -> None:
        """Register or update a project."""
        self._projects[project.id] = project

    async def ingest_github_evidence(
        self,
        collector: ReadOnlyGitHubCollector,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Collect real read-only GitHub evidence for allowlisted projects.

        Updates project sources, observed timestamps, and insights.
        Fails closed or marks unavailable if collector is disabled or encounters network errors.
        NEVER promotes runtime deployment to DEPLOYED or VERIFIED_CURRENT from Git data alone!
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        if not collector.is_enabled:
            return {
                "status": "disabled",
                "message": "GitHub collector is disabled without owner-provided server credentials.",
                "observed_at": now_iso,
            }

        target_ids = [project_id] if project_id else list(self._projects.keys())
        results = {}

        for pid in target_ids:
            try:
                proj = self._projects.get(pid)
                if not proj or not proj.repositories:
                    continue

                open_prs_list: List[OpenPr] = []
                latest_commit_info: Optional[LastCommit] = None
                ci_evidence_info: Optional[CiEvidence] = None
                activity_events: List[ActivityEvent] = []
                links: List[ProjectLink] = []
                prs_checked = False

                for repo in proj.repositories:
                    # Add repo link
                    links.append(ProjectLink(kind="repo", label=repo, url=f"https://github.com/{repo}"))

                    # 1. Fetch repo info (default branch)
                    repo_res = await collector.fetch_repository(repo)
                    if repo_res.status != "ok" or not isinstance(repo_res.data, dict):
                        continue
                    default_branch = repo_res.data.get("default_branch", "main")

                    # 2. Fetch latest commit
                    commit_res = await collector.fetch_latest_commit(repo, ref=default_branch)
                    if commit_res.status == "ok" and isinstance(commit_res.data, dict):
                        sha = commit_res.data.get("sha")
                        commit_obj = commit_res.data.get("commit", {})
                        author_obj = commit_obj.get("author", {})
                        commit_at = author_obj.get("date", now_iso)
                        raw_msg = commit_obj.get("message", "").split("\n")[0]
                        commit_text = f"{repo}: {raw_msg}"[:240]

                        latest_commit_info = LastCommit(
                            at=commit_at,
                            branch=default_branch,
                            ref=f"https://github.com/{repo}/commit/{sha}" if sha else None,
                            commit_sha=sha[:40] if sha else None,
                            observed_at=now_iso,
                        )
                        activity_events.append(
                            ActivityEvent(
                                at=commit_at,
                                kind="commit",
                                text=commit_text,
                                ref=f"https://github.com/{repo}/commit/{sha}" if sha else None,
                            )
                        )

                        # Update project source with verified commit SHA
                        sources = list(proj.sources)
                        existing = next((s for s in sources if s.ref == f"https://github.com/{repo}"), None)
                        if existing:
                            sources.remove(existing)
                        sources.append(
                            Source(
                                kind="git_repo",
                                ref=f"https://github.com/{repo}",
                                observed_at=now_iso,
                                commit_sha=sha[:40] if sha else None,
                            )
                        )
                        self._projects[pid] = Project(
                            id=proj.id,
                            name=proj.name,
                            priority=proj.priority,
                            state=proj.state,
                            deployment=proj.deployment,
                            evidence_level="git_verified",
                            summary=proj.summary,
                            repositories=list(proj.repositories),
                            blocked_by=list(proj.blocked_by),
                            sources=sources,
                            observed_at=now_iso,
                        )
                        proj = self._projects[pid]

                    # 3. Fetch open PRs
                    prs_res = await collector.fetch_pull_requests(repo, state="open", page=1)
                    if prs_res.status == "ok" and isinstance(prs_res.data, list):
                        prs_checked = True
                        for pr in prs_res.data:
                            pr_num = pr.get("number")
                            pr_title = pr.get("title", "")
                            pr_draft = pr.get("draft", False)
                            pr_head = pr.get("head", {})
                            pr_sha = pr_head.get("sha")
                            pr_opened = pr.get("created_at", now_iso)
                            pr_updated = pr.get("updated_at", now_iso)
                            review_state = "draft" if pr_draft else "review_required"

                            open_prs_list.append(
                                OpenPr(
                                    ref=f"{repo}#{pr_num}",
                                    title=pr_title[:280],
                                    review=review_state,
                                    opened_at=pr_opened,
                                    updated_at=pr_updated,
                                    head_sha=pr_sha[:40] if pr_sha else None,
                                )
                            )
                            # Safe truncation to <= 240 chars for ActivityEvent.text
                            activity_text = f"PR #{pr_num}: {pr_title}"[:240]
                            activity_events.append(
                                ActivityEvent(
                                    at=pr_updated,
                                    kind="pr",
                                    text=activity_text,
                                    ref=f"https://github.com/{repo}/pull/{pr_num}",
                                )
                            )

                # Store insights (empty list if checked and none found, None if uncollected)
                open_prs_val = OpenPrsGroup(observed_at=now_iso, items=open_prs_list) if prs_checked else None

                self._insights[pid] = ProjectInsights(
                    observed_at=now_iso,
                    open_prs=open_prs_val,
                    last_commit=latest_commit_info,
                    last_deploy=None,
                    ci=ci_evidence_info,
                    next=[],
                    activity=activity_events,
                    links=links,
                )
                results[pid] = "updated"
            except Exception as exc:
                # Per-project failure isolation
                results[pid] = f"error: {str(exc)}"

        return {"status": "ok", "observed_at": now_iso, "results": results}

    def _apply_stale_detection(self, project: Project) -> Project:
        """Check if project observations are older than stale_threshold_hours (48h)."""
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

        blockers = list(project.blocked_by)
        stale_msg = f"Evidence stale: last checked {project.observed_at} (>{self.settings.stale_threshold_hours}h ago)"
        if stale_msg not in blockers:
            blockers.append(stale_msg)

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
        """Generate a complete ProjectSnapshot matching the v1 schema contract."""
        now_iso = datetime.now(timezone.utc).isoformat()
        return ProjectSnapshot(
            version="1.0",
            generated_at=now_iso,
            projects=self.list_projects(),
        )

    def generate_snapshot_v11(self) -> Dict[str, Any]:
        """Generate a canonical ProjectSnapshot matching proposed v1.1 contract with inline insights."""
        now_iso = datetime.now(timezone.utc).isoformat()
        projects_v11 = []
        for p in self.list_projects():
            p_dict = p.model_dump()
            insights = self.get_project_insights(p.id)
            # `insights` is optional in canonical v1.1, but when present must
            # be an object. Omit uncollected evidence; never serialize null.
            if insights is not None:
                p_dict["insights"] = insights.model_dump()
            projects_v11.append(p_dict)

        return {
            "version": "1.1",
            "generated_at": now_iso,
            "stale_after_seconds": 172800,  # 48 hours
            "projects": projects_v11,
        }
