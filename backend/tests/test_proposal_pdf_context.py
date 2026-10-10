"""PDF revalidation uses pinned user inputs and has no global business identity."""
import unittest
from io import BytesIO
from unittest.mock import AsyncMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader
from lumen.auth import AuthUser, require_user
from lumen.proposal_pdf import router, render_proposal_pdf

C = '11111111-1111-4111-8111-111111111111'
M = '22222222-2222-4222-8222-222222222222'
D = '33333333-3333-4333-8333-333333333333'
U = '44444444-4444-4444-8444-444444444444'
P = '55555555-5555-4555-8555-555555555555'
QUERY = 'Work harder: Draft a proposal using my previous message.'
SOURCE = {'number': 1, 'document_id': D, 'title': 'Invented reference',
          'page': 1, 'excerpt': 'Payment due on completion.'}


class PDFContext(unittest.TestCase):
    def setUp(self):
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[require_user] = lambda: AuthUser(C, 'token')
        self.client = TestClient(app); self.addCleanup(self.client.close)
        self.context = {'version': 1, 'request_message_id': U, 'previous_user_message_id': P}
        self.message = {'conversation_id': C, 'metadata': {
            'document_action_draft': {'kind': 'note'},
            'document_sources': [SOURCE], 'document_work_context': self.context}}
        self.responses = [
            [{'created_at': '2026-10-10T02:00:00Z'}],
            [{'id': U, 'content': QUERY, 'created_at': '2026-10-10T01:00:00Z'}],
            [{'id': P, 'role': 'user', 'content': 'Invented job. Inspection price $595.'}],
            [{'id': D}],
        ]
        self.db = Mock(_request=AsyncMock(side_effect=self.responses))
        self.path = f'/v0.6/documents/companions/{C}/drafts/{M}/pdf'
        self.payload = {'title': 'Invented proposal', 'body': 'Inspection $595. Payment due on completion. [1]'}
        for target, replacement in [('companion_db', AsyncMock(return_value=self.db)),
                                    ('draft_message', AsyncMock(return_value=self.message))]:
            p = patch('lumen.proposal_pdf.' + target, replacement); p.start(); self.addCleanup(p.stop)

    def test_inherited_user_price_exports_with_exact_scoped_message_reads(self):
        with patch('lumen.proposal_pdf.render_proposal_pdf', return_value=b'%PDF-test'):
            response = self.client.post(self.path, json=self.payload)
        self.assertEqual(response.status_code, 200)
        calls = self.db._request.call_args_list
        self.assertTrue(all(c.args[0] == 'GET' for c in calls))
        self.assertTrue(all(c.kwargs['params']['companion_id'] == 'eq.' + C for c in calls))
        for call, message_id in zip(calls[1:3], [U, P]):
            params = call.kwargs['params']
            self.assertEqual(params['id'], 'eq.' + message_id)
            self.assertEqual(params['conversation_id'], 'eq.' + C)
            self.assertEqual(params['role'], 'eq.user')
        self.assertEqual(calls[2].kwargs['params']['created_at'], 'lt.2026-10-10T01:00:00Z')

    def test_missing_earlier_request_blocks_export(self):
        self.responses[2] = []
        self.db._request.side_effect = self.responses
        with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            self.assertEqual(self.client.post(self.path, json=self.payload).status_code, 422)
            render.assert_not_called()

    def test_unrequested_context_is_not_used(self):
        self.responses[1][0]['content'] = 'Draft a fresh proposal.'
        self.db._request.side_effect = self.responses
        self.assertEqual(self.client.post(self.path, json=self.payload).status_code, 422)

    def test_bad_context_version_and_ids_block_export(self):
        for changes in ({'version': 99}, {'request_message_id': 'bad'}, {'previous_user_message_id': U}):
            self.message['metadata']['document_work_context'] = {**self.context, **changes}
            self.db._request.side_effect = self.responses
            with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
                self.assertEqual(self.client.post(self.path, json=self.payload).status_code, 422)
                render.assert_not_called()

    def test_missing_pinned_current_request_does_not_fall_back(self):
        self.responses[1] = []
        self.db._request.side_effect = self.responses
        self.assertEqual(self.client.post(self.path, json=self.payload).status_code, 422)

    def test_edit_cannot_authorize_new_price_or_bad_citation(self):
        for body in ('Price $999. Payment due. [1]', 'Price $595. [99]', 'Price $595.'):
            self.db._request.side_effect = self.responses
            with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
                self.assertEqual(self.client.post(self.path, json={**self.payload, 'body': body}).status_code, 422)
                render.assert_not_called()

    def test_default_renderer_contains_no_global_company_branding(self):
        pdf = PdfReader(BytesIO(render_proposal_pdf('Invented proposal', 'Payment due. [1]', [SOURCE])))
        text = '\n'.join(page.extract_text() for page in pdf.pages)
        self.assertIn('REVIEW DRAFT', text)
        self.assertNotIn('RATTLESNAKE', text.upper())
        self.assertNotIn('8871', text)
        self.assertNotIn('520-499-0899', text)
        self.assertNotIn('rattlesnake', (pdf.metadata.author or '').lower())
        for page in pdf.pages:
            resources = page.get('/Resources', {})
            self.assertNotIn('/XObject', resources)
