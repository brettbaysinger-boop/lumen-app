"""Deterministic layout of validated proposal text; no inference or new facts."""
import io
import re
import threading
from pathlib import Path
from xml.sax.saxutils import escape

_font_lock = threading.Lock()
_font_ready = False

# Layout labels, not service types. Markdown headings work for other sections.
_headings = {
    'project overview', 'overview', 'introduction', 'customer information',
    'client information', 'client and property', 'customer and property',
    'scope', 'scope of work', 'scope of services', 'included services',
    'exclusions', 'investment', 'investment summary', 'pricing', 'pricing summary',
    'recurring service options', 'ongoing maintenance', 'ongoing maintenance (recommended)',
    'terms', 'terms and conditions', 'terms and limitations', 'payment terms',
    'warranty', 'warranty / guarantee', 'details to confirm', 'acceptance',
}
_tabular_sections = {
    'customer information', 'client information', 'client and property',
    'customer and property', 'investment', 'investment summary', 'pricing',
    'pricing summary', 'recurring service options', 'ongoing maintenance',
    'ongoing maintenance (recommended)', 'acceptance',
}
_customer_labels = {'prepared for', 'client', 'customer', 'customer name',
                    'address', 'service address', 'phone', 'email', 'property'}


def _plain(value):
    return value.replace('**', '').strip().rstrip(':').strip()


def _heading(line):
    match = re.match(r'^\s*#{1,6}\s+(.+?)\s*$', line)
    if match:
        return _plain(match[1])
    value = _plain(line)
    return value if value.casefold() in _headings else None


def _field(line):
    value = re.sub(r'^\s*(?:[•*+-]\s+)', '', line).strip()
    match = re.match(r'^([^:\n]{1,60}):\s*(.+)$', value)
    if not match:
        return None
    value = match[2].strip()
    if match[1].count('**') % 2:
        value = value.removeprefix('**').strip()
    return _plain(match[1]), value


def _inline(value):
    # Escape before adding supported markup; never fetch links or images.
    value = escape(value)
    value = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', value)
    value = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', value)
    return value


def _sections(body):
    sections = []
    title, lines = None, []
    for line in body.splitlines():
        heading = _heading(line)
        if heading:
            if lines or title:
                sections.append((title, lines))
            title, lines = heading, []
        else:
            lines.append(line)
    if lines or title:
        sections.append((title, lines))
    return sections


def _cells(line):
    value = line.strip()
    if value.startswith('|'):
        value = value[1:]
    if value.endswith('|') and not value.endswith('\\|'):
        value = value[:-1]
    return [cell.strip().replace('\\|', '|') for cell in re.split(r'(?<!\\)\|', value)]


def _table_start(lines, index):
    if index + 1 >= len(lines) or '|' not in lines[index]:
        return False
    header, separator = _cells(lines[index]), _cells(lines[index + 1])
    return (2 <= len(header) <= 6 and len(header) == len(separator)
            and all(re.fullmatch(r':?-{3,}:?', cell) for cell in separator))


def _fonts():
    global _font_ready
    import reportlab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    with _font_lock:
        if not _font_ready:
            # These fonts ship with ReportLab, so host system fonts are not needed.
            folder = Path(reportlab.__file__).parent / 'fonts'
            for name, filename in [('LumenPDF', 'Vera.ttf'), ('LumenPDF-Bold', 'VeraBd.ttf'),
                                   ('LumenPDF-Italic', 'VeraIt.ttf'), ('LumenPDF-BoldItalic', 'VeraBI.ttf')]:
                pdfmetrics.registerFont(TTFont(name, str(folder / filename)))
            pdfmetrics.registerFontFamily('LumenPDF', normal='LumenPDF', bold='LumenPDF-Bold',
                                          italic='LumenPDF-Italic', boldItalic='LumenPDF-BoldItalic')
            _font_ready = True


