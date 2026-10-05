import unittest
from unittest.mock import AsyncMock, Mock

from lumen.memory import requested_memory, memory_request, has_save_claim
from lumen.runtime import CognitionRuntime
from lumen.db import SupabaseRepository


class MemoryCommands(unittest.TestCase):
    def test_only_explicit_commands(self):
        for text in ("I like coffee", "Do you remember that I like coffee?",
                     "Don't remember that", "Remember:", "Remember that "):
            self.assertIsNone(requested_memory(text))
        self.assertEqual(requested_memory("Please remember that I like coffee"), "I like coffee")
        self.assertEqual(requested_memory("REMEMBER: I like coffee"), "I like coffee")

    def test_natural_requests_and_spoken_address(self):
        for text in (
            "Remember my favorite color is turquoise",
            "Lumen remember, my favorite color is turquoise",
            "Lumen, remember that my favorite color is turquoise",
            "Please Lumen remember my favorite color is turquoise",
            "Lumen please remember my favorite color is turquoise",
        ):
            self.assertEqual(requested_memory(text), "my favorite color is turquoise")
        self.assertEqual(requested_memory("Nova, remember I like coffee", "Nova"), "I like coffee")

    def test_recall_and_reminder_requests_are_not_saved(self):
        for text in ("Remember when we talked?", "Remember to call me tomorrow",
                     "Lumen, do you remember my favorite color?", "I remember my dog"):
            self.assertIsNone(requested_memory(text))


    def test_extended_requests(self):
        for text in (
            "you should remember that my favorite color is turquoise",
            "Lumen, you should really remember that my favorite color is turquoise",
            "save this to memory: my favorite color is turquoise",
            "Please put in your memory my favorite color is turquoise",
            "store this in long-term memory, my favorite color is turquoise",
        ):
            self.assertEqual(memory_request(text), (True, "my favorite color is turquoise"))

    def test_sentence_after_reference_is_not_saved(self):
        self.assertEqual(memory_request("you should remember that. i will remember it as wll"), (True, None))
        self.assertEqual(memory_request("Remember that my favorite season is summer."),
                         (True, "my favorite season is summer."))

    def test_unresolved_references(self):
        for text in ("Remember that", "Remember!", "put that in your memory.",
                     "you should really put that in your memory.", "save this to memory"):
            self.assertEqual(memory_request(text), (True, None))
        for text in ("Remembering my dog", "Don't save this to memory", "Can you remember my name?"):
            self.assertEqual(memory_request(text), (False, None))

    def test_generated_save_claims_are_corrected(self):
        for text in ("I've noted that today is your birthday.", "I'll remember your birthday!",
                     "I have saved your name.", "I’ve stored it in memory."):
            self.assertTrue(has_save_claim(text))
        for text in ("Your favorite color is turquoise.", "The memory says you like coffee.", "I remember your favorite color is turquoise."):
            self.assertFalse(has_save_claim(text))


