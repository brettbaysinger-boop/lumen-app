"""Extraction prompt budget, safe automatic saving and worker failure paths.

All statements, memories and identifiers are fictional.
"""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.observations import (
    Candidate,
    Candidates,
    automatic_candidate,
    estimate_tokens,
    extraction_prompt_budget,
    fit_extraction_messages,
    observe,
)
from lumen.ollama import prioritize_chat


def candidate(**kw):
    base = {"content": "The user prefers summer.", "evidence": "Summer is my favorite season.",
            "subject": "user", "type": "preference", "direct_assertion": True,
            "sensitive": False, "conflicting": False, "durable": True,
            "topic": "preferred_season"}
    base.update(kw)
    return base


class Worker(unittest.IsolatedAsyncioTestCase):
    """Fake PostgREST + Ollama. propose_memory mimics the SQL exact-duplicate guard."""

    def setup_worker(self, candidates, statement="Summer is my favorite season.", *,
                     prior=None, memories=None, settings=None, prompt_eval_count=None,
                     propose_hook=None):
        self.settings = settings or SimpleNamespace(memory_observation_model="",
                                                    conversation_model="local-model")
        self.calls = []
        self.proposed = set()

        async def request(method, table, **kwargs):
            self.calls.append((method, table, kwargs))
            if table == "rpc/claim_memory_observation":
                return True
            if table == "messages":
                if "id" in kwargs.get("params", {}):
                    return [{"role": "user", "content": statement, "companion_id": "c1",
                             "conversation_id": "conv1", "created_at": "t1"}]
                return list(reversed(prior or []))
            if table == "memories":
                return memories or []
            if table == "rpc/propose_memory":
                if propose_hook:
                    await propose_hook(kwargs["json"])
                key = kwargs["json"]["p_content"].strip().lower()
                if key in self.proposed:
                    return None
                self.proposed.add(key)
                return f"suggestion-{len(self.proposed)}"
            return []

        async def structured(model, messages, schema, **kwargs):
            if prompt_eval_count is not None and kwargs.get("stats") is not None:
                kwargs["stats"]["prompt_eval_count"] = prompt_eval_count
            return json.dumps({"candidates": candidates})

        self.db = SimpleNamespace(_request=AsyncMock(side_effect=request),
                                  get_companion=AsyncMock(return_value={"name": "Nova"}))
        self.provider = SimpleNamespace(structured=AsyncMock(side_effect=structured))
        self.repository = None

    async def run_worker(self, token="fictional-user-jwt"):
        def repository(*args):
            self.repository = args
            return self.db
        with patch("lumen.observations.SupabaseRepository", side_effect=repository), \
             patch("lumen.observations.OllamaProvider", return_value=self.provider):
            await observe(self.settings, token, "source")

    def tables(self, table):
        return [c for c in self.calls if c[1] == table]

    def status(self):
        return [c for c in self.calls if c[1] == "memory_observations"][-1][2]["json"]["status"]

    def sent(self):
        messages = self.provider.structured.call_args.args[1]
        return messages, json.loads(messages[1]["content"])


