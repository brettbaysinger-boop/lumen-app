import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.observations import observe


class ObservationDurabilityTests(unittest.IsolatedAsyncioTestCase):
    async def run_case(
        self,
        statement: str,
        content: str,
        *,
        direct_assertion: bool = True,
        topic: str = "favorite_color",
    ):
        calls = []

        async def request(method, table, **kwargs):
            calls.append((method, table, kwargs))
            if table == "rpc/claim_memory_observation":
                return True
            if table == "messages":
                return [{
                    "role": "user", "content": statement,
                    "companion_id": "companion-x",
                }]
            if table == "rpc/propose_memory":
                return "suggestion-id"
            return []

        db = SimpleNamespace(
            _request=AsyncMock(side_effect=request),
            get_companion=AsyncMock(return_value={
                "name": "Nova", "conversation_model": "test-model",
            }),
        )
        model = SimpleNamespace(structured=AsyncMock(return_value=json.dumps({
            "candidates": [{
                "content": content,
                "evidence": statement,
                "subject": "user",
                "type": "preference",
                "direct_assertion": direct_assertion,
                "sensitive": False,
                "conflicting": False,
                "durable": True,
                "topic": topic,
            }]
        })))
        settings = SimpleNamespace(memory_observation_model="", conversation_model="test-model")

        with (patch("lumen.observations.SupabaseRepository", return_value=db),
              patch("lumen.observations.OllamaProvider", return_value=model)):
            await observe(settings, "account-bearer", "source-message")

        return calls

    async def test_one_off_request_never_reaches_suggestions_even_if_model_claims_durable(self):
        calls = await self.run_case(
            "Tell me a silly joke.",
            "The user likes silly jokes.",
        )
        self.assertFalse(any(t == "rpc/propose_memory" for _, t, _ in calls))
        self.assertFalse(any(t == "rpc/auto_save_memory_suggestion" for _, t, _ in calls))
        self.assertEqual(calls[-1][2]["json"]["status"], "done")

    async def test_greeting_never_reaches_suggestions(self):
        calls = await self.run_case(
            "Good morning, beautiful. How are you?",
            "The user likes mornings.",
        )
        self.assertFalse(any(t == "rpc/propose_memory" for _, t, _ in calls))

    async def test_question_with_personal_claim_proposes_but_never_auto_saves(self):
        calls = await self.run_case(
            "Did you know I'm your creator?",
            "The user identifies as the creator.",
        )
        self.assertTrue(any(t == "rpc/propose_memory" for _, t, _ in calls))
        self.assertFalse(any(t == "rpc/auto_save_memory_suggestion" for _, t, _ in calls))

    async def test_stable_preference_can_be_auto_saved_after_other_guards(self):
        calls = await self.run_case(
            "My favorite color is turquoise.",
            "The user likes turquoise.",
        )
        self.assertTrue(any(t == "rpc/propose_memory" for _, t, _ in calls))
        self.assertTrue(any(t == "rpc/auto_save_memory_suggestion" for _, t, _ in calls))


if __name__ == "__main__":
    unittest.main()
