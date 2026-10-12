import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.semantic_worker import (
    index_memory_batch_background,
    queue_semantic_index,
)


class FakeBackground:
    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args, **kwargs):
        self.calls.append((fn, args, kwargs))


def settings(master=False, after=False, batch=4):
    return SimpleNamespace(
        semantic_memory_enabled=master,
        semantic_index_after_chat=after,
        semantic_embedding_batch=batch,
    )


class SemanticAfterChatTests(unittest.IsolatedAsyncioTestCase):
    def test_off_by_default(self):
        bg = FakeBackground()
        self.assertFalse(queue_semantic_index(bg, settings(), "token", "companion"))
        self.assertEqual(bg.calls, [])

    def test_both_flags_required(self):
        for master, after in ((True, False), (False, True)):
            bg = FakeBackground()
            self.assertFalse(
                queue_semantic_index(bg, settings(master, after), "token", "companion")
            )
            self.assertEqual(bg.calls, [])

    def test_enabled_queues_exact_bounded_batch(self):
        bg = FakeBackground()
        self.assertTrue(
            queue_semantic_index(
                bg,
                settings(True, True, 4),
                "user-jwt",
                "companion-id",
            )
        )
        self.assertEqual(len(bg.calls), 1)
        fn, args, kwargs = bg.calls[0]
        self.assertIs(fn, index_memory_batch_background)
        self.assertEqual(args[1:], ("user-jwt", "companion-id"))
        self.assertEqual(kwargs, {"limit": 4})

    async def test_background_failure_is_swallowed(self):
        with patch(
            "lumen.semantic_worker.index_memory_batch",
            AsyncMock(side_effect=RuntimeError("private failure")),
        ):
            result = await index_memory_batch_background(
                settings(True, True),
                "secret-token",
                "companion-id",
                limit=4,
            )
        self.assertIsNone(result)

    async def test_background_success_returns_nothing_private(self):
        result_obj = SimpleNamespace(
            requested=4,
            indexed=4,
            already_indexed=0,
            stale=0,
            inactive=0,
            failed=0,
        )
        with patch(
            "lumen.semantic_worker.index_memory_batch",
            AsyncMock(return_value=result_obj),
        ):
            result = await index_memory_batch_background(
                settings(True, True),
                "secret-token",
                "companion-id",
                limit=4,
            )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