class PromptBudgetTests(Worker):
    def budget_tokens(self, messages):
        schema = json.dumps(Candidates.model_json_schema(), ensure_ascii=False)
        return sum(estimate_tokens(m["content"]) for m in messages) + estimate_tokens(schema)

    async def test_ordinary_message_keeps_context_and_memories(self):
        prior = [{"role": "assistant", "content": "What season do you like?"}]
        memories = [{"content": "The user enjoys summer hikes.", "subject": "user",
                     "is_active": True, "tags": []}]
        self.setup_worker([], prior=prior, memories=memories)
        await self.run_worker()
        messages, payload = self.sent()
        self.assertEqual(messages[0]["role"], "system")
        self.assertEqual(payload["user_statement"], "Summer is my favorite season.")
        self.assertEqual(len(payload["conversation_context"]), 1)
        self.assertEqual(len(payload["existing_memories"]), 1)
        self.assertEqual(self.status(), "done")

    async def test_64k_ascii_source_fails_closed_without_model_or_writes(self):
        statement = ("My garden notes for the week. " * 2200)[:64000]
        self.setup_worker([candidate(evidence="My garden notes for the week.")],
                          statement=statement)
        await self.run_worker()
        self.provider.structured.assert_not_awaited()
        self.assertFalse(self.tables("rpc/propose_memory"))
        self.assertFalse(self.tables("rpc/auto_save_memory_suggestion"))
        self.assertEqual(self.status(), "failed")  # retryable, never "done"

    async def test_64k_non_ascii_source_fails_closed(self):
        statement = ("Mi jardín favorito está en Málaga. 日本語のメモ。🌻 " * 1400)[:64000]
        self.setup_worker([], statement=statement)
        await self.run_worker()
        self.provider.structured.assert_not_awaited()
        self.assertEqual(self.status(), "failed")

    async def test_non_ascii_is_sent_unescaped_and_counted_by_bytes(self):
        statement = "Mi jardín favorito está en Málaga."
        self.setup_worker([], statement=statement)
        await self.run_worker()
        messages, payload = self.sent()
        self.assertIn("jardín", messages[1]["content"])
        self.assertNotIn("\\u00ed", messages[1]["content"])
        self.assertEqual(payload["user_statement"], statement)
        self.assertEqual(estimate_tokens("日本"), 6)  # 3 UTF-8 bytes each

    async def test_huge_tags_and_long_prior_turns_are_dropped_before_the_statement(self):
        statement = "My summer garden plan includes tomatoes and basil. " * 30  # ~1.5k chars
        prior = [{"role": role, "content": "garden summer " * 200}
                 for role in ("user", "assistant") * 3]
        memories = [{"content": "The user plans a summer garden. " * 15, "subject": "user",
                     "is_active": True, "tags": ["topic:summer_garden_" + "x" * 70] * 40}
                    for _ in range(6)]
        self.setup_worker([], statement=statement, prior=prior, memories=memories)
        await self.run_worker()
        messages, payload = self.sent()
        self.assertEqual(payload["user_statement"], statement)  # never shortened
        self.assertLess(len(payload["existing_memories"]), 6)
        self.assertLessEqual(self.budget_tokens(messages),
                             extraction_prompt_budget(self.settings))
        self.assertEqual(self.status(), "done")

    async def test_ollama_reporting_more_tokens_than_budget_fails_closed(self):
        self.setup_worker([candidate()], prompt_eval_count=4099)
        await self.run_worker()
        self.assertFalse(self.tables("rpc/propose_memory"))
        self.assertEqual(self.status(), "failed")

    async def test_structured_reports_prompt_eval_count_only_when_asked(self):
        import httpx
        from lumen.ollama import OllamaProvider

        def handler(request):
            return httpx.Response(200, json={"message": {"content": "{}"},
                                             "prompt_eval_count": 1959})
        original = httpx.AsyncClient
        with patch("lumen.ollama.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            provider = OllamaProvider(SimpleNamespace(ollama_url="http://local-ollama"))
            stats = {}
            self.assertEqual(await provider.structured("local", [], {}, stats=stats), "{}")
            self.assertEqual(stats, {"prompt_eval_count": 1959})
            self.assertEqual(await provider.structured("local", [], {}), "{}")

    def test_budget_uses_the_smaller_window_and_reserves_output(self):
        default = SimpleNamespace()
        self.assertEqual(extraction_prompt_budget(default), 4096 - 1000 - 256)
        small = SimpleNamespace(chat_context_length=2048, memory_observation_context_tokens=8192)
        self.assertEqual(extraction_prompt_budget(small), 2048 - 1000 - 256)

    def test_statement_alone_too_large_returns_none(self):
        payload = {"user_statement": "x" * 30000, "existing_memories": [{"content": "m"}],
                   "conversation_context": [{"role": "user", "content": "c"}]}
        self.assertIsNone(fit_extraction_messages("rules", payload, {}, 2840))
        # The caller's payload is not mutated while fitting.
        self.assertEqual(len(payload["existing_memories"]), 1)

    def test_default_budget_admits_ordinary_long_messages(self):
        from lumen.observations import EXTRACTION_PROMPT as system
        schema = Candidates.model_json_schema()
        payload = {"companion_name": "Nova", "conversation_context": [],
                   "user_statement": "a" * 3000, "existing_memories": []}
        self.assertIsNotNone(fit_extraction_messages(system, payload, schema,
                                                     extraction_prompt_budget(SimpleNamespace())))


class SafeAutoSaveTests(unittest.TestCase):
    def check(self, source, **kw):
        c = Candidate(**candidate(**kw))
        return automatic_candidate(c, c.evidence, source)

    def test_simple_positive_preferences_still_auto_save(self):
        cases = [
            ("Summer is my favorite season.", {}),
            ("My favorite color is turquoise.", {"content": "The user likes turquoise.",
                                                 "evidence": "My favorite color is turquoise.",
                                                 "topic": "favorite_color"}),
            ("I prefer cinnamon in my sugar cookies.",
             {"content": "The user prefers cinnamon in sugar cookies.",
              "evidence": "I prefer cinnamon in my sugar cookies.", "topic": "baking_preference"}),
            ("I really enjoy hiking.", {"content": "The user enjoys hiking.",
                                        "evidence": "I really enjoy hiking.", "topic": "hobby"}),
            ("Jazz is my favorite music genre.",
             {"content": "The user's favorite music genre is jazz.",
              "evidence": "Jazz is my favorite music genre.", "topic": "music_genre"}),
        ]
        for source, kw in cases:
            with self.subTest(source=source):
                self.assertTrue(self.check(source, **kw))

    def test_owner_reported_vectors_are_review_only(self):
        # Exact fictional vectors from the PR #5 blocker report on Video.
        self.assertFalse(self.check(
            "I take metformin every morning.", content="The user takes metformin every morning.",
            evidence="I take metformin every morning.", topic="routine"))
        self.assertFalse(self.check(
            "I earn $120k at Acme.", content="The user earns $120k at Acme.",
            evidence="I earn $120k at Acme.", topic="compensation"))
        self.assertFalse(self.check(
            "I love horror movies. Actually, I hate them.", content="The user loves horror movies.",
            evidence="I love horror movies.", topic="movie_preference"))
        self.assertTrue(self.check(
            "I prefer cinnamon in my sugar cookies.",
            content="The user prefers cinnamon in sugar cookies.",
            evidence="I prefer cinnamon in my sugar cookies.", topic="baking_preference"))

    def test_non_preference_facts_are_review_only(self):
        for source, content in (
            ("I live near the coast.", "The user lives near the coast."),
            ("My name is Sam.", "The user's name is Sam."),
            ("I work as a nurse.", "The user works as a nurse."),
            ("I play the cello.", "The user plays the cello."),
        ):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content=content, evidence=source, topic="fact"))

    def test_medications_and_numbers_are_review_only(self):
        for source, content in (
            ("I take Ozempic every week.", "The user takes Ozempic every week."),
            ("I love semaglutide.", "The user loves semaglutide."),
            ("I take my pills every morning.", "The user takes pills every morning."),
            ("I like my meds in the morning.", "The user likes meds in the morning."),
            ("I make 85k a year.", "The user makes 85k a year."),
            ("I love 5k runs.", "The user loves 5k runs."),
            ("I like getting paid on Fridays.", "The user likes getting paid on Fridays."),
        ):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content=content, evidence=source, topic="fact"))

    def test_named_brands_and_proper_nouns_are_review_only(self):
        for source, content in (
            ("I love Ozempic.", "The user loves Ozempic."),
            ("I really like Zorvex.", "The user likes Zorvex."),          # invented brand
            ("Zorvex is my favorite brand.", "The user's favorite brand is Zorvex."),
            ("I love working at Acme.", "The user loves working at Acme."),
            ("I adore Kestrel Harbor.", "The user adores Kestrel Harbor."),
        ):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content=content, evidence=source, topic="brand"))

    def test_financial_variations_are_review_only(self):
        for source, content in (
            ("I make six figures.", "The user makes six figures."),
            ("I have savings of three thousand dollars.", "The user has savings."),
            ("I owe a lot on my credit card.", "The user owes money on a credit card."),
            ("I love getting my bonus.", "The user loves getting a bonus."),
            ("My favorite investment is crypto.", "The user's favorite investment is crypto."),
        ):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content=content, evidence=source,
                                            topic="finance_detail"))

    def test_later_corrections_in_the_message_are_review_only(self):
        for source, evidence in (
            ("I love horror movies. Actually, I hate them.", "I love horror movies."),
            ("I like tea. Just kidding.", "I like tea."),
            ("I love cats. Never mind.", "I love cats."),
            ("I enjoy running. Well, I used to.", "I enjoy running."),
            ("I love jazz! Or maybe not.", "I love jazz!"),
            ("I prefer winter, or at least I did last year", "I prefer winter"),
        ):
            with self.subTest(source=source):
                content = "The user " + evidence.split(" ", 1)[1].rstrip("!.").replace(
                    "love ", "loves ").replace("like ", "likes ").replace(
                    "enjoy ", "enjoys ").replace("prefer ", "prefers ")
                self.assertFalse(self.check(source, content=content, evidence=evidence,
                                            topic="taste"))

    def test_multi_sentence_and_relationship_sources_are_review_only(self):
        for source, evidence, content in (
            ("Summer is my favorite season. I play the cello.", "Summer is my favorite season.",
             "The user prefers summer."),
            ('My sister said "I love horror movies."', "I love horror movies.",
             "The user loves horror movies."),
            ("I love my wife.", "I love my wife.", "The user loves the user's wife."),
            ("I like her cooking.", "I like her cooking.", "The user likes her cooking."),
            ("My brother loves jazz.", "My brother loves jazz.", "The user loves jazz."),
            ("I love jazz.", "I love jazz.", "The user loves jazz and blues."),
            ("I love jazz and blues.", "I love jazz and blues.", "The user loves jazz."),
        ):
            with self.subTest(source=source, content=content):
                self.assertFalse(self.check(source, content=content, evidence=evidence,
                                            topic="music_genre"))

    def test_negated_fragment_is_review_only(self):
        source = "My brother keeps saying I love horror movies, but honestly I hate them."
        self.assertFalse(self.check(source, content="The user loves horror movies.",
                                    evidence="I love horror movies", topic="movie_genre"))

    def test_quoted_and_reported_third_party_speech_is_review_only(self):
        for source, evidence in (
            ('My manager wrote in the team chat: "I am moving to Lisbon next month."',
             "I am moving to Lisbon next month."),
            ("My manager wrote this. I am moving to Lisbon next month.",
             "I am moving to Lisbon next month."),
            ("> I am moving to Lisbon next month.", "I am moving to Lisbon next month."),
        ):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content="The user is moving to Lisbon next month.",
                                            evidence=evidence, topic="relocation_plan"))

    def test_third_party_subject_is_review_only(self):
        self.assertFalse(self.check("My brother is a pilot.", content="The user is a pilot.",
                                    evidence="My brother is a pilot.", topic="occupation"))

    def test_sensitive_content_with_benign_evidence_is_review_only(self):
        # Model flags claim sensitive=False; the content itself is checked.
        self.assertFalse(self.check("My favorite color is teal.", content="The user has diabetes.",
                                    evidence="My favorite color is teal.", topic="favorite_color"))
        self.assertFalse(self.check("I see my therapist weekly.",
                                    content="The user sees a therapist weekly.",
                                    evidence="I see my therapist weekly.", topic="routine"))
        self.assertFalse(self.check("I live at 42 Elm Street.", content="The user lives at 42 Elm Street.",
                                    evidence="I live at 42 Elm Street.", topic="home"))
        self.assertFalse(self.check("Summer is my favorite season.", topic="health_condition"))

    def test_unrelated_or_reinterpreted_content_is_review_only(self):
        self.assertFalse(self.check("My favorite color is teal.", content="The user lives in Denver.",
                                    evidence="My favorite color is teal.", topic="home_city"))
        self.assertFalse(self.check("I hate cilantro.", content="The user likes cilantro.",
                                    evidence="I hate cilantro.", topic="food"))
        self.assertFalse(self.check("Summer is my favorite season.", content="Nova prefers summer."))

    def test_negation_contrast_and_uncertainty_are_review_only(self):
        for source in ("I don't eat meat.", "I never drink coffee.", "I used to live in Ohio.",
                       "I like tea, although coffee is fine.", "I think I like jazz.",
                       "I might move to Ohio."):
            with self.subTest(source=source):
                self.assertFalse(self.check(source, content="The user " + source[2:],
                                            evidence=source, topic="fact"))

    def test_long_pasted_source_is_review_only(self):
        source = "Meeting notes for the quarter. " * 40 + "I live near the coast."
        self.assertFalse(self.check(source, content="The user lives near the coast.",
                                    evidence="I live near the coast.", topic="home_region"))

    def test_model_flags_remain_necessary(self):
        for change in ({"sensitive": True}, {"conflicting": True}, {"direct_assertion": False},
                       {"subject": "unknown"}, {"topic": ""}, {"durable": False}):
            with self.subTest(change=change):
                self.assertFalse(self.check("Summer is my favorite season.", **change))


