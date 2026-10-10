"""Synthetic layout regressions; renderer must preserve facts and hide filenames."""
from io import BytesIO
import unittest
from unittest.mock import patch
from pypdf import PdfReader
from lumen.proposal_pdf_layout import render_proposal_pdf, _field

SOURCES = [{'number': 1, 'document_id': 'invented-document-a',
            'title': 'PRIVATE-OLD-CLIENT-NAME.pdf', 'page': 4},
           {'number': 2, 'document_id': 'invented-document-a',
            'title': 'PRIVATE-OLD-CLIENT-NAME.pdf', 'page': 2},
           {'number': 3, 'document_id': 'invented-document-b',
            'title': 'PRIVATE-OTHER-CUSTOMER.pdf', 'page': 8}]

BODY = '''EXAMPLE SERVICES
Invented service region
100 Fictional Avenue
555-0100
office@example.invalid

Prepared for: Invented Client
Address: 123 Fictional Road
Phone: 555-0199
Email: client@example.invalid

Scope of Work
• Inspection program: Four weekly visits.
• Equipment: Four stations, placed as agreed with the customer.
• Included work: Seal the listed openings.
• Exclusions: Structural rebuilding is excluded. [1]

Investment
• Program price: $395
• Complimentary visit: Normally $75; included if the program is accepted.

Recurring Service Options
• Monthly inspection: $50 per visit; separately scheduled.

Terms and Limitations
• Workmanship period: 60 days after completion, as supplied by the user.
• Payment: Due on completion. [2]

Acceptance
Signature: ________________________________
Print name: Invented Client
Date: [NEEDS CONFIRMATION]
'''


def read(body=BODY, sources=SOURCES):
    return PdfReader(BytesIO(render_proposal_pdf('Invented Service Proposal', body, sources)))


class PDFLayoutTests(unittest.TestCase):
    def test_compact_proposal_and_acceptance_share_one_page(self):
        pdf = read()
        self.assertEqual(len(pdf.pages), 2)
        first = pdf.pages[0].extract_text()
        for text in ('Invented Client', '$395', '$75', '$50', '60 days', '[1]', '[2]',
                     'Acceptance', 'Signature', '[NEEDS CONFIRMATION]'):
            self.assertIn(text, first)
        self.assertIn('Source references', pdf.pages[1].extract_text())

    def test_reference_mapping_preserved_without_old_names_or_ids(self):
        pdf = read(); text = '\n'.join(p.extract_text() for p in pdf.pages)
        for hidden in ('PRIVATE-OLD-CLIENT-NAME', 'PRIVATE-OTHER-CUSTOMER', 'invented-document-a'):
            self.assertNotIn(hidden, text)
        last = pdf.pages[-1].extract_text()
        for expected in ('[1]', '[2]', '[3]', 'document A', 'document B', 'page 4', 'page 2', 'page 8'):
            self.assertIn(expected, last)

    def test_markdown_table_keeps_rows_prices_and_conditions(self):
        body = '''## Investment
| Service | Standard | Bundle | Condition |
| --- | ---: | ---: | --- |
| Program | $400 | $350 | Main line accepted [1] |
| Optional repair | $80 | $25 | Optional; requires program |
| Recurring visit | $50 | $50 | Per visit, not part of initial total |
## Acceptance
Signature: ____________________'''
        pdf = read(body)
        text = ' '.join(' '.join(p.extract_text() for p in pdf.pages).split())
        for expected in ('$400', '$350', '$80', '$25', '$50', 'requires program', 'initial total', '[1]'):
            self.assertIn(expected, text)
        self.assertNotIn('| ---', text)

    def test_markup_escaped_and_external_content_not_loaded(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('Network access prohibited')):
            pdf = read('## Scope\n<img src="https://example.invalid/private"/>\n**Quoted** & <literal> [1]')
        text = pdf.pages[0].extract_text()
        self.assertIn('<img src=', text)
        self.assertIn('& <literal>', text)
        self.assertNotIn('**Quoted**', text)

    def test_field_formatting_preserves_bold_value(self):
        self.assertEqual(_field('**Client:** Invented Client'), ('Client', 'Invented Client'))
        self.assertEqual(_field('**Price**: **$395**'), ('Price', '**$395**'))

    def test_long_table_splits_and_keeps_last_row(self):
        rows = '\n'.join(f'| Item {i} | Optional inspection detail {i}, with its own condition [1]. |' for i in range(48))
        pdf = read('## Custom Services\n| Item | Description |\n| --- | --- |\n' + rows)
        self.assertGreater(len(pdf.pages), 2)
        text = '\n'.join(p.extract_text() for p in pdf.pages)
        self.assertIn('Item 0', text); self.assertIn('Item 47', text)
        self.assertIn('own condition', text)

    def test_one_long_field_can_split_without_losing_text(self):
        value = 'Detailed included work. ' * 180 + 'END-SENTINEL'
        pdf = read('## Investment\nProgram: ' + value)
        self.assertIn('END-SENTINEL', '\n'.join(p.extract_text() for p in pdf.pages))

    def test_fonts_embedded_and_latin_characters_preserved(self):
        pdf = read('## Scope\nClient: José\nPrice: €395.00 [1]')
        self.assertIn('José', pdf.pages[0].extract_text())
        self.assertIn('€395.00', pdf.pages[0].extract_text())
        fonts = pdf.pages[0]['/Resources']['/Font'].get_object()
        embedded = [f.get_object().get('/FontDescriptor') for f in fonts.values()]
        self.assertTrue(any(d and '/FontFile2' in d.get_object() for d in embedded))
