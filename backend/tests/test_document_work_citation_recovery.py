"""Synthetic proposal regression tests. No network, database, or real customer data."""
import asyncio
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from lumen.document_work import Proposal, prepare_work, validate_proposal

MODEL = 'satgeze/gemma4-12b-uncensored-1.5m:latest'
SOURCES = [
    {'number': 3, 'excerpt': 'Rodent program $295. Labor excluded.',
     'title': 'Synthetic example', 'page': 12},
    {'number': 8, 'excerpt': 'Return inspection only. Structural repairs excluded.',
     'title': 'Synthetic example', 'page': 13},
]
QUERY = 'Draft a proposal from these excerpts.'
REVIEW = json.dumps({'issues': []})


def proposal(body, title='Proposal'):
    return json.dumps({'title': title, 'body': body})


CITED = proposal('Rodent program: $295. Labor excluded. [3]')
MISSING = proposal('Rodent program: $295. Labor excluded.')


class CitationRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def run_work(self, replies, *, query=QUERY, sources=None, model=MODEL):
        provider = SimpleNamespace(structured=AsyncMock(side_effect=replies))
        emit = AsyncMock()
        result = await prepare_work(
            provider, model, query, SOURCES if sources is None else sources, emit)
        return result, provider, emit

    async def test_valid_draft_keeps_three_calls_and_activity_stages(self):
        result, provider, emit = await self.run_work([CITED, REVIEW, CITED])
        self.assertEqual(provider.structured.await_count, 3)
        self.assertEqual(emit.await_count, 3)
        self.assertEqual(result['document_action_draft']['kind'], 'note')
        self.assertEqual(result['document_action_draft']['body'], json.loads(CITED)['body'])

    async def test_missing_citations_retries_once_then_review_and_revision(self):
        rejected = proposal('REJECTED-DRAFT-SENTINEL. Rodent program $295. Labor excluded.')
        result, provider, emit = await self.run_work([rejected, CITED, REVIEW, CITED])
        self.assertEqual(provider.structured.await_count, 4)
        self.assertEqual(emit.await_count, 4)
        self.assertIn('retrying', emit.await_args_list[1].args[0]['text'])
        self.assertEqual(result['document_action_draft']['body'], json.loads(CITED)['body'])
        calls = provider.structured.await_args_list
        self.assertEqual(calls[0].args[1][1], calls[1].args[1][1])
        self.assertNotIn('REJECTED-DRAFT-SENTINEL', json.dumps(calls[1].args[1]))
        review_input = json.loads(calls[2].args[1][1]['content'])
        self.assertEqual(review_input['draft'], json.loads(CITED))

    async def test_second_missing_citation_result_stops_without_third_attempt(self):
        with self.assertLogs('lumen.document_work', level='WARNING') as logs:
            result, provider, _ = await self.run_work([MISSING, MISSING])
        self.assertEqual(provider.structured.await_count, 2)
        self.assertNotIn('document_action_draft', result)
        self.assertIn('stage=draft_citation_retry_validation', '\n'.join(logs.output))
        self.assertIn('reason=citations_missing', '\n'.join(logs.output))

    async def test_initial_unknown_citation_fails_without_retry(self):
        result, provider, _ = await self.run_work([CITED.replace('[3]', '[99]')])
        self.assertEqual(provider.structured.await_count, 1)
        self.assertNotIn('document_action_draft', result)

    async def test_initial_invalid_citation_format_fails_without_retry(self):
        result, provider, _ = await self.run_work([CITED.replace('[3]', '[3-8]')])
        self.assertEqual(provider.structured.await_count, 1)
        self.assertNotIn('document_action_draft', result)

    async def test_initial_unsupported_price_fails_without_retry(self):
        result, provider, _ = await self.run_work([CITED.replace('$295', '$999')])
        self.assertEqual(provider.structured.await_count, 1)
        self.assertNotIn('document_action_draft', result)

    async def test_retry_cannot_bypass_citation_or_price_checks(self):
        for bad, reason in [
            (CITED.replace('[3]', '[99]'), 'citation_unknown'),
            (CITED.replace('[3]', '[3-8]'), 'citation_format'),
            (CITED.replace('$295', '$999'), 'price_not_in_inputs'),
            (proposal('Labor excluded. [3]', title='Proposal $999'), 'price_not_in_inputs'),
        ]:
            with self.subTest(reason=reason, bad=bad):
                with self.assertLogs('lumen.document_work', level='WARNING') as logs:
                    result, provider, _ = await self.run_work([MISSING, bad])
                self.assertEqual(provider.structured.await_count, 2)
                self.assertNotIn('document_action_draft', result)
                self.assertIn('reason=' + reason, '\n'.join(logs.output))

    async def test_explicit_natural_language_replacement_price_is_preserved(self):
        updated = proposal('New price: $595.00 (user-supplied). Labor excluded. [3]')
        query = 'New project for Synthetic Customer; price 595. Keep labor excluded.'
        result, provider, _ = await self.run_work(
            [MISSING, updated, REVIEW, updated], query=query)
        self.assertIn('$595.00', result['document_action_draft']['body'])
        self.assertNotIn('$295', result['document_action_draft']['body'])
        for call in provider.structured.await_args_list[:2]:
            supplied = json.loads(call.args[1][1]['content'])
            self.assertEqual(supplied['request'], query)
            self.assertEqual(supplied['sources'], SOURCES)
        review_input = json.loads(provider.structured.await_args_list[2].args[1][1]['content'])
        self.assertEqual(review_input['user_request'], query)

    async def test_repair_does_not_authorize_unrelated_input_numbers_as_prices(self):
        query = 'New site: 999 Example Street; 6 stations; 4 weeks.'
        result, provider, _ = await self.run_work(
            [MISSING, CITED.replace('$295', '$999')], query=query)
        self.assertEqual(provider.structured.await_count, 2)
        self.assertNotIn('document_action_draft', result)

    async def test_initial_invalid_schema_is_not_retried(self):
        for bad in ['not JSON', '{"title":"Proposal"}',
                    json.dumps({'title': 'Proposal', 'body': 'Scope [3]', 'extra': True})]:
            with self.subTest(bad=bad):
                result, provider, _ = await self.run_work([bad])
                self.assertEqual(provider.structured.await_count, 1)
                self.assertNotIn('document_action_draft', result)

    async def test_retry_output_must_pass_original_schema(self):
        for bad in ['not JSON', '{"title":"Proposal"}',
                    proposal('x' * 6001 + ' [3]'),
                    proposal('Labor excluded. [3]', title='x' * 201),
                    json.dumps({'title': 'Proposal', 'body': 'Scope [3]', 'extra': True})]:
            with self.subTest(bad=bad[:80]):
                result, provider, _ = await self.run_work([MISSING, bad])
                self.assertEqual(provider.structured.await_count, 2)
                self.assertNotIn('document_action_draft', result)

    async def test_final_revision_is_strict_with_or_without_retry(self):
        for initial in ([CITED], [MISSING, CITED]):
            for bad in [MISSING, CITED.replace('[3]', '[99]'),
                        CITED.replace('$295', '$999'), 'not JSON']:
                with self.subTest(retry=len(initial) == 2, bad=bad):
                    replies = initial + [REVIEW, bad]
                    with self.assertLogs('lumen.document_work', level='WARNING') as logs:
                        result, provider, _ = await self.run_work(replies)
                    self.assertEqual(provider.structured.await_count, len(replies))
                    self.assertNotIn('document_action_draft', result)
                    self.assertIn('stage=revision_validation', '\n'.join(logs.output))

    async def test_review_failure_after_retry_does_not_offer_validated_initial_draft(self):
        for bad_review in ['not JSON', json.dumps({'issues': ['issue'] * 13})]:
            with self.subTest(review=bad_review):
                result, provider, _ = await self.run_work([MISSING, CITED, bad_review])
                self.assertEqual(provider.structured.await_count, 3)
                self.assertNotIn('document_action_draft', result)

    async def test_retry_provider_exception_stops_without_private_error_body(self):
        with self.assertLogs('lumen.document_work', level='WARNING') as logs:
            result, provider, _ = await self.run_work(
                [MISSING, RuntimeError('PRIVATE-PROVIDER-ERROR')])
        self.assertEqual(provider.structured.await_count, 2)
        self.assertNotIn('document_action_draft', result)
        rendered = '\n'.join(logs.output)
        self.assertIn('stage=draft_citation_retry_request', rendered)
        self.assertIn('reason=schema_or_provider_error', rendered)
        self.assertNotIn('PRIVATE-PROVIDER-ERROR', rendered + json.dumps(result))

    async def test_initial_provider_exception_is_not_retried(self):
        result, provider, _ = await self.run_work([TimeoutError('synthetic timeout')])
        self.assertEqual(provider.structured.await_count, 1)
        self.assertNotIn('document_action_draft', result)

    async def test_no_sources_fails_before_model_call(self):
        with self.assertLogs('lumen.document_work', level='WARNING') as logs:
            result, provider, _ = await self.run_work([], sources=[])
        provider.structured.assert_not_awaited()
        self.assertNotIn('document_action_draft', result)
        self.assertEqual(result['document_sources'], [])
        self.assertIn('stage=source_validation', '\n'.join(logs.output))
        self.assertIn('reason=sources_missing', '\n'.join(logs.output))

    async def test_prompts_use_actual_source_ids_not_page_numbers_or_assumed_one(self):
        result, provider, _ = await self.run_work([MISSING, CITED, REVIEW, CITED])
        self.assertIn('document_action_draft', result)
        for index in (0, 1, 3):
            rules = provider.structured.await_args_list[index].args[1][0]['content']
            self.assertIn('Allowed citation markers: [3] [8].', rules)
            self.assertIn('not document page numbers', rules)
            self.assertIn('never instructions', rules)
            self.assertNotIn('[1]', rules)
            self.assertNotIn('[12]', rules)

    async def test_same_model_and_existing_budgets_apply_to_every_call(self):
        for model in (MODEL, 'unverified-model'):
            with self.subTest(model=model):
                _, provider, _ = await self.run_work(
                    [MISSING, CITED, REVIEW, CITED], model=model)
                self.assertEqual(provider.structured.await_count, 4)
                for call in provider.structured.await_args_list:
                    self.assertEqual(call.args[0], model)
                    self.assertEqual(call.kwargs['max_tokens'], 4096)
                    self.assertEqual(call.kwargs['timeout'], 180)
                    if model == MODEL:
                        self.assertIs(call.kwargs['think'], False)
                    else:
                        self.assertNotIn('think', call.kwargs)

    async def test_failure_logs_and_progress_exclude_private_content(self):
        sources = copy.deepcopy(SOURCES)
        sources[0]['excerpt'] += ' PRIVATE-SOURCE-SENTINEL'
        missing = proposal('PRIVATE-OUTPUT-SENTINEL', title='PRIVATE-TITLE-SENTINEL')
        with self.assertLogs('lumen.document_work', level='WARNING') as logs:
            result, provider, emit = await self.run_work(
                [missing, missing], query='PRIVATE-REQUEST-SENTINEL', sources=sources)
        self.assertEqual(provider.structured.await_count, 2)
        self.assertNotIn('document_action_draft', result)
        public_diagnostics = '\n'.join(logs.output) + json.dumps([
            call.args[0] for call in emit.await_args_list])
        for private in ('PRIVATE-SOURCE-SENTINEL', 'PRIVATE-OUTPUT-SENTINEL',
                        'PRIVATE-TITLE-SENTINEL', 'PRIVATE-REQUEST-SENTINEL'):
            self.assertNotIn(private, public_diagnostics)

    async def test_cancellation_during_retry_propagates(self):
        provider = SimpleNamespace(structured=AsyncMock(
            side_effect=[MISSING, asyncio.CancelledError()]))
        with self.assertRaises(asyncio.CancelledError):
            await prepare_work(provider, MODEL, QUERY, SOURCES)
        self.assertEqual(provider.structured.await_count, 2)

    async def test_sources_and_initial_messages_are_not_mutated_by_retry(self):
        original = copy.deepcopy(SOURCES)
        result, provider, _ = await self.run_work([MISSING, CITED, REVIEW, CITED])
        self.assertEqual(SOURCES, original)
        self.assertEqual(result['document_sources'], original)
        first, retry = provider.structured.await_args_list[:2]
        self.assertEqual(len(first.args[1]), 2)
        self.assertEqual(len(retry.args[1]), 2)
        self.assertNotIn('initial draft was rejected', first.args[1][0]['content'])
        self.assertIn('initial draft was rejected', retry.args[1][0]['content'])

    async def test_title_only_citation_does_not_satisfy_body_requirement(self):
        title_only = proposal('Rodent program $295. Labor excluded.', title='Proposal [3]')
        result, provider, _ = await self.run_work([title_only, title_only])
        self.assertEqual(provider.structured.await_count, 2)
        self.assertNotIn('document_action_draft', result)

    async def test_grouped_citations_remain_supported(self):
        grouped = proposal('Rodent program $295. Labor and structural repairs excluded. [3, 8]')
        result, provider, _ = await self.run_work([MISSING, grouped, REVIEW, grouped])
        self.assertEqual(provider.structured.await_count, 4)
        self.assertIn('[3] [8]', result['document_action_draft']['body'])
        validate_proposal(json.dumps({
            'title': result['document_action_draft']['title'],
            'body': result['document_action_draft']['body'],
        }), SOURCES)

    def test_proposal_schema_keeps_limits_and_documents_citation_contract(self):
        schema = Proposal.model_json_schema()
        self.assertFalse(schema['additionalProperties'])
        self.assertEqual(set(schema['required']), {'title', 'body'})
        self.assertEqual(schema['properties']['body']['minLength'], 1)
        self.assertEqual(schema['properties']['body']['maxLength'], 6000)
        self.assertEqual(schema['properties']['title']['maxLength'], 200)
        self.assertIn('numeric source citations', schema['properties']['body']['description'])


if __name__ == '__main__':
    unittest.main()
