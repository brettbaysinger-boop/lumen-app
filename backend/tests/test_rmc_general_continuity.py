"""D01-64B: cross-chat continuity beyond nicknames (fictional tests only)."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.rmc_continuity import durable_continuity_evidence
from lumen.rmc_auto_ingest import auto_ingest_rmc_user_message

USER = "00000000-0000-4000-8000-00000000ada1"
COMPANION = "00000000-0000-4000-8000-0000000c0a01"
CHAT = "00000000-0000-4000-8000-0000000000c1"
SOURCE_ID = "00000000-0000-4000-8000-00000000f014"
PROJECT = "My ongoing project is building a fantasy roleplaying game."


class ContinuityEvidenceTests(unittest.TestCase):
    def test_explicit_preferences_projects_and_rituals_eligible(self):
        for statement in (
            "Please call me Night Owl.",
            "I prefer when you speak with warmth and humor.",
            "My ongoing project is building a fantasy roleplaying game.",
            "I'm currently working on a medieval game world.",
            "My long-term goal is to publish a novel.",
            "Our weekly ritual is chatting over coffee.",
            "Our inside joke is calling Mondays Dragon Day.",
            "You and I often joke about the flying penguin.",
            "Whenever we chat, we always begin with a joke.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(durable_continuity_evidence(statement), statement)

    def test_uncertain_transient_and_questions_are_not_auto_continuity(self):
        for statement in (
            "Should we remember every conversation?",
            "Imagine my ongoing project is building a spaceship.",
            "My ongoing project is maybe fixing the house.",
            "I'm currently working on it just now.",
            "Please call me Night Owl?",
            "You are my girlfriend and you love me.",
            "Our weekly ritual is to use my bank account.",
            "My ongoing project is developing a new password.",
            "If we talk later, we could start a tradition.",
            "The sky is blue.",
        ):
            with self.subTest(statement=statement):
                self.assertIsNone(durable_continuity_evidence(statement))


class NativeRmcContinuityFlow(unittest.IsolatedAsyncioTestCase):
    async def test_user_ongoing_project_is_saved_verbatim_without_llm(self):
        settings = SimpleNamespace(
            lumen_memory_backend="rmc", rmc_auto_ingest_enabled=True
        )
        message = {
            "id": SOURCE_ID, "conversation_id": CHAT, "companion_id": COMPANION,
            "role": "user", "content": PROJECT,
            "metadata": {"rmc_auto_state": "pending"},
        }
        companion = {
            "id": COMPANION, "owner_user_id": USER, "name": "Lumen",
            "auto_memory_enabled": True,
        }
        with patch("lumen.rmc_auto_ingest.SupabaseRepository") as repo_class, \
             patch("lumen.rmc_auto_ingest.LumenRmcMemory") as memory_class, \
             patch("lumen.rmc_auto_ingest._screen", new=AsyncMock(
                 side_effect=AssertionError("LLM must not invent project memory"))):
            repo = repo_class.return_value
            repo.get_companion = AsyncMock(return_value=companion)
            async def scoped(method, table, **kwargs):
                if method == "GET" and table == "messages":
                    return [message]
                if method == "PATCH" and table == "messages":
                    return []
                raise AssertionError(f"Forbidden {method} {table}")
            repo._request = AsyncMock(side_effect=scoped)
            memory = memory_class.return_value
            memory.remember = AsyncMock(return_value="stored")  # adapter uses 'saved'
            memory.remember.return_value = "saved"
            await auto_ingest_rmc_user_message(
                settings, "fictional-auth-token", USER, SOURCE_ID
            )
            memory.remember.assert_awaited_once()
            _, conversation, key, evidence = memory.remember.call_args.args
            self.assertEqual(conversation, CHAT)
            self.assertEqual(evidence, PROJECT)
            self.assertTrue(key.startswith("auto:"))
            meta = repo._request.call_args.kwargs["json"]["metadata"]
            self.assertEqual(meta["rmc_auto_state"], "saved")
            self.assertEqual(meta["rmc_auto_kind"], "durable_continuity")
            self.assertEqual(meta["rmc_auto_confirmed_count"], 1)
            self.assertEqual(repo_class.call_args.args[1], "fictional-auth-token")

    async def test_companion_opt_out_never_ingests(self):
        settings = SimpleNamespace(
            lumen_memory_backend="rmc", rmc_auto_ingest_enabled=True)
        message = {
            "id": SOURCE_ID, "conversation_id": CHAT, "companion_id": COMPANION,
            "role": "user", "content": PROJECT,
            "metadata": {"rmc_auto_state": "pending"},
        }
        companion = {
            "id": COMPANION, "owner_user_id": USER, "name": "Lumen",
            "auto_memory_enabled": False,
        }
        with patch("lumen.rmc_auto_ingest.SupabaseRepository") as repo_class, \
             patch("lumen.rmc_auto_ingest.LumenRmcMemory") as memory_class:
            repo = repo_class.return_value
            repo._request = AsyncMock(return_value=[message])
            repo.get_companion = AsyncMock(return_value=companion)
            await auto_ingest_rmc_user_message(
                settings, "fictional-auth-token", USER, SOURCE_ID
            )
            memory_class.return_value.remember.assert_not_called()


if __name__ == "__main__":
    unittest.main()
