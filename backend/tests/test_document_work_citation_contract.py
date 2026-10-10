"""Synthetic citation-contract tests; no network or customer data."""
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from lumen.document_work import _proposal_messages, prepare_work
from test_document_work_citation_recovery import (
    MODEL, SOURCES, QUERY, CITED, MISSING, REVIEW,
)


class CitationContractTests(unittest.IsolatedAsyncioTestCase):
    async def run_work(self, replies):
        provider = SimpleNamespace(
            structured=AsyncMock(side_effect=replies))
        result = await prepare_work(provider, MODEL, QUERY, SOURCES)
        return result, provider.structured.await_args_list

    def check_contract(self, call):
        final = call.args[1][-1]
        self.assertEqual(final["role"], "system")
        self.assertIn("Available source markers: [3] [8].", final["content"])
        self.assertIn("not page numbers", final["content"])
        self.assertIn("do not cite old excerpts", final["content"])
        self.assertIn("unrelated or unsupported", final["content"])
        self.assertNotIn("[12]", final["content"])

    async def test_contract_follows_inputs_in_draft_and_revision(self):
        result, calls = await self.run_work([CITED, REVIEW, CITED])
        self.assertIn("document_action_draft", result)
        self.assertEqual(len(calls), 3)
        self.check_contract(calls[0])
        self.check_contract(calls[2])
        self.assertEqual(len(calls[1].args[1]), 2)
        self.assertEqual(calls[1].args[1][-1]["role"], "user")

    async def test_retry_also_receives_final_contract(self):
        result, calls = await self.run_work([MISSING, CITED, REVIEW, CITED])
        self.assertIn("document_action_draft", result)
        self.assertEqual(len(calls), 4)
        for index in (0, 1, 3):
            self.check_contract(calls[index])
        self.assertEqual(len(calls[2].args[1]), 2)

    async def test_final_validation_still_rejects_bad_revision(self):
        for bad in (MISSING, CITED.replace("[3]", "[99]"),
                    CITED.replace("$295", "$999")):
            with self.subTest(bad=bad):
                result, calls = await self.run_work([CITED, REVIEW, bad])
                self.assertNotIn("document_action_draft", result)
                self.assertEqual(len(calls), 3)

    def test_message_builder_preserves_original_inputs(self):
        messages = [{"role": "user", "content": "Synthetic input"}]
        original_messages = copy.deepcopy(messages)
        original_sources = copy.deepcopy(SOURCES)
        result = _proposal_messages(messages, SOURCES)
        self.assertEqual(messages, original_messages)
        self.assertEqual(SOURCES, original_sources)
        self.assertEqual(result[:-1], messages)
        self.assertIsNot(result, messages)


if __name__ == "__main__":
    unittest.main()