class AutoSaveWorkerTests(Worker):
    async def test_misattributed_candidates_are_proposed_for_review_not_saved(self):
        statement = 'My manager wrote in the team chat: "I am moving to Lisbon next month."'
        self.setup_worker([candidate(content="The user is moving to Lisbon next month.",
                                     evidence="I am moving to Lisbon next month.",
                                     topic="relocation_plan")], statement=statement)
        await self.run_worker()
        self.assertEqual(len(self.tables("rpc/propose_memory")), 1)
        self.assertFalse(self.tables("rpc/auto_save_memory_suggestion"))
        self.assertEqual(self.status(), "done")

    async def test_owner_reported_vectors_still_create_reviewable_proposals(self):
        for statement, content, evidence, topic in (
            ("I take metformin every morning.", "The user takes metformin every morning.",
             "I take metformin every morning.", "routine"),
            ("I earn $120k at Acme.", "The user earns $120k at Acme.",
             "I earn $120k at Acme.", "compensation"),
            ("I love horror movies. Actually, I hate them.", "The user loves horror movies.",
             "I love horror movies.", "movie_preference"),
        ):
            with self.subTest(statement=statement):
                self.setup_worker([candidate(content=content, evidence=evidence, topic=topic)],
                                  statement=statement)
                await self.run_worker()
                self.assertEqual(len(self.tables("rpc/propose_memory")), 1)
                self.assertFalse(self.tables("rpc/auto_save_memory_suggestion"))
                self.assertEqual(self.status(), "done")

    async def test_safe_fact_is_still_auto_saved_end_to_end(self):
        self.setup_worker([candidate()])
        await self.run_worker()
        self.assertEqual(len(self.tables("rpc/auto_save_memory_suggestion")), 1)


