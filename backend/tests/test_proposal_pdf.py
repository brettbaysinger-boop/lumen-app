"""Synthetic PDF route regressions; no real customer data or inference."""
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.proposal_pdf import router, render_proposal_pdf

C='11111111-1111-4111-8111-111111111111'
M='22222222-2222-4222-8222-222222222222'
D='33333333-3333-4333-8333-333333333333'
SOURCE={'number':1,'document_id':D,'title':'Synthetic source','page':1,'excerpt':'Program costs $295. Repairs excluded.'}

class PDFRoutes(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router)
        app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
        self.app=app;self.client=TestClient(app);self.addCleanup(self.client.close)
        self.db=Mock(_request=AsyncMock(side_effect=[[{'created_at':'2026-10-10T00:00:00Z'}],[{'content':'Draft a proposal; price $595.'}],[{'id':D}]]))
        self.message={'conversation_id':C,'metadata':{'document_action_draft':{'kind':'note'},'document_sources':[SOURCE]}}
        self.body={'title':'Synthetic proposal','body':'Program price $595 (user-supplied). Repairs excluded. [1]'}
        self.path=f'/v0.6/documents/companions/{C}/drafts/{M}/pdf'
        for target,replacement in [('companion_db',AsyncMock(return_value=self.db)),('draft_message',AsyncMock(return_value=self.message))]:
            p=patch('lumen.proposal_pdf.'+target,replacement);p.start();self.addCleanup(p.stop)

    def test_edits_revalidated_and_pdf_is_private_without_writes(self):
        with patch('lumen.proposal_pdf.render_proposal_pdf',return_value=b'%PDF-test') as render:
            r=self.client.post(self.path,json=self.body)
        self.assertEqual(r.status_code,200);self.assertEqual(r.content,b'%PDF-test')
        self.assertEqual(r.headers['cache-control'],'no-store')
        self.assertEqual(render.call_args.args[1],self.body['body'])
        self.assertTrue(all(c.args[0]=='GET' for c in self.db._request.call_args_list))
        self.assertTrue(all(c.kwargs['params']['companion_id']==f'eq.{C}' for c in self.db._request.call_args_list))

    def test_bad_price_and_citations_block_rendering(self):
        for body in ['Repairs excluded.', 'Repairs excluded. [99]', 'Price $999. Repairs excluded. [1]']:
            self.db._request.side_effect=[[{'created_at':'now'}],[{'content':'Draft a proposal; price $595.'}],[{'id':D}]]
            with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
                self.assertEqual(self.client.post(self.path,json={**self.body,'body':body}).status_code,422)
                render.assert_not_called()

    def test_missing_auth_cannot_render(self):
        self.app.dependency_overrides.clear()
        with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            self.assertEqual(self.client.post(self.path,json=self.body).status_code,401)
            render.assert_not_called()

    def test_foreign_or_missing_message_cannot_render(self):
        from fastapi import HTTPException
        with patch('lumen.proposal_pdf.draft_message',AsyncMock(side_effect=HTTPException(404,'Not found'))),patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            self.assertEqual(self.client.post(self.path,json=self.body).status_code,404)
            render.assert_not_called()

    def test_deleted_source_cannot_render(self):
        self.db._request.side_effect=[[{'created_at':'now'}],[{'content':'Draft a proposal'}],[]]
        with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            self.assertEqual(self.client.post(self.path,json=self.body).status_code,404)
            render.assert_not_called()

    def test_non_proposal_note_is_not_exported(self):
        self.db._request.side_effect=[[{'created_at':'now'}],[{'content':'Draft a note'}]]
        with patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            self.assertEqual(self.client.post(self.path,json=self.body).status_code,422)
            render.assert_not_called()

    def test_renderer_escapes_markup_and_produces_valid_pdf(self):
        from io import BytesIO
        from pypdf import PdfReader
        data=render_proposal_pdf('Synthetic <title>', '## Scope\nRepairs excluded. [1]\n<img src="http://invalid/"/>', [SOURCE])
        reader=PdfReader(BytesIO(data))
        text='\n'.join(p.extract_text() for p in reader.pages)
        self.assertIn('Repairs excluded.',text)
        self.assertIn('<img src=',text)
        self.assertIn('Source references',text)
