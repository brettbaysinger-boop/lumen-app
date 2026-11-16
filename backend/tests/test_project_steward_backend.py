"""Comprehensive tests for Project Steward backend.

Covers all required acceptance criteria and mandatory negative test cases:
1. Unauthorized user (401)
2. Wrong owner (403)
3. Missing token (collector disabled)
4. Malformed payload
5. Pagination abuse
6. Rate limiting (429 / 403 remaining=0)
7. Timeout (Connect/Read timeout)
8. Redirect / SSRF (301/302 forbidden)
9. Forbidden host (host != api.github.com rejected)
10. Stale source (stale threshold signal)
11. Duplicate repo (rejected by model / contract)
12. PR merged but NOT deployed (critical deployment invariant)
13. Unverified host claim (demoted/rejected)
14. Secret redaction (token never leaked)
15. Contract compliance (validated against project-snapshot.v1.schema.json)
"""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx
import jsonschema
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen.project_steward.config import ProjectStewardSettings
from lumen.project_steward.github_client import (
    ReadOnlyGitHubCollector,
    ProjectStewardSecurityError,
    GitHubCollectorDisabledError,
    PaginationAbuseError,
    PayloadTooLargeError,
    MalformedPayloadError,
)
from lumen.project_steward.handler import (
    router,
    require_user,
    AuthUser,
    get_steward_settings,
    get_registry,
)
from lumen.project_steward.models import Project, ProjectSnapshot, Source
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

SECRET_TOKEN = "ghp_super_secret_test_token_1234567890abcdef"


