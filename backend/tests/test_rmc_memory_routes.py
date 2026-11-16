"""RMC Memories-tab routes: account isolation, fail-closed modes, truthful outcomes."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen.auth import AuthUser, require_user
from lumen.rmc.memory_routes import router

ADA = "00000000-0000-4000-8000-00000000ada1"
BEN = "00000000-0000-4000-8000-00000000be11"
COMPANION = "00000000-0000-4000-8000-0000000c0a01"


class MemoryPanelTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_user] = lambda: AuthUser(ADA, "fictional-auth-token")
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

        settings = SimpleNamespace(lumen_memory_backend="rmc")
        settings_patch = patch("lumen.rmc.memory_routes.get_settings", return_value=settings)
        settings_patch.start()
        self.addCleanup(settings_patch.stop)
        self.settings = settings

        repo_patch = patch("lumen.rmc.memory_routes.SupabaseRepository")
        self.repo_class = repo_patch.start()
        self.addCleanup(repo_patch.stop)
        self.repo = self.repo_class.return_value
        self.repo.get_companion = AsyncMock(return_value={
            "id": COMPANION, "owner_user_id": ADA, "name": "Lumen"
        })
        self.repo._request = AsyncMock(return_value=[])

        memory_patch = patch("lumen.rmc.memory_routes.LumenRmcMemory")
        self.memory_class = memory_patch.start()
        self.addCleanup(memory_patch.stop)
        self.memory = self.memory_class.return_value
        self.memory.relevant = AsyncMock(return_value=("ok", []))
        self.memory.remember = AsyncMock(return_value="saved")

    def test_unsigned_request_refused(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client:
            self.assertEqual(client.get("/v0.2/rmc/memories",
                params={"companion_id": COMPANION, "q": "kayak"}).status_code, 401)

    def test_only_rmc_mode_can_access_routes(self):
        self.settings.lumen_memory_backend = "supabase"
        for endpoint in ("/v0.2/rmc/memories", "/v0.2/rmc/receipts"):
            result = self.client.get(endpoint, params={
                "companion_id": COMPANION, "q": "kayak"})
            self.assertEqual(result.status_code, 409)
        result = self.client.post("/v0.2/rmc/memories", json={
            "companion_id": COMPANION, "request_id": str(uuid4()), "content": "Fact"})
        self.assertEqual(result.status_code, 409)
        self.memory.remember.assert_not_awaited()
        self.memory.relevant.assert_not_awaited()
        self.repo.get_companion.assert_not_awaited()

    def test_foreign_companion_is_not_searchable_or_writable(self):
        self.repo.get_companion.return_value["owner_user_id"] = BEN
        result = self.client.get("/v0.2/rmc/memories",
            params={"companion_id": COMPANION, "q": "kayak"})
        self.assertEqual(result.status_code, 404)
        result = self.client.post("/v0.2/rmc/memories", json={
            "companion_id": COMPANION, "request_id": str(uuid4()), "content": "Fact"})
        self.assertEqual(result.status_code, 404)
        result = self.client.get("/v0.2/rmc/receipts", params={"companion_id": COMPANION})
        self.assertEqual(result.status_code, 404)
        self.memory.remember.assert_not_awaited()
        self.memory.relevant.assert_not_awaited()
        self.repo._request.assert_not_awaited()

    def test_search_is_limited_relevant_evidence_not_inventory(self):
        self.memory.relevant.return_value = ("ok", [
            {"id": str(i), "content": "Fictional " + str(i), "type": "rmc"}
            for i in range(20)
        ])
        result = self.client.get("/v0.2/rmc/memories",
            params={"companion_id": COMPANION, "q": "kayak"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["backend"], "rmc")
        self.assertEqual(result.json()["scope"], "relevant_evidence")
        self.assertIs(result.json()["complete_inventory"], False)
        self.assertEqual(len(result.json()["memories"]), 12)
        self.repo_class.assert_called_with(self.settings, "fictional-auth-token")
        self.repo._request.assert_not_awaited()

    def test_search_privacy_and_gateway_failure_are_not_empty_successes(self):
        for status, expected in (("privacy_denied", 403), ("denied", 403),
                                 ("unavailable", 503), ("uncertain", 503)):
            self.memory.relevant.return_value = (status, [])
            response = self.client.get("/v0.2/rmc/memories",
                params={"companion_id": COMPANION, "q": "kayak"})
            self.assertEqual(response.status_code, expected)

    def test_save_reports_only_confirmed_outcomes(self):
        reqid = str(uuid4())
        payload = {"companion_id": COMPANION, "request_id": reqid,
                   "content": " Fictional Ada owns a kayak named Pebble "}
        for outcome, confirmed in (("saved", True), ("existing", True),
                                  ("not_saved", False), ("memory_off", False),
                                  ("unconfirmed", False)):
            self.memory.remember.return_value = outcome
            response = self.client.post("/v0.2/rmc/memories", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {
                "backend": "rmc", "status": outcome, "confirmed": confirmed
            })
        args = self.memory.remember.call_args.args
        self.assertEqual(args[-2], reqid)
        self.assertEqual(args[-1], "Fictional Ada owns a kayak named Pebble")
        self.repo._request.assert_not_awaited()

    def test_save_whitespace_and_invalid_identifiers_are_refused(self):
        bad = {"companion_id": COMPANION, "request_id": str(uuid4()), "content": "   "}
        self.assertEqual(self.client.post("/v0.2/rmc/memories", json=bad).status_code, 422)
        bad["request_id"] = "not-a-uuid"
        self.assertEqual(self.client.post("/v0.2/rmc/memories", json=bad).status_code, 422)
        self.memory.remember.assert_not_awaited()

    def test_chat_receipts_only_include_rmc_tagged_assistant_messages(self):
        self.repo._request.return_value = [
            {"id": "1", "content": "Old Supabase saved", "created_at": "2026-11-01",
             "metadata": {"memory_status": "saved", "memory_backend": "supabase"}},
            {"id": "2", "content": "New RMC saved", "created_at": "2026-11-15",
             "metadata": {"memory_status": "saved", "memory_backend": "rmc"}},
            {"id": "3", "content": "ordinary reply", "created_at": "2026-11-15",
             "metadata": {"memory_status": "none", "memory_backend": "rmc"}},
            {"id": "4", "content": "Uncertain", "created_at": "2026-11-15",
             "metadata": {"memory_status": "unconfirmed", "memory_backend": "rmc"}},
        ]
        reply = self.client.get("/v0.2/rmc/receipts", params={"companion_id": COMPANION})
        self.assertEqual(reply.status_code, 200)
        self.assertEqual([r["id"] for r in reply.json()["receipts"]], ["2", "4"])
        self.assertEqual(self.repo._request.call_args.args, ("GET", "messages"))
        self.assertIn("not a complete inventory", reply.json()["notice"])


if __name__ == "__main__":
    unittest.main()
