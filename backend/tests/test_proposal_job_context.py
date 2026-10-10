"""Invented job inputs only. No model service, database, or customer records."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from lumen.proposal_context import (
    MAX_PREVIOUS_REQUEST_CHARS, ProposalContextError, previous_request,
    proposal_request, references_previous_request,
)
from lumen.document_work import prepare_work, validate_proposal, ProposalCheckError
from lumen.documents import document_action

U = '11111111-1111-4111-8111-111111111111'
D = '22222222-2222-4222-8222-222222222222'
OLD = '33333333-3333-4333-8333-333333333333'
MODEL = 'satgeze/gemma4-12b-uncensored-1.5m:latest'
QUERY = 'Work harder: Draft a proposal using the details from my previous message.'
SOURCES = [{'number': 1, 'document_id': D, 'title': 'Invented reference',
            'page': 1, 'excerpt': 'Inspection service $295. Payment due on completion.'}]


def history(content='New job for Invented Client. Inspection price $595.'):
    return [{'id': OLD, 'role': 'assistant', 'content': 'ASSISTANT INVENTION $999'},
            {'id': U, 'role': 'user', 'content': content},
            {'id': OLD, 'role': 'user', 'content': 'OLDER JOB $888'}]


class ContextSelection(unittest.TestCase):
    def test_only_explicit_reference_selects_latest_user(self):
        rows = history()
        self.assertEqual(previous_request(QUERY, rows), {'id': U, 'content': rows[1]['content']})
        self.assertIsNone(previous_request('Draft a new proposal; price $700.', rows))

    def test_negative_reference_and_unrelated_negative_clause(self):
        self.assertFalse(references_previous_request('Draft a proposal. Do not use my previous message.'))
        self.assertTrue(references_previous_request('Use my previous message but do not copy old names.'))

    def test_missing_blank_overlong_invalid_id_and_chained_context_stop(self):
        for rows in ([], history(' '), history('x' * (MAX_PREVIOUS_REQUEST_CHARS + 1)),
                     history('Use my previous message.'), [{'role': 'user', 'content': 'Scope $595'}]):
            with self.subTest(rows_type=len(rows)), self.assertRaises(ProposalContextError):
                previous_request(QUERY, rows)

    def test_does_not_skip_a_newer_user_turn_to_recover_old_job(self):
        rows = [{'id': U, 'role': 'user', 'content': 'Thanks.'}, *history()]
        self.assertEqual(previous_request(QUERY, rows)['content'], 'Thanks.')

    def test_original_objects_unchanged_and_no_implicit_price_authorization(self):
        rows = history(); saved = copy.deepcopy(rows)
        previous_request(QUERY, rows)
        self.assertEqual(rows, saved)
        raw = json.dumps({'title': 'Inspection', 'body': 'Price $595. Payment due on completion. [1]'})
        with self.assertRaises(ProposalCheckError):
            validate_proposal(raw, SOURCES, QUERY)
        validate_proposal(raw, SOURCES, proposal_request(QUERY, rows[1]['content']))


class WorkflowInputs(unittest.IsolatedAsyncioTestCase):
    async def test_draft_review_revision_receive_same_explicit_job_inputs(self):
        for previous in (
            'Invented Client. Rodent program price $595. Six stations. Follow-up $50 per visit.',
            'Invented Client. Ant service price $195. Monthly visits $45 per visit.',
            'Invented Client. Termite service price $695. No damage repair warranty.',
            'Invented Client. Combined inspection price $250 and repair price $175.',
        ):
            with self.subTest(kind=previous.split('.')[1]):
                cited = json.dumps({'title': 'Invented proposal', 'body': 'Payment due on completion. [1]'})
                provider = SimpleNamespace(structured=AsyncMock(side_effect=[cited, '{"issues":[]}', cited]))
                result = await prepare_work(provider, MODEL, QUERY, SOURCES, previous_user_request=previous)
                self.assertIn('document_action_draft', result)
                calls = provider.structured.await_args_list
                self.assertEqual(len(calls), 3)
                for call in calls:
                    inputs = json.loads(call.args[1][1]['content'])
                    self.assertEqual(inputs['previous_user_request'], previous)
                    self.assertEqual(inputs['sources'], SOURCES)
                    self.assertEqual(call.kwargs, {'max_tokens': 4096, 'timeout': 180, 'think': False})
                    instructions = ' '.join(m['content'] for m in call.args[1] if m['role'] == 'system')
                    self.assertIn('including acceptance', instructions)
                    self.assertIn('mixed-service jobs', instructions)

    async def test_retry_has_same_context_and_final_validation_still_blocks(self):
        missing = json.dumps({'title': 'Invented proposal', 'body': 'Price $595.'})
        cited = json.dumps({'title': 'Invented proposal', 'body': 'Price $595. Payment due on completion. [1]'})
        for final in (cited.replace('$595', '$999'), cited.replace('[1]', '[99]'), missing):
            provider = SimpleNamespace(structured=AsyncMock(side_effect=[missing, cited, '{"issues":[]}', final]))
            with self.assertLogs('lumen.document_work', level='WARNING') as logs:
                result = await prepare_work(provider, MODEL, QUERY, SOURCES, previous_user_request=history()[1]['content'])
            self.assertNotIn('document_action_draft', result)
            self.assertEqual(provider.structured.await_count, 4)
            for call in provider.structured.await_args_list:
                self.assertEqual(json.loads(call.args[1][1]['content'])['previous_user_request'], history()[1]['content'])
            self.assertNotIn('Invented Client', ''.join(logs.output))

    async def test_previous_price_survives_all_checks_but_assistant_price_does_not(self):
        for amount, offered in (('595', True), ('999', False)):
            raw = json.dumps({'title': 'Inspection', 'body': f'Price ${amount}. Payment due on completion. [1]'})
            provider = SimpleNamespace(structured=AsyncMock(side_effect=[raw, '{"issues":[]}', raw]))
            result = await prepare_work(provider, MODEL, QUERY, SOURCES, previous_user_request=history()[1]['content'])
            self.assertEqual('document_action_draft' in result, offered)


class DocumentSelection(unittest.IsolatedAsyncioTestCase):
    def db(self):
        return SimpleNamespace(_request=AsyncMock(side_effect=[
            [{'id': D, 'title': 'Selected invented reference', 'page_count': 1}],
            [{'page': 1, 'content': SOURCES[0]['excerpt']}],
        ]))

    async def test_selected_document_remains_pinned_and_title_is_preserved(self):
        db = self.db(); rows = history()
        with patch('lumen.document_work.prepare_work', AsyncMock(return_value={'document_action_draft': {'kind': 'note'}})) as work:
            result = await document_action(db, U, QUERY, None, MODEL, document_id=D, recent=rows)
        self.assertEqual(work.call_args.kwargs['previous_user_request'], rows[1]['content'])
        self.assertEqual(work.call_args.args[3][0]['document_id'], D)
        self.assertEqual(result['document_title'], 'Selected invented reference')
        self.assertEqual(result['document_work_context']['previous_user_message_id'], U)
        self.assertEqual([c.args[0] for c in db._request.call_args_list], ['GET', 'GET'])
        self.assertEqual(db._request.call_args_list[1].kwargs['params']['document_id'], 'eq.' + D)

    async def test_missing_context_stops_before_retrieval_or_generation(self):
        db = self.db()
        with patch('lumen.document_work.prepare_work', AsyncMock()) as work:
            result = await document_action(db, U, QUERY, None, MODEL, document_id=D)
        db._request.assert_not_awaited(); work.assert_not_awaited()
        self.assertNotIn('document_action_draft', result)
        self.assertIn('include the current job details', result['content'])

    async def test_fresh_job_does_not_get_older_job_context(self):
        db = self.db()
        with patch('lumen.document_work.prepare_work', AsyncMock(return_value={'document_action_draft': {'kind': 'note'}})) as work:
            result = await document_action(db, U, 'Draft a new inspection proposal.', None, MODEL, document_id=D, recent=history())
        self.assertEqual(work.call_args.kwargs, {})
        self.assertIsNone(result['document_work_context']['previous_user_message_id'])

    async def test_regular_document_answer_keeps_existing_path(self):
        db = self.db()
        provider = SimpleNamespace(generate=AsyncMock(return_value={'content': 'Payment due on completion. [1]'}))
        result = await document_action(db, U, 'Summarize the terms.', provider, MODEL, document_id=D, recent=history())
        self.assertNotIn('document_work_context', result)
        self.assertEqual(provider.generate.await_count, 1)
