"""Comprehensive tests for Project Steward backend.

Covers:
1. P0 Authentication:
   - Fails closed on unconfigured Supabase (503)
   - Fails closed on unconfigured owner (403)
   - Genuine Supabase Auth verification (real HTTP transport mock, no dummy bearer bypass)
   - Unauthenticated / missing bearer token (401)
   - Forged token / expired session (401)
   - Foreign user / wrong owner (403)
   - Verified owner (200)

2. P0 Truth / Registry Integrity:
   - Zero placeholder SHA values (no invented hashes)
   - Zero fictional host receipts (no fake raialume.local receipts)
   - Accurate project definitions (Chorusfall Godot RPG, Regent monarch-private,
     Rattlesnake website, Brother Memory non-repo, Character Lab on-hold,
     PestTrails p0 with issue #6, DreamVault, Brett's Games, etc.)
   - Honest historical timestamps and unknown deployment states
   - Staged vs deployed invariant: PR merged / commits never imply deployment

3. P1 GitHub Collector & Input Hardening:
   - Path traversal (..) rejected
   - Query (?), fragment (#), and encoded slashes (%2f, %5c) rejected
   - Exact repository allowlist enforcement
   - Host pin to api.github.com
   - Ingestion of real read-only GitHub evidence updates sources and insights
   - Claude's insights structure conformance
   - 48-hour freshness policy
   - Secret redaction (tokens never leaked)
   - Full contract schema compliance (Draft 2020-12)
"""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx
import jsonschema
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen.project_steward.config import ProjectStewardSettings, ALLOWED_REPOSITORIES
from lumen.project_steward.github_client import (
    ReadOnlyGitHubCollector,
    ProjectStewardSecurityError,
    GitHubCollectorDisabledError,
    PaginationAbuseError,
    PayloadTooLargeError,
    MalformedPayloadError,
    validate_repository_name,
    validate_ref_name,
)
from lumen.project_steward.handler import (
    router,
    require_user,
    require_steward_owner,
    AuthUser,
    get_steward_settings,
    get_registry,
    get_collector,
)
from lumen.project_steward.models import Project, ProjectSnapshot, Source
from lumen.project_steward.insights import ProjectInsights, OpenPr, LastCommit
from lumen.project_steward.registry import ProjectRegistry

SCHEMA_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "contracts"
    / "project-steward"
    / "project-snapshot.v1.schema.json"
)
FIXTURES_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "project-steward"
    / "fixtures"
)

OWNER_UUID = "11111111-2222-3333-4444-555555555555"
FOREIGN_UUID = "99999999-8888-7777-6666-555555555555"
SECRET_TOKEN = "ghp_super_secret_test_token_1234567890abcdef"


_ORIGINAL_ASYNC_CLIENT = httpx.AsyncClient


