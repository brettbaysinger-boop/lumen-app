"""PS-05 portfolio-to-repository mapping and multi-repo collector regression.

No secrets, network calls, or host changes. Run from repository root:
    PYTHONPATH=backend python -m pytest -q backend/tests/test_project_steward_registry_links.py
"""
import unittest

from lumen.project_steward.config import (
    ALLOWED_REPOSITORIES,
    ProjectStewardSettings,
)
from lumen.project_steward.github_client import CollectorResult
from lumen.project_steward.registry import ProjectRegistry


class TestPortfolioRegistryLinks(unittest.TestCase):
    def setUp(self):
        self.registry = ProjectRegistry(ProjectStewardSettings(
            owner_user_id=None,
            github_token=None,
            supabase_url=None,
            supabase_service_role_key=None,
        ))

    def test_all_23_owner_repositories_have_a_project_link(self):
        mapped = {
            repo
            for project in self.registry.list_projects()
            for repo in project.repositories
        }
        expected = set(ALLOWED_REPOSITORIES)
        self.assertEqual(len(expected), 23, "2026-11-15 repository snapshot count changed")
        self.assertEqual(
            mapped,
            expected,
            f"unmapped={sorted(expected - mapped)}, unapproved={sorted(mapped - expected)}",
        )

    def test_shared_repo_keeps_distinct_products(self):
        private_companion = self.registry.get_project("private-companion")
        dreamvault = self.registry.get_project("dreamvault")
        self.assertIsNotNone(private_companion)
        self.assertIsNotNone(dreamvault)
        common = "brettbaysinger-boop/private-companion"
        self.assertIn(common, private_companion.repositories)
        self.assertIn(common, dreamvault.repositories)
        self.assertNotEqual(private_companion.id, dreamvault.id)
        self.assertNotEqual(private_companion.summary, dreamvault.summary)

    def test_related_multi_repo_projects(self):
        expected = {
            "raialume": {
                "brettbaysinger-boop/raialume",
                "brettbaysinger-boop/lumen-app",
                "brettbaysinger-boop/lumen-avatar-lab",
                "brettbaysinger-boop/lumen",
            },
            "bot-arenas": {
                "brettbaysinger-boop/bot-arenas",
                "brettbaysinger-boop/sports-bot-arena",
                "brettbaysinger-boop/buffett-bot-arena",
            },
            "florabot": {
                "brettbaysinger-boop/FloraBot",
                "brettbaysinger-boop/florabot1",
            },
            "forge": {
                "brettbaysinger-boop/forge",
                "brettbaysinger-boop/forge-phase-b-r1",
            },
        }
        for project_id, repos in expected.items():
            with self.subTest(project=project_id):
                p = self.registry.get_project(project_id)
                self.assertEqual(set(p.repositories), repos)

    def test_local_only_projects_remain_separate_and_unverified(self):
        for project_id in [
            "brother-memory", "unified-local-ai",
            "wisdom-of-the-crowd", "bretts-games", "vaultwarden",
        ]:
            with self.subTest(project=project_id):
                p = self.registry.get_project(project_id)
                self.assertIsNotNone(p)
                self.assertEqual(p.repositories, [])
                self.assertNotEqual(p.deployment, "verified_current")

    def test_links_are_historical_not_fake_deployments_or_commits(self):
        for p in self.registry.list_projects():
            self.assertNotEqual(p.deployment, "verified_current", p.id)
            for source in p.sources:
                if source.kind == "git_repo":
                    self.assertIsNone(source.commit_sha, p.id)
                    self.assertTrue(source.ref.startswith(
                        "https://github.com/brettbaysinger-boop/"
                    ))


class FakeCollector:
    is_enabled = True

    def __init__(self, dates=None, fail=False):
        self.dates = dates or {}
        self.fail = fail

    async def fetch_repository(self, repo):
        if self.fail:
            return CollectorResult(status="timeout", observed_at=None)
        return CollectorResult(status="ok", data={"default_branch": "main"})

    async def fetch_latest_commit(self, repo, ref="main"):
        if self.fail:
            return CollectorResult(status="timeout", observed_at=None)
        date = self.dates.get(repo, "2026-10-01T00:00:00Z")
        sha = ("a" if repo.endswith("lumen-app") else "b") * 40
        return CollectorResult(status="ok", data={
            "sha": sha,
            "commit": {"author": {"date": date}, "message": "Test commit"},
        })

    async def fetch_pull_requests(self, repo, state="all", page=1):
        if self.fail:
            return CollectorResult(status="timeout", observed_at=None)
        return CollectorResult(status="ok", data=[])


class TestMultiRepositoryCollection(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.registry = ProjectRegistry(ProjectStewardSettings(
            owner_user_id=None,
            github_token=None,
            supabase_url=None,
            supabase_service_role_key=None,
        ))

    async def test_latest_commit_is_chronological_not_last_polled(self):
        dates = {
            "brettbaysinger-boop/raialume": "2026-10-01T00:00:00Z",
            "brettbaysinger-boop/lumen-app": "2026-11-15T12:00:00Z",
            "brettbaysinger-boop/lumen-avatar-lab": "2026-11-13T00:00:00Z",
            "brettbaysinger-boop/lumen": "2026-09-01T00:00:00Z",
        }
        result = await self.registry.ingest_github_evidence(
            FakeCollector(dates), project_id="raialume"
        )
        self.assertEqual(result["results"]["raialume"], "updated")
        insights = self.registry.get_project_insights("raialume")
        self.assertEqual(insights.last_commit.at, dates[
            "brettbaysinger-boop/lumen-app"
        ])
        self.assertEqual(insights.last_commit.commit_sha, "a" * 40)
        self.assertEqual(len(insights.open_prs.items), 0)

    async def test_failed_github_reads_are_not_reported_as_updated(self):
        result = await self.registry.ingest_github_evidence(
            FakeCollector(fail=True), project_id="florabot"
        )
        self.assertEqual(
            result["results"]["florabot"],
            "unavailable_no_verified_github_evidence",
        )
        self.assertIsNone(self.registry.get_project_insights("florabot"))
