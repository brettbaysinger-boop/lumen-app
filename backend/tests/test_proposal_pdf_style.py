"""Styled exports keep source/price checks and use the authenticated owner."""
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
import test_proposal_pdf as pdf_tests
from lumen.document_style_model import DocumentStyle

# Reuse fixture setup only; do not inherit/re-run the existing test methods.
import unittest
class StyledExportTests(unittest.TestCase):
    setUp = pdf_tests.PDFRoutes.setUp

    def test_profile_is_loaded_for_authenticated_owner_after_validation(self):
        style = DocumentStyle(company_name='INVENTED OWNER BUSINESS')
        with patch('lumen.document_style.load_style', AsyncMock(return_value=style)) as load, \
             patch('lumen.proposal_pdf.render_proposal_pdf', return_value=b'%PDF-style') as render:
            r = self.client.post(self.path, json={**self.body, 'use_saved_style': True})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(load.call_args.args[0].id, 'owner')
        self.assertEqual(load.call_args.args[0].token, 'token')
        self.assertEqual(render.call_args.kwargs['style'], style)

    def test_invalid_price_does_not_load_style_or_render(self):
        with patch('lumen.document_style.load_style', AsyncMock()) as load, \
             patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            r = self.client.post(self.path, json={**self.body, 'body': 'Price $999 [1]', 'use_saved_style': True})
        self.assertEqual(r.status_code, 422); load.assert_not_called(); render.assert_not_called()

    def test_foreign_draft_never_reads_style(self):
        with patch('lumen.proposal_pdf.draft_message', AsyncMock(side_effect=HTTPException(404))), \
             patch('lumen.document_style.load_style', AsyncMock()) as load:
            r = self.client.post(self.path, json={**self.body, 'use_saved_style': True})
        self.assertEqual(r.status_code, 404); load.assert_not_called()

    def test_style_outage_is_explicit_not_silent_brand_change(self):
        with patch('lumen.document_style.load_style', AsyncMock(side_effect=RuntimeError('PRIVATE'))), \
             patch('lumen.proposal_pdf.render_proposal_pdf') as render:
            r = self.client.post(self.path, json={**self.body, 'use_saved_style': True})
        self.assertEqual(r.status_code, 503); self.assertNotIn('PRIVATE', r.text); render.assert_not_called()