def render_proposal_pdf(title, body, sources, *, style=None):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, LongTable, TableStyle, KeepTogether, Image, Table
    _fonts()
    from .document_style_model import DocumentStyle
    style = style if isinstance(style, DocumentStyle) else DocumentStyle.model_validate(style or {})
    page_size = A4 if style.page_size == 'a4' else letter
    page_width, page_height = page_size
    width = page_width - 100
    ink = colors.HexColor('#243447')
    accent = colors.HexColor(style.accent)
    # Keep any user-selected pale accent readable against a white page.
    luminance = .2126 * accent.red + .7152 * accent.green + .0722 * accent.blue
    if luminance > .61:
        accent = colors.Color(*(channel * .61 / luminance for channel in (accent.red, accent.green, accent.blue)))
    roomy = style.spacing == 'comfortable'
    alignment = 1 if style.header_alignment == 'center' else 0
    muted = colors.HexColor('#556272')
    line_color = colors.HexColor('#D5DDE5')
    pale = colors.HexColor('#F3F6F9')
    normal = ParagraphStyle('body', fontName='LumenPDF', fontSize=10 if roomy else 9, leading=14 if roomy else 12.5,
                            textColor=ink, spaceAfter=3)
    small = ParagraphStyle('small', parent=normal, fontSize=7.5, leading=10, textColor=muted)
    heading_style = ParagraphStyle('heading', parent=normal, fontName='LumenPDF-Bold',
                                  fontSize=10.5, leading=14, spaceBefore=10, spaceAfter=5, keepWithNext=True, textColor=accent)
    title_style = ParagraphStyle('title', parent=heading_style, fontSize=18, leading=23,
                                spaceBefore=0, spaceAfter=7, alignment=alignment)
    bullet_style = ParagraphStyle('bullet', parent=normal, leftIndent=10, firstLineIndent=-8)
    cell_style = ParagraphStyle('cell', parent=normal, fontSize=9.5 if roomy else 8.5, leading=13 if roomy else 11.5, spaceAfter=0)

    def paragraph(value, style=normal):
        return Paragraph(_inline(value), style)

    def table(rows, header=False):
        columns = len(rows[0])
        widths = [145, width - 145] if columns == 2 else [width / columns] * columns
        content = [[paragraph('**' + value + '**' if header and index == 0 else value, cell_style)
                    for value in row] for index, row in enumerate(rows)]
        result = LongTable(content, colWidths=widths, repeatRows=1 if header else 0,
                           hAlign='LEFT', splitByRow=1, splitInRow=1)
        commands = [('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
                    ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
                    ('LINEBELOW', (0, 0), (-1, -1), 0.3, line_color),
                    ('ROWBACKGROUNDS', (0, 1 if header else 0), (-1, -1), [colors.white, pale])]
        if header:
            commands.append(('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E3EAF1')))
        result.setStyle(TableStyle(commands))
        return result

    def section_content(section, raw_lines):
        lines = [line.strip() for line in raw_lines if line.strip()]
        result = []
        index = 0
        if section is None:
            first_customer = next((i for i, line in enumerate(lines)
                                   if _field(line) and _field(line)[0].casefold() in _customer_labels), None)
            if first_customer and first_customer <= 8:
                preamble = lines[:first_customer]
                if (sum(map(len, preamble)) <= 600
                        and not any(re.match(r'^[•*+-]\s|^\|', line) for line in preamble)):
                    # Compact text already in the draft; this does not supply branding.
                    result.append(paragraph(preamble[0]))
                    if len(preamble) > 1:
                        result.append(paragraph(' · '.join(preamble[1:]), small))
                    result.append(Spacer(1, 6))
                    index = first_customer
        while index < len(lines):
            line = lines[index]
            if _table_start(lines, index):
                rows = [_cells(line)]; index += 2
                while index < len(lines) and '|' in lines[index] and len(_cells(lines[index])) == len(rows[0]):
                    rows.append(_cells(lines[index])); index += 1
                result.extend([table(rows, header=True), Spacer(1, 5)])
                continue
            field = _field(line)
            is_customer = section is None and field and field[0].casefold() in _customer_labels
            if field and ((section or '').casefold() in _tabular_sections or is_customer):
                rows = []
                while index < len(lines):
                    pair = _field(lines[index])
                    if not pair or (is_customer and pair[0].casefold() not in _customer_labels):
                        break
                    rows.append(list(pair)); index += 1
                result.extend([table(rows), Spacer(1, 5)])
                continue
            if re.fullmatch(r'[-*_]{3,}', line):
                result.append(Spacer(1, 4))
            else:
                bullet = re.match(r'^(?:[•*+-]\s+)(.+)$', line)
                result.append(paragraph('• ' + bullet[1], bullet_style) if bullet else paragraph(line))
            index += 1
        return result

    heading_content = [paragraph(title, title_style),
                       paragraph('Review draft. Confirm the scope, prices, terms and any unresolved details before use.', small)]
    identity_style = ParagraphStyle('identity', parent=normal, alignment=alignment)
    if style.company_name:
        heading_content.append(paragraph(style.company_name, identity_style))
    if style.contact_line:
        heading_content.append(paragraph(style.contact_line,
            ParagraphStyle('contact', parent=small, alignment=alignment)))
    if style.logo_png:
        import base64
        from PIL import Image as PILImage
        raw_logo = base64.b64decode(style.logo_png, validate=True)
        with PILImage.open(io.BytesIO(raw_logo)) as logo:
            # One bounded header row, not a separate logo-height block.
            factor = min(86 / logo.width, 44 / logo.height)
            logo_width, logo_height = logo.width * factor, logo.height * factor
        logo_flow = Image(io.BytesIO(raw_logo), width=logo_width, height=logo_height)
        logo_column = logo_width + 12
        header = Table([[logo_flow, heading_content]],
                       colWidths=[logo_column, width - logo_column], hAlign='LEFT')
        header.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, 0), 12),
            ('RIGHTPADDING', (1, 0), (1, 0), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story = [header, Spacer(1, 8)]
    else:
        story = heading_content + [Spacer(1, 8)]
    for heading, lines in _sections(body):
        flows = ([paragraph(heading, heading_style)] if heading else []) + section_content(heading, lines)
        if heading and heading.casefold() == 'acceptance' and sum(map(len, lines)) <= 1300 and len(lines) <= 16:
            story.append(KeepTogether(flows))
        else:
            story.extend(flows)

    if sources:
        story.extend([PageBreak(), paragraph('Source references for review', heading_style),
                      paragraph('Match these numbers to the source excerpts in the draft card. '
                                'Document filenames and original excerpt text are omitted from this PDF. '
                                'References do not independently verify the proposal.', normal), Spacer(1, 8)])
        documents = {}
        rows = [['Citation', 'Reference']]
        for source in sources:
            key = source.get('document_id') or source.get('title', '')
            if key not in documents:
                documents[key] = chr(ord('A') + len(documents))
            rows.append([f"[{source['number']}]", f"Reference document {documents[key]} — page {source['page']}"])
        story.append(table(rows, header=True))

    def decorate(canvas, doc):
        canvas.saveState(); canvas.setFillColor(ink)
        canvas.setFont('LumenPDF-Bold', 9)
        canvas.drawString(50, page_height - 35, 'PROPOSAL')
        canvas.setFont('LumenPDF', 8); canvas.setFillColor(muted)
        canvas.drawRightString(page_width - 50, page_height - 35, 'REVIEW DRAFT')
        canvas.setStrokeColor(line_color); canvas.line(50, page_height - 45, page_width - 50, page_height - 45)
        canvas.setFont('LumenPDF', 7)
        canvas.drawString(50, 28, 'Review draft • Not sent or signed')
        canvas.drawRightString(page_width - 50, 28, f'Page {doc.page}')
        canvas.restoreState()

    out = io.BytesIO()
    SimpleDocTemplate(out, pagesize=page_size, leftMargin=50, rightMargin=50, topMargin=60,
                      bottomMargin=47, title='Proposal review draft').build(
                          story, onFirstPage=decorate, onLaterPages=decorate)
    return out.getvalue()
