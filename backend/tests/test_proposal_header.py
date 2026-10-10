"""Synthetic compact-header tests; no customer content or real logos."""
import base64
import io
import unittest
from PIL import Image
from pypdf import PdfReader
from lumen.document_style_model import DocumentStyle
from lumen.proposal_pdf_layout import render_proposal_pdf
import test_proposal_pdf_layout as layout


def style(width, height, **options):
    out = io.BytesIO(); Image.new('RGBA', (width, height), '#008080').save(out, format='PNG')
    return DocumentStyle(logo_png=base64.b64encode(out.getvalue()).decode(), **options)


class CompactHeaderTests(unittest.TestCase):
    def test_tall_logo_and_acceptance_share_first_page(self):
        pdf = PdfReader(io.BytesIO(render_proposal_pdf('Invented Service Proposal', layout.BODY,
                         layout.SOURCES, style=style(90, 180))))
        self.assertEqual(len(pdf.pages), 2)
        self.assertIn('Signature', pdf.pages[0].extract_text())
        self.assertTrue(pdf.pages[0].images)
        for text in ('$395', '$75', '$50', '60 days', '[1]', '[2]', 'Invented Client'):
            self.assertIn(text, pdf.pages[0].extract_text())

    def test_wide_logo_long_identity_and_title_preserve_all_text(self):
        value = style(900, 100, company_name='Invented Services Company',
                      contact_line='office@example.invalid | 123 Example Street', header_alignment='center')
        pdf = PdfReader(io.BytesIO(render_proposal_pdf('A detailed invented proposal title for multiple services',
                         layout.BODY, layout.SOURCES, style=value)))
        text = ' '.join(' '.join(p.extract_text() for p in pdf.pages).split())
        for part in ('Invented Services Company', 'office@example.invalid', 'multiple services', 'Signature', '$395'):
            self.assertIn(part, text)

    def test_long_body_still_paginates_without_shrinking_or_dropping_terms(self):
        body = '## Scope\n' + '\n'.join(f'Line {i}: Included example work with conditions. [1]' for i in range(90))
        body += '\n## Acceptance\nSignature: ____________________\nDate: [NEEDS CONFIRMATION]'
        pdf = PdfReader(io.BytesIO(render_proposal_pdf('Long example', body, layout.SOURCES, style=style(100, 100))))
        self.assertGreater(len(pdf.pages), 2)
        text = '\n'.join(p.extract_text() for p in pdf.pages)
        self.assertIn('Line 89:', text); self.assertIn('Signature', text)
        self.assertIn('[NEEDS CONFIRMATION]', text)

    def test_neutral_and_a4_remain_supported(self):
        for value in (DocumentStyle(), style(100, 100, page_size='a4')):
            pdf = PdfReader(io.BytesIO(render_proposal_pdf('Example', layout.BODY, layout.SOURCES, style=value)))
            self.assertIn('Source references', pdf.pages[-1].extract_text())
            self.assertAlmostEqual(float(pdf.pages[0].mediabox.width), 595.28 if value.page_size == 'a4' else 612, places=1)