class WorkerFailureTests(Worker):
    async def test_missing_token_never_uses_service_role_repository(self):
        for token in (None, ""):
            with self.subTest(token=token):
                self.setup_worker([candidate()])
                await self.run_worker(token=token)
                self.assertIsNone(self.repository)
                self.assertFalse(self.calls)
                self.provider.structured.assert_not_awaited()

    async def test_partial_write_then_retry_creates_no_duplicate(self):
        statement = "Summer is my favorite season."
        batch = [candidate(), candidate(content="The user's favorite season is summer.")]
        failures = {"left": 1}

        async def fail_second(json_body):
            if "favorite season" in json_body["p_content"] and failures["left"]:
                failures["left"] -= 1
                raise RuntimeError("fictional 503")

        self.setup_worker(batch, statement=statement, propose_hook=fail_second)
        await self.run_worker()
        self.assertEqual(self.status(), "failed")
        self.assertEqual(len(self.tables("rpc/auto_save_memory_suggestion")), 1)  # first write kept

        # Retry the same message with the same fake database state.
        self.calls.clear()
        with patch("lumen.observations.SupabaseRepository", return_value=self.db), \
             patch("lumen.observations.OllamaProvider", return_value=self.provider):
            await observe(self.settings, "fictional-user-jwt", "source")
        saves = self.tables("rpc/auto_save_memory_suggestion")
        self.assertEqual([s[2]["json"]["p_id"] for s in saves], ["suggestion-2"])
        self.assertEqual(self.status(), "done")

    async def test_chat_preemption_mid_batch_marks_retryable(self):
        started = asyncio.Event()

        async def block_second(json_body):
            if "favorite season" in json_body["p_content"]:
                started.set()
                await asyncio.Event().wait()

        self.setup_worker([candidate(), candidate(content="The user's favorite season is summer.")],
                          propose_hook=block_second)
        worker = asyncio.create_task(self.run_worker())
        await asyncio.wait_for(started.wait(), 5)
        await prioritize_chat()
        await worker
        self.assertEqual(self.status(), "failed")


if __name__ == "__main__":
    unittest.main()