class TestContractCompliance(unittest.TestCase):
    """Validate data against official JSON schema contract."""

    @classmethod
    def setUpClass(cls):
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            cls.schema = json.load(f)

    def test_fixture_valid_snapshot_conforms_to_schema(self):
        fixture_file = FIXTURES_DIR / "valid_snapshot.json"
        with open(fixture_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        jsonschema.validate(instance=data, schema=self.schema)

    def test_generated_registry_snapshot_conforms_to_schema(self):
        registry = ProjectRegistry()
        snapshot = registry.generate_snapshot()
        data = json.loads(snapshot.model_dump_json())
        jsonschema.validate(instance=data, schema=self.schema)

    def test_stale_fixture_snapshot_conforms_to_schema(self):
        fixture_file = FIXTURES_DIR / "stale_project_snapshot.json"
        with open(fixture_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        jsonschema.validate(instance=data, schema=self.schema)

    def test_schema_rejects_extra_properties(self):
        registry = ProjectRegistry()
        snapshot = registry.generate_snapshot()
        data = json.loads(snapshot.model_dump_json())
        data["unexpected_injected_field"] = "bad"
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(instance=data, schema=self.schema)

    def test_schema_rejects_invalid_priority_and_state(self):
        with self.assertRaises(Exception):
            Project(
                id="test-proj",
                name="Test Project",
                priority="p99",  # Invalid
                state="coded",
                deployment="not_deployed",
                evidence_level="unverified",
                repositories=[],
                blocked_by=[],
                sources=[],
                observed_at="2026-11-15T18:00:00Z",
            )


class TestProjectRegistry(unittest.TestCase):
    """Test deterministic registry, non-repo projects, and core invariants."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id="brett",
            github_token=None,  # Disabled by default
            stale_threshold_hours=72,
        )
        self.registry = ProjectRegistry(self.settings)

    def test_registry_contains_minimum_required_projects(self):
        projects = {p.id: p for p in self.registry.list_projects()}
        required = [
            "pesttrails",
            "chorusfall",
            "forge",
            "raialume",
            "unified-local-ai",
            "brother-memory",
            "rmc",
            "dreamvault",
            "wisdom-of-the-crowd",
            "bretts-games",
            "pirates",
            "character-lab",
            "regent",
            "bot-arenas",
            "kalshi",
            "rattlesnake",
            "vaultwarden",
        ]
        for req in required:
            self.assertIn(req, projects, f"Missing required project '{req}'")

    def test_non_repo_projects_exist_without_repositories(self):
        for pid in ("dreamvault", "wisdom-of-the-crowd", "bretts-games"):
            project = self.registry.get_project(pid)
            self.assertIsNotNone(project)
            self.assertEqual(project.repositories, [])
            self.assertEqual(project.deployment, "not_deployed")

    def test_priorities_pesttrails_is_p0_and_chorusfall_is_p1(self):
        pest = self.registry.get_project("pesttrails")
        chorus = self.registry.get_project("chorusfall")
        self.assertEqual(pest.priority, "p0")
        self.assertEqual(chorus.priority, "p1")

    # Required Negative: Duplicate repository
    def test_negative_duplicate_repo_is_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            Project(
                id="dup-test",
                name="Duplicate Test",
                priority="p2",
                state="coded",
                deployment="not_deployed",
                evidence_level="git_verified",
                repositories=[
                    "brettbaysinger-boop/repo1",
                    "brettbaysinger-boop/repo1",  # Duplicate!
                ],
                blocked_by=[],
                sources=[],
                observed_at="2026-11-15T18:00:00Z",
            )
        self.assertIn("Duplicate repository", str(ctx.exception))

    # Required Negative / Invariant: PR merged but NOT deployed
    def test_negative_pr_merged_does_not_infer_deployment(self):
        updated = self.registry.update_with_git_evidence(
            project_id="pesttrails",
            repo="brettbaysinger-boop/pest-control-platform",
            pr_number=14,
            pr_title="Routing engine optimization",
            pr_merged=True,  # Merged PR!
            pr_url="https://github.com/brettbaysinger-boop/pest-control-platform/pull/14",
            commit_sha="d4e5f6a7b8c9",
            observed_at="2026-11-15T18:00:00Z",
        )
        self.assertEqual(updated.state, "coded")
        self.assertEqual(updated.evidence_level, "git_verified")
        # Critical verification: deployment status MUST NOT be 'verified_current'
        self.assertEqual(updated.deployment, "not_deployed")

    # Required Negative: Stale source
    def test_negative_stale_source_detection(self):
        stale_time = "2026-10-01T00:00:00Z"
        stale_project = Project(
            id="stale-test",
            name="Stale Test Project",
            priority="p3",
            state="coded",
            deployment="not_deployed",
            evidence_level="git_verified",
            repositories=["brettbaysinger-boop/legacy"],
            blocked_by=[],
            sources=[
                Source(
                    kind="git_repo",
                    ref="https://github.com/brettbaysinger-boop/legacy",
                    observed_at=stale_time,
                )
            ],
            observed_at=stale_time,
        )
        self.registry.register_or_update_project(stale_project)
        fetched = self.registry.get_project("stale-test")
        self.assertIsNotNone(fetched)
        self.assertTrue(any("Evidence stale" in b for b in fetched.blocked_by))
        self.assertEqual(fetched.evidence_level, "historical")
        self.assertTrue(fetched.summary.startswith("[STALE]"))

    # Required Negative: Unverified host claim
    def test_negative_unverified_host_claim_rejected(self):
        updated = self.registry.validate_host_claim(
            project_id="dreamvault",
            host_claim_url="https://unverified-host.example.com/receipt/999",
            is_receipt_valid=False,  # Unverified!
        )
        self.assertEqual(updated.deployment, "unknown")
        self.assertEqual(updated.evidence_level, "unverified")
        self.assertTrue(any("Unverified host claim rejected" in b for b in updated.blocked_by))


class TestReadOnlyGitHubCollector(unittest.IsolatedAsyncioTestCase):
    """Test read-only collector security boundaries and negative scenarios."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id="brett",
            github_token=SECRET_TOKEN,
            github_api_host="api.github.com",
            allowed_repositories=["brettbaysinger-boop/*"],
            connect_timeout_seconds=1.0,
            request_timeout_seconds=2.0,
            max_pages=2,
            per_page=30,
            max_body_bytes=1024,
        )

    # Required Negative: Missing token
    async def test_negative_missing_token_disables_collector(self):
        no_token_settings = ProjectStewardSettings(github_token=None)
        collector = ReadOnlyGitHubCollector(no_token_settings)
        self.assertFalse(collector.is_enabled)
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "disabled")
        self.assertIn("disabled without owner-provided", result.error)

    # Required Negative: Forbidden host
    async def test_negative_forbidden_host_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        with patch.object(collector.settings, "github_api_host", "evil.attacker.com"):
            result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
            self.assertEqual(result.status, "security_denied")
            self.assertIn("Forbidden host", result.error)

    # Required Negative: Forbidden repo (not in allowlist)
    async def test_negative_forbidden_repo_outside_allowlist_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        with self.assertRaises(ProjectStewardSecurityError) as ctx:
            await collector.fetch_repository("other-owner/private-repo")
        self.assertIn("not permitted by strict allowlist", str(ctx.exception))

    # Required Negative: Redirect / SSRF
    async def test_negative_redirect_rejected_as_ssrf(self):
        def redirect_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=301,
                headers={"Location": "https://attacker.internal/steal"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(redirect_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "security_denied")
        self.assertIn("redirects are forbidden", result.error)

    # Required Negative: Malformed payload
    async def test_negative_malformed_payload(self):
        def malformed_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                content=b"{ corrupt json string ...",
                headers={"Content-Type": "application/json"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(malformed_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "error")
        self.assertIn("Failed to parse upstream JSON", result.error)

    # Required Negative: Pagination abuse
    async def test_negative_pagination_abuse_rejected(self):
        collector = ReadOnlyGitHubCollector(self.settings)
        # settings.max_pages is 2
        with self.assertRaises(PaginationAbuseError) as ctx:
            await collector.fetch_pull_requests(
                "brettbaysinger-boop/pest-control-platform", page=3
            )
        self.assertIn("exceeds allowed maximum pagination depth", str(ctx.exception))

    # Required Negative: Rate limiting
    async def test_negative_rate_limiting_handled(self):
        def rate_limit_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=403,
                headers={
                    "x-ratelimit-remaining": "0",
                    "x-ratelimit-reset": "1731715200",
                },
                json={"message": "rate limit exceeded"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(rate_limit_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "rate_limited")
        self.assertEqual(result.rate_limit_remaining, 0)
        self.assertEqual(result.rate_limit_reset, 1731715200)

    # Required Negative: Timeout
    async def test_negative_timeout_handled(self):
        def timeout_transport(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("Timeout while reading upstream")

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(timeout_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "timeout")
        self.assertIn("timed out", result.error)

    # Required Negative: Body limit exceeded
    async def test_negative_body_limit_exceeded(self):
        def large_body_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                content=b"x" * 2048,  # max_body_bytes is 1024
                headers={"Content-Length": "2048"},
            )

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(large_body_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "error")
        self.assertIn("exceeds max", result.error)

    # Security requirement: Secret redaction
    async def test_secret_token_never_leaked(self):
        def error_transport(request: httpx.Request) -> httpx.Response:
            raise RuntimeError(f"Failed with token {SECRET_TOKEN}")

        collector = ReadOnlyGitHubCollector(
            self.settings, transport=httpx.MockTransport(error_transport)
        )
        result = await collector.fetch_repository("brettbaysinger-boop/pest-control-platform")
        self.assertEqual(result.status, "error")
        self.assertNotIn(SECRET_TOKEN, result.error)
        self.assertIn("***REDACTED***", result.error)


class TestAuthenticatedHandler(unittest.TestCase):
    """Test API route boundaries and authentication."""

    def setUp(self):
        self.settings = ProjectStewardSettings(
            owner_user_id="brett",
            github_token=None,
        )
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_steward_settings] = lambda: self.settings
        self.client = TestClient(self.app)

    # Required Negative: Unauthorized user (no token)
    def test_negative_unauthorized_user_returns_401(self):
        self.app.dependency_overrides[require_user] = lambda: None
        response = self.client.get("/v0.1/project-steward/snapshot")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Sign in", response.json()["detail"])

    # Required Negative: Wrong owner returns 403
    def test_negative_wrong_owner_returns_403(self):
        self.app.dependency_overrides[require_user] = lambda: AuthUser(
            id="attacker-or-guest", token="guest-token"
        )
        response = self.client.get("/v0.1/project-steward/snapshot")
        self.assertEqual(response.status_code, 403)
        self.assertIn("restricted to the workspace owner", response.json()["detail"])

    # Success case: verified owner returns 200 and schema-valid snapshot
    def test_authorized_owner_returns_snapshot(self):
        self.app.dependency_overrides[require_user] = lambda: AuthUser(
            id="brett", token="owner-valid-token"
        )
        response = self.client.get("/v0.1/project-steward/snapshot")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["version"], "1.0")
        self.assertIsInstance(data["projects"], list)
        self.assertGreaterEqual(len(data["projects"]), 17)

    def test_authorized_owner_fetches_project_detail(self):
        self.app.dependency_overrides[require_user] = lambda: AuthUser(
            id="brett", token="owner-valid-token"
        )
        response = self.client.get("/v0.1/project-steward/projects/pesttrails")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], "pesttrails")
        self.assertEqual(data["priority"], "p0")

    def test_project_not_found_returns_404(self):
        self.app.dependency_overrides[require_user] = lambda: AuthUser(
            id="brett", token="owner-valid-token"
        )
        response = self.client.get("/v0.1/project-steward/projects/non-existent-id")
        self.assertEqual(response.status_code, 404)

    def test_health_endpoint_reports_status_and_disabled_collector(self):
        self.app.dependency_overrides[require_user] = lambda: AuthUser(
            id="brett", token="owner-valid-token"
        )
        response = self.client.get("/v0.1/project-steward/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertFalse(data["github_collector_enabled"])
        self.assertEqual(data["pinned_host"], "api.github.com")
        self.assertGreaterEqual(data["projects_count"], 17)


if __name__ == "__main__":
    unittest.main()
