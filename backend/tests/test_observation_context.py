import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.observations import observe


class ObservationContextQualityTests(unittest.IsolatedAsyncioTestCase):
    async def test_prior_context_is_passed_only_for_reference_resolution(self):
        calls = []

        async def request(method, table, **kwargs):
            calls.append((method, table, kwargs))
            if table == "rpc/claim_memory_observation":
                return True
            if table == "messages":
                params = kwargs.get("params", {})
                if "id" in params:
                    return [{
                        "id": "source",
                        "role": "user",
                        "content": "oh definitely regal confidence.",
                        "companion_id": "c",
                        "conversation_id": "chat",
                        "created_at": "2026-10-12T00:00:05Z",
                    }]
                return [{
                    "id": "prior",
                    "role": "assistant",
                    "content": "Does she say it with regal confidence?",
                    "created_at": "2026-10-12T00:00:04Z",
                }]
            if table == "memories":
                return []
            return []

        db = SimpleNamespace(
            _request=AsyncMock(side_effect=request),
            get_companion=AsyncMock(return_value={"name": "Nova", "conversation_model": "model"}),
        )
        provider = SimpleNamespace(structured=AsyncMock(return_value=json.dumps({
            "candidates": [{
                "content": "Nova's envisioned persona has regal confidence.",
                "evidence": "oh definitely regal confidence.",
                "subject": "companion",
                "type": "semantic",
                "durable": True,
                "direct_assertion": False,
                "sensitive": False,
                "conflicting": True,
                "topic": "",
            }]
        })))
        settings = SimpleNamespace(memory_observation_model="", conversation_model="model")

        with patch("lumen.observations.SupabaseRepository", return_value=db), \
             patch("lumen.observations.OllamaProvider", return_value=provider):
            await observe(settings, "token", "source")

        payload = json.loads(provider.structured.call_args.args[1][1]["content"])
        self.assertEqual(payload["user_statement"], "oh definitely regal confidence.")
        self.assertEqual(payload["conversation_context"], [{
            "role": "assistant",
            "content": "Does she say it with regal confidence?",
        }])

        proposals = [c for c in calls if c[1] == "rpc/propose_memory"]
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0][2]["json"]["p_subject"], "companion")

    async def test_transient_unknown_feedback_never_reaches_review(self):
        calls = []

        async def request(method, table, **kwargs):
            calls.append((method, table, kwargs))
            if table == "rpc/claim_memory_observation":
                return True
            if table == "messages":
                return [{
                    "id": "source",
                    "role": "user",
                    "content": "Still has clothes on. Wtf!!???",
                    "companion_id": "c",
                }]
            if table == "memories":
                return []
            return []

        db = SimpleNamespace(
            _request=AsyncMock(side_effect=request),
            get_companion=AsyncMock(return_value={"name": "Nova", "conversation_model": "model"}),
        )
        provider = SimpleNamespace(structured=AsyncMock(return_value=json.dumps({
            "candidates": [{
                "content": "Still has clothes on. Wtf!!???",
                "evidence": "Still has clothes on. Wtf!!???",
                "subject": "unknown",
                "type": "episodic",
                "durable": False,
                "direct_assertion": False,
                "sensitive": False,
                "conflicting": True,
                "topic": "",
            }]
        })))
        settings = SimpleNamespace(memory_observation_model="", conversation_model="model")

        with patch("lumen.observations.SupabaseRepository", return_value=db), \
             patch("lumen.observations.OllamaProvider", return_value=provider):
            await observe(settings, "token", "source")

        self.assertFalse(any(table == "rpc/propose_memory" for _, table, _ in calls))
        status = [c for c in calls if c[1] == "memory_observations"][-1]
        self.assertEqual(status[2]["json"]["status"], "done")


if __name__ == "__main__":
    unittest.main()
