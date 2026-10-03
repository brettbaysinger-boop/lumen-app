import unittest
from unittest.mock import AsyncMock, Mock

from lumen.memory import requested_memory
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


class MemoryFlow(unittest.IsolatedAsyncioTestCase):
    def runtime(self):
        runtime = CognitionRuntime.__new__(CognitionRuntime)
        runtime.settings = Mock(conversation_model="test-model")
        runtime.provider = Mock(name="ollama", generate=AsyncMock())
        runtime.provider.name = "ollama"
        runtime.db = Mock(
            get_companion=AsyncMock(return_value={"name": "Lumen"}),
            create_conversation=AsyncMock(return_value={"id": "new-chat"}),
            get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[]),
            get_recent_messages=AsyncMock(return_value=[]),
            remember=AsyncMock(return_value="saved"),
            create_message=AsyncMock(return_value={"id": "message"}),
            touch_conversation=AsyncMock(),
        )
        return runtime

    async def test_save_then_recall_in_another_conversation(self):
        r = self.runtime()
        reply = await r.respond("companion", None, "Remember: I like coffee")
        r.db.remember.assert_awaited_once_with("companion", "new-chat", "I like coffee")
        self.assertIn("Saved", reply.content)
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