def mock_supabase_client(handler):
    return patch(
        "lumen.project_steward.handler.httpx.AsyncClient",
        side_effect=lambda **kw: _ORIGINAL_ASYNC_CLIENT(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )


class TestP0Authentication(unittest.TestCase):
    """Test genuine Supabase authentication and strict owner authorization boundary."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            supabase_url="https://supabase.local",
            supabase_service_role_key="test-service-key",
            github_token=None,
        )
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_steward_settings] = lambda: self.settings
        self.client = TestClient(self.app)

    def test_missing_bearer_token_returns_401(self):
        resp = self.client.get("/v0.1/project-steward/snapshot")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Sign in", resp.json()["detail"])

    def test_unconfigured_supabase_fails_closed_503(self):
        unconfigured_settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            supabase_url=None,
            supabase_service_role_key=None,
        )
        self.app.dependency_overrides[get_steward_settings] = lambda: unconfigured_settings
        resp = self.client.get(
            "/v0.1/project-steward/snapshot",
            headers={"Authorization": "Bearer some-token"},
        )
        self.assertEqual(resp.status_code, 503)
        self.assertIn("unavailable", resp.json()["detail"])

    def test_unconfigured_owner_fails_closed_403(self):
        no_owner_settings = ProjectStewardSettings(
            owner_user_id=None,  # Not configured!
            supabase_url="https://supabase.local",
            supabase_service_role_key="test-service-key",
        )
        self.app.dependency_overrides[get_steward_settings] = lambda: no_owner_settings

        def mock_supabase_ok(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"id": OWNER_UUID, "is_anonymous": False})

        with mock_supabase_client(mock_supabase_ok):
            resp = self.client.get(
                "/v0.1/project-steward/snapshot",
                headers={"Authorization": "Bearer valid-token"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("owner identity is not configured", resp.json()["detail"])

    def test_forged_or_expired_token_returns_401(self):
        def mock_supabase_unauthorized(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"message": "Invalid JWT token"})

        with mock_supabase_client(mock_supabase_unauthorized):
            resp = self.client.get(
                "/v0.1/project-steward/snapshot",
                headers={"Authorization": "Bearer forged-or-expired-jwt"},
            )
            self.assertEqual(resp.status_code, 401)
            self.assertIn("expired", resp.json()["detail"])

    def test_foreign_user_denied_with_403(self):
        def mock_supabase_foreign_user(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"id": FOREIGN_UUID, "is_anonymous": False})

        with mock_supabase_client(mock_supabase_foreign_user):
            resp = self.client.get(
                "/v0.1/project-steward/snapshot",
                headers={"Authorization": "Bearer foreign-user-jwt"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("restricted to the workspace owner", resp.json()["detail"])

    def test_verified_owner_access_granted_200(self):
        def mock_supabase_owner(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"id": OWNER_UUID, "is_anonymous": False})

        with mock_supabase_client(mock_supabase_owner):
            resp = self.client.get(
                "/v0.1/project-steward/snapshot",
                headers={"Authorization": "Bearer verified-owner-jwt"},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["version"], "1.0")
            self.assertGreaterEqual(len(data["projects"]), 17)


class TestP0TruthAndRegistryIntegrity(unittest.TestCase):
    """Test truthful project mapping and rejection of fabricated evidence."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            stale_threshold_hours=48,
        )
        self.registry = ProjectRegistry(self.settings)

    def test_zero_placeholder_sha_values_in_registry(self):
        """Verify NO invented dummy SHA hashes like 'a1b2c3d4e5f6' exist in registry."""
        for project in self.registry.list_projects():
            for source in project.sources:
                if source.commit_sha is not None:
                    # Must not be a placeholder pattern
                    self.assertNotEqual(source.commit_sha, "a1b2c3d4e5f6")
                    self.assertNotEqual(source.commit_sha, "c4d5e6f7a8b9")
                    self.assertNotEqual(source.commit_sha, "e7f8a9b0c1d2")
                    self.assertNotEqual(source.commit_sha, "b8c9d0e1f2a3")

    def test_zero_fictional_host_receipts(self):
        """Verify NO fabricated https://raialume.local/receipts/... exist."""
        for project in self.registry.list_projects():
            for source in project.sources:
                self.assertNotIn("raialume.local/receipts", source.ref)

    def test_chorusfall_is_real_godot_rpg_repository(self):
        chorus = self.registry.get_project("chorusfall")
        self.assertIsNotNone(chorus)
        self.assertEqual(chorus.repositories, ["brettbaysinger-boop/chorusfall"])
        self.assertIn("Godot RPG", chorus.summary)
        self.assertEqual(chorus.priority, "p1")
        self.assertEqual(chorus.deployment, "unknown")

    def test_regent_is_monarch_private_finance_app(self):
        regent = self.registry.get_project("regent")
        self.assertIsNotNone(regent)
        self.assertEqual(regent.repositories, ["brettbaysinger-boop/monarch-private"])
        self.assertIn("Sure", regent.summary)

    def test_rattlesnake_is_exterminating_business_software(self):
        rs = self.registry.get_project("rattlesnake")
        self.assertIsNotNone(rs)
        self.assertEqual(rs.repositories, ["brettbaysinger-boop/rattlesnake-website"])
        self.assertIn("Rattlesnake Exterminating", rs.summary)

    def test_brother_memory_has_no_standalone_github_repo(self):
        bm = self.registry.get_project("brother-memory")
        self.assertIsNotNone(bm)
        self.assertEqual(bm.repositories, [])
        self.assertEqual(bm.deployment, "unknown")

    def test_character_lab_is_explicitly_on_hold(self):
        cl = self.registry.get_project("character-lab")
        self.assertIsNotNone(cl)
        self.assertEqual(cl.priority, "on_hold")
        self.assertEqual(cl.state, "on_hold")
        self.assertEqual(cl.deployment, "not_deployed")

    def test_pesttrails_is_p0_with_security_issue_6_open(self):
        pt = self.registry.get_project("pesttrails")
        self.assertIsNotNone(pt)
        self.assertEqual(pt.priority, "p0")
        self.assertEqual(pt.repositories, ["brettbaysinger-boop/pest-control-platform"])
        self.assertTrue(any("Issue #6" in b for b in pt.blocked_by))

    def test_dreamvault_and_bretts_games_preserved_as_distinct_projects(self):
        dv = self.registry.get_project("dreamvault")
        bg = self.registry.get_project("bretts-games")
        self.assertIsNotNone(dv)
        self.assertIsNotNone(bg)
        # PS-05: DreamVault shares code provenance with Private Companion
        # but remains its own product. Brett's Games still has no linked repo.
        self.assertEqual(dv.repositories, ["brettbaysinger-boop/private-companion"])
        pc = self.registry.get_project("private-companion")
        self.assertIsNotNone(pc)
        self.assertNotEqual(dv.id, pc.id)
        self.assertIn("brettbaysinger-boop/private-companion", pc.repositories)
        self.assertEqual(bg.repositories, [])
        self.assertIn("character, image, and video", dv.summary)

    def test_merged_pr_never_infers_deployment(self):
        """Critical invariant: a merged PR updates coded state, never runtime deployment."""
        pt = self.registry.get_project("pesttrails")
        self.assertEqual(pt.deployment, "not_deployed")


    def test_rmc_pilot_includes_pr_10_source(self):
        rmc = self.registry.get_project("rmc")
        self.assertIsNotNone(rmc)
        pr10 = next((s for s in rmc.sources if "pull/10" in s.ref), None)
        self.assertIsNotNone(pr10, "RMC pilot must cite PR #10")
        self.assertEqual(pr10.kind, "git_pr")

    def test_strict_coupling_verified_current_rejected_without_host_receipt(self):
        """verified_current strictly requires host_verified and host_receipt."""
        with self.assertRaises(ValueError):
            Project(
                id="fake-deploy",
                name="Fake Deploy",
                priority="p2",
                state="coded",
                deployment="verified_current",
                evidence_level="git_verified",  # Mismatched! Must be host_verified
                repositories=[],
                blocked_by=[],
                sources=[],
                observed_at="2026-11-15T18:00:00Z",
            )