class MemoryFlow(unittest.IsolatedAsyncioTestCase):
    def runtime(self):
        runtime = CognitionRuntime.__new__(CognitionRuntime)
        runtime.settings = Mock(conversation_model="test-model")
        runtime.provider = Mock(name="ollama", generate=AsyncMock())
        runtime.provider.name = "ollama"
        runtime.db = Mock(
            get_companion=AsyncMock(return_value={"name": "Lumen"}),
            get_conversation=AsyncMock(return_value={"id": "chat"}),
            create_conversation=AsyncMock(return_value={"id": "new-chat"}),
            get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[]),
            get_recent_messages=AsyncMock(return_value=[]),
            remember=AsyncMock(return_value="saved"),
            create_message=AsyncMock(return_value={"id": "message"}),
            touch_conversation=AsyncMock(),
        )
        return runtime

    async def test_selected_model_used_for_reply_and_rewrite(self):
        r = self.runtime()
        r.db.get_companion.return_value = {"name": "Lumen", "conversation_model": "chosen-chat"}
        r.provider.generate.side_effect = [
            dict(content="I've saved your preference.", model="chosen-chat", latency_ms=1, tokens_in=1, tokens_out=1),
            dict(content="You like summer.", model="chosen-chat", latency_ms=1, tokens_in=1, tokens_out=1)]
        result = await r.respond("companion", "chat", "I like summer.")
        self.assertEqual(result.model, "chosen-chat")
        self.assertEqual([call.args[0] for call in r.provider.generate.await_args_list], ["chosen-chat", "chosen-chat"])
        self.assertEqual(r.settings.conversation_model, "test-model")

    async def test_background_observation_queued_after_chat_is_saved(self):
        r = self.runtime()
        r.settings.memory_observations_enabled = True
        r.db._request = AsyncMock()
        r.provider.generate.return_value = dict(content="Summer sounds lovely.", model="test-model", latency_ms=1, tokens_in=1, tokens_out=1)
        reply = await r.respond("companion", "chat", "Summer is my favorite season.")
        self.assertEqual(reply.observation_message_id, "message")
        self.assertEqual(reply.memory_status, "none")
        r.db.remember.assert_not_awaited()
        r.db._request.assert_awaited_once()
        self.assertEqual(r.db.create_message.await_count, 2)
        r.db._request.side_effect = RuntimeError("offline")
        reply = await r.respond("companion", "chat", "I like summer.")
        self.assertIsNone(reply.observation_message_id)
        self.assertEqual(reply.content, "Summer sounds lovely.")

    async def test_save_then_recall_in_another_conversation(self):
        r = self.runtime()
        reply = await r.respond("companion", None, "Remember: I like coffee")
        r.db.remember.assert_awaited_once_with("companion", "new-chat", "I like coffee", "user")
        self.assertIn("Saved", reply.content)
        self.assertEqual(reply.memory_status, "saved")
        metadata = r.db.create_message.call_args.args[0]["metadata"]
        self.assertEqual(metadata["memory_status"], "saved")
        r.provider.generate.assert_not_awaited()
        r.db.get_relevant_memories.return_value = [{"type": "semantic", "content": "I like coffee"}]
        r.provider.generate.return_value = dict(content="Coffee", model="test-model",
            latency_ms=1, tokens_in=1, tokens_out=1)
        await r.respond("companion", "other-chat", "What do I like?")
        prompt = r.provider.generate.call_args.args[1][0]["content"]
        self.assertIn("I like coffee", prompt)
        self.assertEqual(r.db.remember.await_count, 1)

    async def test_failed_save_never_claims_success(self):
        r = self.runtime()
        r.db.remember.side_effect = RuntimeError("database unavailable")
        with self.assertRaises(RuntimeError):
            await r.respond("companion", "chat", "Remember: I like coffee")
        r.db.create_message.assert_not_awaited()

    async def test_ambiguous_request_does_not_guess_or_generate(self):
        r = self.runtime()
        r.db.get_recent_messages.return_value = [{"role": "assistant", "content": "Your birthday is today"}]
        reply = await r.respond("companion", "chat", "you should really put that in your memory.")
        self.assertEqual(reply.memory_status, "clarification_needed")
        self.assertIn("exact fact", reply.content)
        r.db.remember.assert_not_awaited()
        r.provider.generate.assert_not_awaited()

    async def test_ordinary_chat_cannot_set_saved_status(self):
        r = self.runtime()
        r.provider.generate.side_effect = [
            dict(content="I've noted your birthday.", model="test-model", latency_ms=1, tokens_in=1, tokens_out=1),
            dict(content="That refers to you, Brett.", model="test-model", latency_ms=2, tokens_in=2, tokens_out=2),
        ]
        reply = await r.respond("companion", "chat", "Lumen, whose name is Brett?")
        self.assertEqual(reply.memory_status, "none")
        self.assertEqual(reply.content, "That refers to you, Brett.")
        self.assertEqual(reply.latency_ms, 3)
        self.assertEqual(r.provider.generate.await_count, 2)
        r.db.remember.assert_not_awaited()

    async def test_repeated_bad_claim_falls_back_to_saved_facts(self):
        r = self.runtime()
        r.db.get_relevant_memories.return_value = [{"content": "my favorite color is turquoise", "type": "semantic"}]
        r.provider.generate.side_effect = [dict(content="I've saved your color.", model="test-model",
            latency_ms=1, tokens_in=1, tokens_out=1) for _ in range(2)]
        reply = await r.respond("companion", "chat", "Whose favorite color is turquoise?")
        self.assertIn("my favorite color is turquoise", reply.content)
        self.assertFalse(has_save_claim(reply.content))
        self.assertEqual(reply.memory_status, "none")
        self.assertEqual(r.provider.generate.await_count, 2)
        r.db.remember.assert_not_awaited()

    async def test_normal_fact_answers_are_not_replaced(self):
        for question, answer in (
            ("lumen, whos favorite time of year is summer?", "Yours, Brett. Your favorite season is summer."),
            ("lumen, whos name is brett?", "Your name is Brett."),
            ("lumen, whos favorite color is turquoise?", "Your favorite color is turquoise."),
        ):
            r = self.runtime()
            r.provider.generate.return_value = dict(content=answer, model="test-model",
                latency_ms=1, tokens_in=1, tokens_out=1)
            reply = await r.respond("companion", "chat", question)
            self.assertEqual(reply.content, answer)
            self.assertEqual(r.provider.generate.await_count, 1)
            r.db.remember.assert_not_awaited()

    async def test_recall_lists_database_facts_without_model_claims(self):
        r = self.runtime()
        r.db.get_relevant_memories.return_value = [{"content": "My favorite season is summer", "type": "semantic"}]
        reply = await r.respond("companion", "chat", "what do you remember?")
        self.assertIn("My favorite season is summer", reply.content)
        self.assertEqual(reply.memory_status, "none")
        r.provider.generate.assert_not_awaited()
        r.db.remember.assert_not_awaited()

    async def test_existing_and_deleted_statuses(self):
        for outcome in ("existing", "deleted"):
            r = self.runtime()
            r.db.remember.return_value = outcome
            reply = await r.respond("companion", "chat", "You should remember that I like coffee")
            self.assertEqual(reply.memory_status, outcome)
            self.assertNotIn("Saved to", reply.content)

    async def test_deleted_memory_is_not_resurrected(self):
        db = SupabaseRepository.__new__(SupabaseRepository)
        db._request = AsyncMock(return_value=[{"is_active": False}])
        self.assertEqual(await db.remember("companion", "chat", "fact"), "deleted")
        self.assertEqual(db._request.await_count, 1)

    async def test_write_uses_source_and_companion_scope(self):
        db = SupabaseRepository.__new__(SupabaseRepository)
        db._request = AsyncMock(side_effect=[[], []])
        self.assertEqual(await db.remember("companion", "chat", "fact"), "saved")
        payload = db._request.call_args.kwargs["json"]
        self.assertEqual(payload["companion_id"], "companion")
        self.assertEqual(payload["source"], "explicit_user_request")


if __name__ == "__main__":
    unittest.main()
