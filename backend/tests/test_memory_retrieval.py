import unittest
from unittest.mock import AsyncMock

from lumen.memory_retrieval import rank_memories, terms
from lumen.db import SupabaseRepository


class Ranking(unittest.TestCase):
    def test_old_relevant_fact_survives_twelve_newer_facts(self):
        unrelated = [{"content": f"The user enjoys hobby {i}"} for i in range(30)]
        fact = {"content": "The user's favorite color is turquoise", "subject": "user"}
        self.assertIs(rank_memories(unrelated + [fact], "What is my favourite colour?")[0], fact)
        self.assertEqual(len(rank_memories(unrelated + [fact], "favorite color")), 12)

    def test_person_and_topic_beat_generic_topic(self):
        generic = {"content": "The user enjoys movie nights"}
        specific = {"content": "Sarah recommended the movie Arrival"}
        self.assertIs(rank_memories([generic, specific], "Which movie did Sarah recommend?")[0], specific)

    def test_topic_tags_are_searchable(self):
        fact = {"content": "The user likes turquoise", "tags": ["topic:favorite_color"]}
        self.assertIs(rank_memories([{"content": "The user likes coffee"}, fact], "favorite color")[0], fact)

    def test_questions_and_no_match_keep_baseline_order(self):
        facts = [{"content": "coffee"}, {"content": "turquoise"}]
        for query in ("", "How are you?", "unmatchedword"):
            self.assertEqual(rank_memories(facts, query), facts)

    def test_inactive_memory_never_returns(self):
        self.assertEqual(rank_memories([{"content": "color turquoise", "is_active": False}], "color"), [])

    def test_subject_and_source_are_preserved(self):
        fact = {"content": "favorite color gold", "subject": "companion", "id": "fact", "source": "report"}
        self.assertIs(rank_memories([fact], "color")[0], fact)
        self.assertEqual(fact["subject"], "companion")

    def test_ties_keep_database_order(self):
        facts = [{"content": "coffee", "id": str(i)} for i in range(20)]
        self.assertEqual(rank_memories(facts, "coffee"), facts[:12])

    def test_plural_unicode_and_topic_normalization(self):
        self.assertEqual(terms("MOVIES favourite_colour"), {"movie", "favorite", "color"})

    def test_limit(self):
        self.assertEqual(rank_memories([{"content": "coffee"}], "coffee", 0), [])


class RepositoryRetrieval(unittest.IsolatedAsyncioTestCase):
    def repository(self, rows):
        db = SupabaseRepository.__new__(SupabaseRepository)
        db._request = AsyncMock(return_value=rows)
        return db

    async def test_question_fetch_is_bounded_active_and_companion_scoped(self):
        db = self.repository([{"content": "coffee"}, {"content": "color turquoise"}])
        rows = await db.get_relevant_memories("owned-companion", query="color")
        self.assertEqual(rows[0]["content"], "color turquoise")
        params = db._request.call_args.kwargs["params"]
        self.assertEqual(params["companion_id"], "eq.owned-companion")
        self.assertEqual(params["is_active"], "eq.true")
        self.assertEqual(params["limit"], "500")
        self.assertNotIn("color", str(params))
        db._request.assert_awaited_once()

    async def test_general_memory_list_retains_old_query(self):
        db = self.repository([{"content": "coffee"}])
        await db.get_relevant_memories("companion")
        self.assertEqual(db._request.call_args.kwargs["params"]["limit"], "12")

    async def test_empty_database(self):
        self.assertEqual(await self.repository([]).get_relevant_memories("companion", query="color"), [])

    async def test_database_failure_is_not_disguised_as_no_memories(self):
        db = self.repository([])
        db._request.side_effect = RuntimeError("offline")
        with self.assertRaises(RuntimeError):
            await db.get_relevant_memories("companion", query="color")

    async def test_zero_limit_makes_no_request(self):
        db = self.repository([])
        self.assertEqual(await db.get_relevant_memories("companion", limit=0, query="color"), [])
        db._request.assert_not_awaited()


class RuntimeRetrieval(unittest.IsolatedAsyncioTestCase):
    async def test_current_question_reaches_repository_in_new_conversation(self):
        from test_memory import MemoryFlow
        runtime = MemoryFlow().runtime()
        runtime.provider.generate.return_value = dict(content="Turquoise.", model="test-model",
            latency_ms=1, tokens_in=1, tokens_out=1)
        await runtime.respond("companion", None, "What is my favorite color?")
        runtime.db.get_relevant_memories.assert_awaited_once_with(
            "companion", query="What is my favorite color?")

    async def test_general_recall_preserves_listing(self):
        from test_memory import MemoryFlow
        runtime = MemoryFlow().runtime()
        await runtime.respond("companion", "chat", "What do you remember?")
        runtime.db.get_relevant_memories.assert_awaited_once_with("companion", query="")
