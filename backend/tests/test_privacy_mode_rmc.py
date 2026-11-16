"""Public mode against the deployed RMC automatic learning (D01-63E, PR #38): owner review of PR #43.

Real routes, real runtime, real BackgroundTasks queue and the real auto-ingest worker. Only the
outside world is faked: Supabase (MockTransport), the model, and the RMC gateway (records writes).
With rmc_auto_ingest_enabled=True an ordinary durable preference must cause zero scheduled jobs and
zero RMC writes in Public, while Private keeps its approved behaviour (the control case).
"""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from lumen import rmc_auto_ingest
from tests.test_privacy_mode import COMPANION_ID, CONVERSATION_ID, USER_ID, FakeModel, FakeSupabase

STATEMENT = "My favorite fruit is golden kiwi."   # passes the deterministic safe-preference gate


def rmc_settings():
    return SimpleNamespace(supabase_url="http://supabase.test", supabase_service_role_key="service",
                           ollama_url="http://ollama.test", conversation_model="test-model",
                           memory_observation_model=None, memory_observations_enabled=False,
                           lumen_memory_backend="rmc", rmc_auto_ingest_enabled=True)


class OwnedSupabase(FakeSupabase):
    def rows(self, table):
        if table == "companions":
            return [{"id": COMPANION_ID, "name": "Lumen", "persona": "Warm.", "owner_user_id": USER_ID,
                     "auto_memory_enabled": True}]
        return super().rows(table)


class FakeRmc:
    writes = []

    def __init__(self, settings=None, user_id=None):
        pass

    async def relevant(self, companion, conversation_id, message):
        return "ok", []

    async def remember(self, companion, conversation_id, key, content):
        FakeRmc.writes.append((key, content))
        return "saved"


class PublicModeRmcAutoIngestTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from lumen.auth import AuthUser, require_user
        from lumen import main
        self.main = main
        main.app.dependency_overrides[require_user] = lambda: AuthUser(id=USER_ID, token="user-token")
        self.supabase = OwnedSupabase()
        FakeRmc.writes = []
        self.scheduled = []
        real_worker = rmc_auto_ingest.auto_ingest_rmc_user_message

        async def spy(*args):
            self.scheduled.append(args[-1])
            await real_worker(*args)
        original = httpx.AsyncClient
        self.patches = [
            patch("lumen.db.httpx.AsyncClient",
                  side_effect=lambda **kw: original(transport=httpx.MockTransport(self.supabase.handler), **kw)),
            patch.object(main, "settings", rmc_settings()),
            patch.object(main, "auto_ingest_rmc_user_message", side_effect=spy),
            patch("lumen.runtime.OllamaProvider", side_effect=lambda s: FakeModel()),
            patch("lumen.runtime.LumenRmcMemory", FakeRmc),
            patch("lumen.rmc_auto_ingest.LumenRmcMemory", FakeRmc),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        for item in self.patches:
            item.stop()
        self.main.app.dependency_overrides.clear()

    def send(self, path, mode):
        result = self.client.post(path, json={"companion_id": COMPANION_ID, "conversation_id": CONVERSATION_ID,
                                              "message": STATEMENT, "privacy_mode": mode})
        self.assertEqual(result.status_code, 200, result.text)
        return result

    def user_rows(self):
        return [m for m in self.supabase.messages if m.get("role") == "user" and m.get("content") == STATEMENT]

    def test_private_control_still_learns_automatically(self):
        self.send("/v0.2/respond/stream", "private")
        self.assertEqual(len(self.scheduled), 1)
        self.assertEqual(len(FakeRmc.writes), 1)          # proves the path is live in this test

    def test_public_stream_turn_schedules_nothing_and_writes_nothing(self):
        self.send("/v0.2/respond/stream", "public")
        self.assertEqual(self.scheduled, [])
        self.assertEqual(FakeRmc.writes, [])
        [row] = self.user_rows()
        self.assertEqual(row["metadata"].get("privacy_mode"), "public")
        self.assertNotIn("rmc_auto_state", row["metadata"])

    def test_public_blocking_turn_schedules_nothing_and_writes_nothing(self):
        self.send("/v0.1/respond", "public")
        self.assertEqual(self.scheduled, [])
        self.assertEqual(FakeRmc.writes, [])

    def test_public_runtime_never_offers_a_message_for_learning(self):
        import asyncio
        from lumen.privacy_mode import PublicCognitionRuntime
        runtime = PublicCognitionRuntime(rmc_settings(), "user-token", USER_ID)
        self.assertFalse(runtime.settings.rmc_auto_ingest_enabled)
        self.assertTrue(runtime.settings.supabase_url)                    # everything else is unchanged
        runtime.provider = FakeModel()
        asyncio.run(runtime.respond(COMPANION_ID, CONVERSATION_ID, STATEMENT))
        self.assertIsNone(runtime.rmc_auto_message_id)
        runtime.rmc_auto_message_id = "forced"                           # even if something sets it later
        self.assertIsNone(runtime.rmc_auto_message_id)
        self.assertEqual(self.scheduled, [])

    def test_queue_refuses_a_public_runtime_even_if_it_carries_a_message_id(self):
        from fastapi import BackgroundTasks
        # A stand-in that does carry a message id, so only the queue's own check is tested here.
        instance = SimpleNamespace(privacy_mode="public", rmc_auto_message_id="new-1")
        tasks = BackgroundTasks()
        self.main.queue_rmc_memory_work(tasks, SimpleNamespace(id=USER_ID, token="t"), instance)
        self.assertEqual(tasks.tasks, [])
        self.main.queue_rmc_memory_work(tasks, SimpleNamespace(id=USER_ID, token="t"),
                                        SimpleNamespace(privacy_mode="private", rmc_auto_message_id="new-1"))
        self.assertEqual(len(tasks.tasks), 1)                         # Private is queued as before


class WorkerRefusesPublicRowsTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_skips_public_tagged_pending_rows_before_screening(self):
        supabase = OwnedSupabase()
        supabase.messages.insert(0, {"id": "pub-1", "role": "user", "content": STATEMENT,
                                     "companion_id": COMPANION_ID, "conversation_id": CONVERSATION_ID,
                                     "metadata": {"privacy_mode": "public", "rmc_auto_state": "pending"}})
        FakeRmc.writes = []
        original = httpx.AsyncClient
        with patch("lumen.db.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(supabase.handler), **kw)), \
             patch("lumen.rmc_auto_ingest.LumenRmcMemory", FakeRmc), \
             patch("lumen.rmc_auto_ingest._screen") as screen:
            for _ in range(2):                                  # a retry is refused the same way
                await rmc_auto_ingest.auto_ingest_rmc_user_message(rmc_settings(), "t", USER_ID, "pub-1")
        screen.assert_not_called()
        self.assertEqual(FakeRmc.writes, [])
        self.assertFalse([m for m, t, _ in supabase.requests if m == "PATCH"])   # no receipt written either

    async def test_worker_still_learns_from_private_rows(self):
        supabase = OwnedSupabase()
        supabase.messages.insert(0, {"id": "priv-1", "role": "user", "content": STATEMENT,
                                     "companion_id": COMPANION_ID, "conversation_id": CONVERSATION_ID,
                                     "metadata": {"rmc_auto_state": "pending"}})
        FakeRmc.writes = []
        original = httpx.AsyncClient
        with patch("lumen.db.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(supabase.handler), **kw)), \
             patch("lumen.rmc_auto_ingest.LumenRmcMemory", FakeRmc):
            await rmc_auto_ingest.auto_ingest_rmc_user_message(rmc_settings(), "t", USER_ID, "priv-1")
        self.assertEqual(len(FakeRmc.writes), 1)