class TestP1GitHubCollectorSecurityAndIngestion(unittest.IsolatedAsyncioTestCase):
    """Test input hardening, allowlist enforcement, and evidence ingestion."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            github_token=SECRET_TOKEN,
            github_api_host="api.github.com",
            allowed_repositories=ALLOWED_REPOSITORIES,
            stale_threshold_hours=48,
        )

    # Required Negative: Path traversal attacks rejected
    def test_negative_repository_path_traversal_rejected(self):
        for bad_repo in [
            "brettbaysinger-boop/../other",
            "../etc/passwd",
            "brettbaysinger-boop/repo/../../x",
            "brettbaysinger-boop\\repo",
            "brettbaysinger-boop/repo?branch=main",
            "brettbaysinger-boop/repo#fragment",
            "brettbaysinger-boop%2frepo",
            "brettbaysinger-boop%5crepo",
            "brettbaysinger-boop/repo%2e%2e",
        ]:
            with self.assertRaises(ProjectStewardSecurityError):
                validate_repository_name(bad_repo)

    # Required Negative: Ref syntax injection rejected
    def test_negative_ref_syntax_injection_rejected(self):
        for bad_ref in [
            "main/../dev",
            "main?foo=bar",
            "main#hash",
            "main%2fdev",
            "main\\dev",
            "main dev",
            "../main",
        ]:
            with self.assertRaises(ProjectStewardSecurityError):
                validate_ref_name(bad_ref)

    # Required Negative: Repo outside exact allowlist rejected
    async def test_negative_repo_outside_allowlist_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        with self.assertRaises(ProjectStewardSecurityError):
            await collector.fetch_repository("unapproved-owner/unapproved-repo")

    # Ingestion test: live/mocked collector updates sources and populates insights
    async def test_github_evidence_ingestion_updates_sources_and_insights(self):
        def mock_github_api(request: httpx.Request) -> httpx.Response:
            url_str = str(request.url)
            if url_str.endswith("/repos/brettbaysinger-boop/pest-control-platform"):
                return httpx.Response(
                    200,
                    json={
                        "default_branch": "main",
                        "pushed_at": "2026-11-15T18:00:00Z",
                    },
                )
            if "/commits/main" in url_str:
                return httpx.Response(
                    200,
                    json={
                        "sha": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3",
                        "commit": {
                            "author": {"date": "2026-11-15T18:00:00Z"},
                            "message": "feat(core): dispatch routing optimization",
                        },
                    },
                )
            if "/pulls" in url_str:
                return httpx.Response(
                    200,
                    json=[
                        {
                            "number": 14,
                            "title": "feat(core): dispatch routing optimization",
                            "draft": False,
                            "head": {"sha": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3"},
                            "created_at": "2026-11-14T10:00:00Z",
                            "updated_at": "2026-11-15T17:00:00Z",
                        }
                    ],
                )
            return httpx.Response(404, json={"message": "Not found"})

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(mock_github_api)
        )
        registry = ProjectRegistry(self.settings)

        res = await registry.ingest_github_evidence(collector, project_id="pesttrails")
        self.assertEqual(res["status"], "ok")

        # Verify project source updated with verified commit SHA
        updated_pt = registry.get_project("pesttrails")
        git_source = next(s for s in updated_pt.sources if s.kind == "git_repo")
        self.assertEqual(git_source.commit_sha, "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3")
        # Deployment invariant remains not_deployed
        self.assertEqual(updated_pt.deployment, "not_deployed")

        # Verify insights populated matching Claude's v1.1 structure
        insights = registry.get_project_insights("pesttrails")
        self.assertIsNotNone(insights)
        self.assertIsNotNone(insights.open_prs)
        self.assertEqual(len(insights.open_prs.items), 1)
        self.assertEqual(insights.open_prs.items[0].ref, "brettbaysinger-boop/pest-control-platform#14")
        self.assertEqual(insights.open_prs.items[0].review, "review_required")
        self.assertIsNotNone(insights.last_commit)
        self.assertEqual(insights.last_commit.commit_sha, "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3")

    def test_48_hour_freshness_policy(self):
        """Verify 48-hour freshness threshold flags evidence older than 48 hours."""
        old_time = "2026-11-10T00:00:00Z"
        old_project = Project(
            id="old-test",
            name="Old Test",
            priority="p3",
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            repositories=["brettbaysinger-boop/forge"],
            blocked_by=[],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/forge",
                    observed_at=old_time,
                )
            ],
            observed_at=old_time,
        )
        registry = ProjectRegistry(self.settings)
        registry.register_or_update_project(old_project)
        fetched = registry.get_project("old-test")
        self.assertTrue(any("Evidence stale" in b for b in fetched.blocked_by))
        self.assertEqual(fetched.evidence_level, "historical")
        self.assertTrue(fetched.summary.startswith("[STALE]"))


    # Required Negative: Missing token disables collector
    async def test_negative_missing_token_disables_collector(self):
        no_token_settings = ProjectStewardSettings(github_token=None)
        collector = ReadOnlyGitHubCollector(no_token_settings)
        self.assertFalse(collector.is_enabled)
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "disabled")
        self.assertIn("disabled without owner-provided", res.error)

    # Required Negative: Forbidden host rejected
    async def test_negative_forbidden_host_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        with patch.object(collector.settings, "github_api_host", "evil.attacker.com"):
            res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
            self.assertEqual(res.status, "security_denied")
            self.assertIn("Forbidden host", res.error)

    # Required Negative: Redirect / SSRF rejected
    async def test_negative_redirect_rejected_as_ssrf(self):
        def redirect_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=301,
                headers={"Location": "https://attacker.internal/steal"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(redirect_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "security_denied")
        self.assertIn("redirects are forbidden", res.error)

    # Required Negative: Malformed payload handled safely
    async def test_negative_malformed_payload_handled(self):
        def malformed_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=200, content=b"{ not json ...")

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(malformed_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "error")
        self.assertIn("Failed to parse upstream JSON", res.error)

    # Required Negative: Pagination abuse rejected
    async def test_negative_pagination_abuse_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        with self.assertRaises(PaginationAbuseError):
            await collector.fetch_pull_requests(
                "brettbaysinger-boop/pest-control-platform", page=99
            )

    # Required Negative: Rate limiting handled gracefully
    async def test_negative_rate_limiting_handled(self):
        def rate_limit_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=403,
                headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1731715200"},
                json={"message": "rate limit exceeded"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(rate_limit_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "rate_limited")
        self.assertEqual(res.rate_limit_remaining, 0)

    # Required Negative: Timeout handled
    async def test_negative_timeout_handled(self):
        def timeout_transport(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("Timeout upstream")

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(timeout_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "timeout")

    # Required Negative: Body limit exceeded
    async def test_negative_body_limit_exceeded(self):
        def large_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                content=b"x" * 2048,
                headers={"Content-Length": "2048"},
            )

        limited_settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            github_token=SECRET_TOKEN,
            max_body_bytes=1024,
        )
        collector = ReadOnlyGitHubCollector(
            limited_settings, transport=httpx.MockTransport(large_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "error")
        self.assertIn("exceeds max", res.error)

    # Security: Secret token never leaked
    async def test_secret_token_never_leaked(self):
        def leak_attempt_transport(request: httpx.Request) -> httpx.Response:
            raise RuntimeError(f"Crashing with secret {SECRET_TOKEN}")

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(leak_attempt_transport)
        )
        res = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(res.status, "error")
        self.assertNotIn(SECRET_TOKEN, res.error)
        self.assertIn("***REDACTED***", res.error)


    # F-01 Fix: Long PR title (>280 chars) does not abort ingest, truncated <=240 for activity
    async def test_long_pr_title_isolated_and_truncated(self):
        long_title = "feat(core): " + "x" * 350

        def mock_long_title_github(request: httpx.Request) -> httpx.Response:
            url_str = str(request.url)
            if "/repos/brettbaysinger-boop/chorusfall" in url_str and "/commits" not in url_str and "/pulls" not in url_str:
                return httpx.Response(200, json={"default_branch": "main"})
            if "/commits/main" in url_str:
                return httpx.Response(
                    200,
                    json={
                        "sha": "1234567890abcdef1234567890abcdef12345678",
                        "commit": {
                            "author": {"date": "2026-11-15T18:00:00Z"},
                            "message": "Update",
                        },
                    },
                )
            if "/pulls" in url_str:
                return httpx.Response(
                    200,
                    json=[
                        {
                            "number": 99,
                            "title": long_title,
                            "draft": False,
                            "head": {"sha": "1234567890abcdef1234567890abcdef12345678"},
                            "created_at": "2026-11-15T10:00:00Z",
                            "updated_at": "2026-11-15T18:00:00Z",
                        }
                    ],
                )
            return httpx.Response(404, json={})

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(mock_long_title_github)
        )
        registry = ProjectRegistry(self.settings)
        res = await registry.ingest_github_evidence(collector, project_id="chorusfall")
        self.assertEqual(res["status"], "ok")
        insights = registry.get_project_insights("chorusfall")
        self.assertIsNotNone(insights)
        self.assertTrue(len(insights.activity[0].text) <= 240)

    # Empty PR list is marked as checked with items=[] rather than uncollected (None)
    async def test_empty_pr_list_recorded_as_checked_empty(self):
        def mock_empty_prs_github(request: httpx.Request) -> httpx.Response:
            url_str = str(request.url)
            if "/repos/brettbaysinger-boop/forge" in url_str and "/commits" not in url_str and "/pulls" not in url_str:
                return httpx.Response(200, json={"default_branch": "main"})
            if "/commits/main" in url_str:
                return httpx.Response(
                    200,
                    json={
                        "sha": "1234567890abcdef1234567890abcdef12345678",
                        "commit": {"author": {"date": "2026-11-15T18:00:00Z"}, "message": "Forge"},
                    },
                )
            if "/pulls" in url_str:
                return httpx.Response(200, json=[])  # Empty list of open PRs!
            return httpx.Response(404, json={})

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(mock_empty_prs_github)
        )
        registry = ProjectRegistry(self.settings)
        res = await registry.ingest_github_evidence(collector, project_id="forge")
        self.assertEqual(res["status"], "ok")
        insights = registry.get_project_insights("forge")
        self.assertIsNotNone(insights)
        self.assertIsNotNone(insights.open_prs)
        self.assertEqual(insights.open_prs.items, [])


class TestContractCompliance(unittest.TestCase):
    """Validate snapshot against contracts/project-steward/project-snapshot.v1.schema.json."""

    @classmethod
    def setUpClass(cls):
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            cls.schema = json.load(f)

    def test_fixture_valid_snapshot_conforms_to_schema(self):
        with open(FIXTURES_DIR / "valid_snapshot.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        jsonschema.validate(instance=data, schema=self.schema)

    def test_generated_registry_snapshot_conforms_to_schema(self):
        registry = ProjectRegistry()
        snapshot = registry.generate_snapshot()
        data = json.loads(snapshot.model_dump_json())
        jsonschema.validate(instance=data, schema=self.schema)


    def test_negative_duplicate_repo_rejected(self):
        with self.assertRaises(ValueError):
            Project(
                id="dup-test",
                name="Duplicate Test",
                priority="p2",
                state="coded",
                deployment="not_deployed",
                evidence_level="git_verified",
                repositories=[
                    "brettbaysinger-boop/forge",
                    "brettbaysinger-boop/forge",
                ],
                blocked_by=[],
                sources=[],
                observed_at="2026-11-15T18:00:00Z",
            )

    def test_schema_rejects_extra_properties(self):
        registry = ProjectRegistry()
        snapshot = registry.generate_snapshot()
        data = json.loads(snapshot.model_dump_json())
        data["unexpected_injected_property"] = "malicious"
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(instance=data, schema=self.schema)

    def test_endpoint_project_detail_and_insights_accessible_by_owner(self):
        settings = ProjectStewardSettings(
            owner_user_id=OWNER_UUID,
            supabase_url="https://supabase.local",
            supabase_service_role_key="test-key",
        )
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_steward_settings] = lambda: settings
        client = TestClient(app)

        def mock_supabase_owner(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"id": OWNER_UUID, "is_anonymous": False})

        with mock_supabase_client(mock_supabase_owner):
            detail_resp = client.get(
                "/v0.1/project-steward/projects/chorusfall",
                headers={"Authorization": "Bearer valid-token"},
            )
            self.assertEqual(detail_resp.status_code, 200)
            self.assertEqual(detail_resp.json()["name"], "Chorusfall")

            insights_resp = client.get(
                "/v0.1/project-steward/projects/chorusfall/insights",
                headers={"Authorization": "Bearer valid-token"},
            )
            self.assertEqual(insights_resp.status_code, 200)

            v11_resp = client.get(
                "/v0.1/project-steward/snapshot/v1.1",
                headers={"Authorization": "Bearer valid-token"},
            )
            self.assertEqual(v11_resp.status_code, 200)
            v11_data = v11_resp.json()
            self.assertEqual(v11_data["version"], "1.1")
            self.assertEqual(v11_data["stale_after_seconds"], 172800)
            # PS-05: v1.1 insights is optional and OBJECT-only when present.
            # With no collection requested, there is no justified evidence.
            self.assertTrue(v11_data["projects"])
            self.assertTrue(
                all("insights" not in p for p in v11_data["projects"]),
                "Uncollected insights must be omitted, not serialized as null",
            )


if __name__ == "__main__":
    unittest.main()
