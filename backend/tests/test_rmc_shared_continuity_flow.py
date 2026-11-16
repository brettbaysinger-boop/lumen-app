"""D01-64 integration: a short, explicit nickname acceptance reaches RMC."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.rmc_auto_ingest import auto_ingest_rmc_user_message

USER = "00000000-0000-4000-8000-00000000ada1"
COMPANION = "00000000-0000-4000-8000-0000000c0a01"
CHAT = "00000000-0000-4000-8000-0000000000c1"
SOURCE_ID = "00000000-0000-4000-8000-00000000f013"


class SharedNicknameIngestion(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            lumen_memory_backend="rmc",
            rmc_auto_ingest_enabled=True,
        )
        self.message = {
            "id": SOURCE_ID, "conversation_id": CHAT,
            "companion_id": COMPANION, "role": "user",
            "content": "I love that name!",
            "created_at": "2026-11-16T12:00:00Z",
            "metadata": {"rmc_auto_state": "pending"},
        }
        self.companion = {
            "id": COMPANION, "owner_user_id": USER,
            "name": "Lumen", "auto_memory_enabled": True,
        }
        repo_patch = patch("lumen.rmc_auto_ingest.SupabaseRepository")
        self.repo_class = repo_patch.start()
        self.addCleanup(repo_patch.stop)
        self.repo = self.repo_class.return_value
        self.repo.get_companion = AsyncMock(return_value=self.companion)
        async def request(method, table, **kwargs):
            if method == "GET" and table == "messages":
                if kwargs["params"].get("id") == "eq." + SOURCE_ID:
                    return [self.message]
                if kwargs["params"].get("role") == "eq.assistant":
                    return [{"role": "assistant",
                             "content": 'Let\'s call ourselves "Silver Sparks", our duo nickname.'}]
            if method == "PATCH" and table == "messages":
                return []
            raise AssertionError(f"Unexpected {method} {table}")
        self.repo._request = AsyncMock(side_effect=request)
        engine_patch = patch("lumen.rmc_auto_ingest.LumenRmcMemory")
        self.engine_class = engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.engine = self.engine_class.return_value
        self.engine.remember = AsyncMock(return_value="saved")

    async def test_short_affirmation_saves_shared_name_without_llm(self):
        with patch("lumen.rmc_auto_ingest._screen",
                   new=AsyncMock(side_effect=AssertionError("do not call model"))):
            await auto_ingest_rmc_user_message(
                self.settings, "fictional-user-token", USER, SOURCE_ID,
                "That sounds perfect to me.",
            )
        self.engine.remember.assert_awaited_once()
        companion, conversation, key, evidence = self.engine.remember.call_args.args
        self.assertEqual(conversation, CHAT)
        self.assertEqual(companion["owner_user_id"], USER)
        self.assertTrue(key.startswith("auto-shared:"))
        self.assertIn("Silver Sparks", evidence)
        self.assertIn("user agreed", evidence.lower())
        self.assertEqual(self.repo._request.call_args.args, ("PATCH", "messages"))
        metadata = self.repo._request.call_args.kwargs["json"]["metadata"]
        self.assertEqual(metadata["rmc_auto_state"], "saved")
        self.assertEqual(metadata["rmc_auto_confirmed_count"], 1)
        self.assertEqual(metadata["rmc_auto_kind"], "agreed_nickname")

    async def test_owner_memory_off_refuses_any_nickname_write(self):
        self.companion["auto_memory_enabled"] = False
        await auto_ingest_rmc_user_message(
            self.settings, "fictional-user-token", USER, SOURCE_ID,
            "That's perfect.",
        )
        self.engine.remember.assert_not_awaited()

    async def test_unconfirmed_does_not_claim_saved(self):
        self.engine.remember.return_value = "unconfirmed"
        with patch("lumen.rmc_auto_ingest._screen", new=AsyncMock(return_value=[])):
            await auto_ingest_rmc_user_message(
                self.settings, "fictional-user-token", USER, SOURCE_ID,
                "That sounds good.",
            )
        metadata = self.repo._request.call_args.kwargs["json"]["metadata"]
        self.assertEqual(metadata["rmc_auto_state"], "unconfirmed")
        self.assertEqual(metadata["rmc_auto_confirmed_count"], 0)


if __name__ == "__main__":
    unittest.main()
