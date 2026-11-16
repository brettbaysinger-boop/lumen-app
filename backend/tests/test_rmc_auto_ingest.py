"""D01-63: automatic RMC ingestion is screened, idempotent and RMC-only."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from lumen.observations import Candidate
from lumen.rmc_auto_ingest import (
    approved_evidence, auto_ingest_rmc_user_message,
    deterministic_safe_preference, _screen,
)

USER = "00000000-0000-4000-8000-00000000ada1"
COMPANION = "00000000-0000-4000-8000-0000000c0a01"
CHAT = "00000000-0000-4000-8000-0000000000c1"
MESSAGE = "00000000-0000-4000-8000-00000000f001"
SOURCE = "My dog Max is a golden retriever."


def candidate(evidence=SOURCE, **changes):
    values = dict(
        content="The user has a golden retriever named Max.",
        evidence=evidence, subject="user", type="relationship",
        direct_assertion=True, sensitive=False, conflicting=False,
        topic="pet_dog", durable=True,
    )
    values.update(changes)
    return Candidate(**values)


class ApprovalTests(unittest.TestCase):
    def test_verbatim_durable_user_fact_is_eligible(self):
        self.assertEqual(approved_evidence(SOURCE, candidate(), "Lumen"), SOURCE)

    def test_clear_nonsensitive_favorite_is_deterministically_approved(self):
        for source in (
            "My favorite fruit is golden kiwi.",
            "My favorite fruit is ripe papaya.",
            "My favorite color is blue.",
        ):
            with self.subTest(source=source):
                proposed = deterministic_safe_preference(source)
                self.assertIsNotNone(proposed)
                self.assertEqual(approved_evidence(source, proposed, "Lumen"), source)
                self.assertFalse(proposed.sensitive)
                self.assertTrue(proposed.direct_assertion)

    def test_ambiguous_and_sensitive_preferences_do_not_bypass_model_screen(self):
        bad = (
            "My favorite fruit is golden kiwi?",
            "My favorite fruit is 123456789.",
            "My favorite fruit is my bank password.",
            "My favorite fruit is something, but maybe mango.",
            "My favorite fruit is apple; my email is me@example.com.",
            "Imagine my favorite fruit is golden kiwi.",
            "My favorite fruit is golden kiwi. I have a question.",
        )
        for source in bad:
            with self.subTest(source=source):
                self.assertIsNone(deterministic_safe_preference(source))

    def test_no_sensitive_or_inferred_or_unverified_memory(self):
        examples = [
            ("My bank account has money.", candidate(
                content="The user has money in a bank account.",
                evidence="My bank account has money.")),
            (SOURCE, candidate(evidence="My dog Max is a labrador.")),
            (SOURCE, candidate(sensitive=True)),
            (SOURCE, candidate(direct_assertion=False)),
            (SOURCE, candidate(subject="companion")),
            (SOURCE, candidate(conflicting=True)),
            (SOURCE, candidate(durable=False)),
            (SOURCE, candidate(topic="")),
            ("Can you draw a picture of my dog Max?",
             candidate(evidence="my dog Max", content="The user has a dog Max.")),
        ]
        for source, c in examples:
            with self.subTest(source=source, candidate=c):
                self.assertIsNone(approved_evidence(source, c, "Lumen"))


class DeterministicScreenTests(unittest.IsolatedAsyncioTestCase):
    async def test_obvious_fact_does_not_depend_on_model_classification(self):
        settings = SimpleNamespace()
        companion = {"name": "Lumen", "conversation_model": "does-not-exist"}
        with patch("lumen.rmc_auto_ingest.OllamaProvider") as ollama:
            result = await _screen(settings, "My favorite fruit is ripe papaya.", companion)
        ollama.assert_not_called()
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].evidence, "My favorite fruit is ripe papaya.")
        self.assertTrue(result[0].direct_assertion)

class RmcAutoTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            lumen_memory_backend="rmc",
            rmc_auto_ingest_enabled=True,
        )
        self.message = {
            "id": MESSAGE, "conversation_id": CHAT, "companion_id": COMPANION,
            "role": "user", "content": SOURCE,
            "metadata": {"rmc_auto_state": "pending", "original": "preserve"},
        }
        self.companion = {
            "id": COMPANION, "owner_user_id": USER, "name": "Lumen",
            "auto_memory_enabled": True,
        }
        repo_patch = patch("lumen.rmc_auto_ingest.SupabaseRepository")
        self.repo_class = repo_patch.start()
        self.addCleanup(repo_patch.stop)
        self.repo = self.repo_class.return_value
        async def operation(method, table, **kw):
            if method == "GET":
                if table == "messages":
                    return [self.message]
                raise AssertionError("RMC must not read Supabase memory tables")
            if method == "PATCH" and table == "messages":
                return []
            raise AssertionError(f"Forbidden operation: {method} {table}")
        self.repo._request = AsyncMock(side_effect=operation)
        self.repo.get_companion = AsyncMock(return_value=self.companion)
        engine_patch = patch("lumen.rmc_auto_ingest.LumenRmcMemory")
        self.engine_class = engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.engine = self.engine_class.return_value
        self.engine.remember = AsyncMock(return_value="saved")

    async def _run(self, proposals=None):
        with patch("lumen.rmc_auto_ingest._screen", new=AsyncMock(
            return_value=[candidate()] if proposals is None else proposals)):
            await auto_ingest_rmc_user_message(
                self.settings, "fictional-user-token", USER, MESSAGE)

    def test_disabled_by_default_does_not_query_anything(self):
        self.assertFalse(getattr(SimpleNamespace(lumen_memory_backend="rmc"),
                                 "rmc_auto_ingest_enabled", False))

    async def test_enabled_valid_fact_invokes_rmc_once_and_writes_receipt_only(self):
        await self._run()
        self.engine.remember.assert_awaited_once()
        companion, chat, source_key, evidence = self.engine.remember.call_args.args
        self.assertEqual(companion["owner_user_id"], USER)
        self.assertEqual(chat, CHAT)
        self.assertEqual(source_key, "auto:" + MESSAGE + ":0")
        self.assertEqual(evidence, SOURCE)  # never send model paraphrase
        write = self.repo._request.call_args
        self.assertEqual(write.args, ("PATCH", "messages"))
        self.assertEqual(write.kwargs["json"]["metadata"], {
            "rmc_auto_state": "saved",
            "rmc_auto_confirmed_count": 1, "original": "preserve",
        })
        self.assertEqual(self.repo_class.call_args.args[1], "fictional-user-token")

    async def test_uncertain_save_not_reported_as_confirmed(self):
        self.engine.remember.return_value = "unconfirmed"
        await self._run()
        metadata = self.repo._request.call_args.kwargs["json"]["metadata"]
        self.assertEqual(metadata["rmc_auto_state"], "unconfirmed")
        self.assertEqual(metadata["rmc_auto_confirmed_count"], 0)

    async def test_no_qualifying_fact_does_not_call_gateway(self):
        await self._run([candidate(sensitive=True)])
        self.engine.remember.assert_not_awaited()
        metadata = self.repo._request.call_args.kwargs["json"]["metadata"]
        self.assertEqual(metadata["rmc_auto_state"], "no_durable_fact")

    async def test_foreign_companion_fails_closed(self):
        self.companion["owner_user_id"] = "00000000-0000-4000-8000-00000000be11"
        await self._run()
        self.engine.remember.assert_not_awaited()
        self.assertEqual(self.repo._request.await_count, 1)

    async def test_owner_auto_setting_off_prevents_learning(self):
        self.companion["auto_memory_enabled"] = False
        await self._run()
        self.engine.remember.assert_not_awaited()
        self.assertEqual(self.repo._request.await_count, 1)

    async def test_rmc_flag_or_backend_off_skips_without_reads(self):
        for backend, enabled in (("supabase", True), ("rmc", False)):
            self.settings.lumen_memory_backend = backend
            self.settings.rmc_auto_ingest_enabled = enabled
            await self._run()
        self.repo._request.assert_not_awaited()
        self.engine.remember.assert_not_awaited()

    async def test_nonpending_prevents_duplicate_ingestion(self):
        self.message["metadata"]["rmc_auto_state"] = "saved"
        await self._run()
        self.engine.remember.assert_not_awaited()

    async def test_screen_cancelled_by_foreground_chat_is_deferred(self):
        with patch("lumen.rmc_auto_ingest._screen",
                   new=AsyncMock(side_effect=asyncio.CancelledError)):
            await auto_ingest_rmc_user_message(
                self.settings, "fictional-user-token", USER, MESSAGE)
        self.engine.remember.assert_not_awaited()
        meta = self.repo._request.call_args.kwargs["json"]["metadata"]
        self.assertEqual(meta["rmc_auto_state"], "deferred")
        self.assertEqual(meta["rmc_auto_confirmed_count"], 0)


if __name__ == "__main__":
    unittest.main()
