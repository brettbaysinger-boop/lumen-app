"""D01-67: entirely fictional Private transcript transfer contract tests."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.rmc_transcript import transcript_parts, ingest_private_exchange
from lumen.rmc_shared_nicknames import agreed_nicknames

USER = "00000000-0000-4000-8000-00000000ada1"
OTHER_USER = "00000000-0000-4000-8000-00000000be11"
COMPANION = "00000000-0000-4000-8000-0000000c0a01"
OTHER_COMPANION = "00000000-0000-4000-8000-0000000c0a02"
CHAT = "00000000-0000-4000-8000-0000000000c1"
USER_ID = "00000000-0000-4000-8000-00000000f001"
ASSISTANT_ID = "00000000-0000-4000-8000-00000000f002"


class TranscriptFormatTests(unittest.TestCase):
    def test_verbatim_untruncated_text_all_parts_and_role_are_retained(self):
        text = "A" * 7100 + "\n[assistant]\n" + "B" * 7600
        row = {
            "id": USER_ID, "role": "user", "content": text,
            "created_at": "2026-11-18T00:00:00Z",
        }
        parts = transcript_parts(row)
        self.assertGreaterEqual(len(parts), 3)
        self.assertTrue(all(len(part) < 10000 for part in parts))
        obj = [json.loads(item.split("\n", 1)[1]) for item in parts]
        self.assertEqual("".join(part["text"] for part in obj), text)
        self.assertTrue(all(part["role"] == "USER" for part in obj))
        self.assertEqual([part["part"] for part in obj], list(range(1, len(obj) + 1)))
        self.assertTrue(all(part["parts"] == len(obj) for part in obj))

    def test_control_characters_cannot_exceed_gateway_limit(self):
        row = {"id": USER_ID, "role": "assistant",
               "content": "\x00\n" * 4000, "created_at": "2026-11-18T00:00:00Z"}
        items = transcript_parts(row)
        self.assertTrue(all(len(item) < 10000 for item in items))
        self.assertEqual("".join(json.loads(item.split("\n", 1)[1])["text"]
                                 for item in items), row["content"])
        self.assertTrue(all('"role": "ASSISTANT"' in item for item in items))

    def test_bad_roles_refused(self):
        with self.assertRaises(ValueError):
            transcript_parts({"id": USER_ID, "role": "system", "content": "hi"})


class PrivateExchangeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            lumen_memory_backend="rmc", rmc_auto_ingest_enabled=True,
        )
        self.user = {
            "id": USER_ID, "conversation_id": CHAT, "companion_id": COMPANION,
            "role": "user", "content": "Sure, that works for me.",
            "created_at": "2026-11-18T00:00:00Z",
            "metadata": {"rmc_transcript_state": "pending", "original": "retain"},
        }
        self.assistant = {
            "id": ASSISTANT_ID, "conversation_id": CHAT, "companion_id": COMPANION,
            "role": "assistant", "content": "You got it!",
            "created_at": "2026-11-18T00:00:01Z", "metadata": {},
        }
        self.companion = {
            "id": COMPANION, "owner_user_id": USER, "name": "Lumen",
            "auto_memory_enabled": True,
        }
        repo_patch = patch("lumen.rmc_transcript.SupabaseRepository")
        self.repo_class = repo_patch.start()
        self.addCleanup(repo_patch.stop)
        self.repo = self.repo_class.return_value
        self.patches = []
        async def request(method, table, **kw):
            if method == "GET" and table == "messages":
                marker = kw["params"]["id"]
                if marker == "eq." + USER_ID:
                    return [self.user]
                if marker == "eq." + ASSISTANT_ID:
                    return [self.assistant]
                return []
            if method == "PATCH" and table == "messages":
                self.patches.append(kw["json"]["metadata"])
                self.user["metadata"] = kw["json"]["metadata"]
                return []
            raise AssertionError(f"Forbidden table/operation {method} {table}")
        self.repo._request = AsyncMock(side_effect=request)
        self.repo.get_companion = AsyncMock(return_value=self.companion)
        self.repo.get_conversation = AsyncMock(return_value={"id": CHAT})
        engine_patch = patch("lumen.rmc_transcript.LumenRmcMemory")
        self.engine = engine_patch.start().return_value
        self.addCleanup(engine_patch.stop)
        self.engine.remember = AsyncMock(return_value="saved")

    async def _run(self):
        await ingest_private_exchange(
            self.settings, "fictional-user-token", USER,
            USER_ID, ASSISTANT_ID,
        )

    async def test_both_roles_saved_without_extractor_and_confirmed(self):
        await self._run()
        self.assertEqual(self.engine.remember.await_count, 2)
        calls = self.engine.remember.await_args_list
        self.assertEqual(calls[0].args[2], f"transcript:{USER_ID}:0")
        self.assertEqual(calls[1].args[2], f"transcript:{ASSISTANT_ID}:0")
        self.assertIn("Sure, that works for me.", calls[0].args[3])
        self.assertIn("You got it!", calls[1].args[3])
        self.assertEqual(self.patches[0]["rmc_transcript_state"], "saved")
        self.assertEqual(self.patches[0]["rmc_transcript_confirmed_parts"], 2)
        self.assertEqual(self.patches[0]["rmc_transcript_total_parts"], 2)
        self.assertEqual(self.patches[0]["original"], "retain")

    async def test_second_execution_never_duplicate_writes(self):
        await self._run()
        await self._run()
        self.assertEqual(self.engine.remember.await_count, 2)

    async def test_uncertain_does_not_claim_save(self):
        self.engine.remember.return_value = "unconfirmed"
        await self._run()
        self.assertEqual(self.engine.remember.await_count, 1)
        self.assertEqual(self.patches[0]["rmc_transcript_state"], "unconfirmed")
        self.assertEqual(self.patches[0]["rmc_transcript_confirmed_parts"], 0)

    async def test_public_user_or_assistant_never_enter_gateway(self):
        for row in (self.user, self.assistant):
            row["metadata"]["privacy_mode"] = "public"
            await self._run()
            row["metadata"].pop("privacy_mode")
        self.engine.remember.assert_not_awaited()
        self.assertFalse(self.patches)

    async def test_cross_companion_message_fails_closed(self):
        self.assistant["companion_id"] = OTHER_COMPANION
        await self._run()
        self.engine.remember.assert_not_awaited()

    async def test_foreign_owner_fails_closed(self):
        self.companion["owner_user_id"] = OTHER_USER
        await self._run()
        self.engine.remember.assert_not_awaited()

    async def test_disabling_auto_memory_prevents_archive(self):
        self.companion["auto_memory_enabled"] = False
        await self._run()
        self.engine.remember.assert_not_awaited()

    async def test_missing_conversation_prevents_archive(self):
        self.repo.get_conversation.return_value = None
        await self._run()
        self.engine.remember.assert_not_awaited()

    async def test_memory_off_or_backend_other_skips_reads(self):
        for backend, enabled in (("rmc", False), ("supabase", True)):
            self.settings.lumen_memory_backend = backend
            self.settings.rmc_auto_ingest_enabled = enabled
            await self._run()
        self.repo._request.assert_not_awaited()
        self.engine.remember.assert_not_awaited()


class NaturalNicknameCases(unittest.TestCase):
    def test_exact_missed_cases_from_d01_66_now_recognize(self):
        cases = (
            ("I'm going to call you Sunshine.", "", "Of course, I like it!"),
            ("Your nickname is Sunshine.", "", "You got it!"),
            ("Sure, that works for me.", "You can call me Sunshine.", ""),
        )
        for user, prior, current in cases:
            with self.subTest(user=user):
                self.assertIsNotNone(agreed_nicknames(
                    user, prior, current, "Lumen",
                ))

    def test_denial_and_hypothetical_not_durable(self):
        self.assertIsNone(agreed_nicknames(
            "Sure, but not today.", "You can call me Sunshine.", "", "Lumen",
        ))
        self.assertIsNone(agreed_nicknames(
            "Maybe. You got it?", "You can call me Sunshine.", "", "Lumen",
        ))


if __name__ == "__main__":
    unittest.main()
