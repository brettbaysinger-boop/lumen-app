"""Bounded PDF geometry/color inspection. Outputs no text, filenames or images."""
import io
import json
import math
import statistics
import sys
from collections import Counter


def inspect_pdf(raw):
    from pypdf import PdfReader
    if not raw or len(raw) > 8 * 1024 * 1024 or not raw.startswith(b'%PDF-'):
        raise ValueError('Choose a PDF up to 8 MB.')
    reader = PdfReader(io.BytesIO(raw), strict=True)
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 20:
        raise ValueError('Choose an unencrypted PDF with at most 20 pages.')
    page = reader.pages[0]
    if int(page.get('/Rotate', 0)) % 360:
        raise ValueError('Choose an upright portrait example.')
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    if not (400 <= width <= 700 and 600 <= height <= 1000 and height > width):
        raise ValueError('Choose a portrait Letter or A4-style example.')
    sizes = []; colors = Counter(); runs = 0

    def text_run(text, cm, tm, font, size):
        nonlocal runs
        if text.strip():
            runs += 1
            size = abs(float(size))
            if math.isfinite(size) and 6 <= size <= 24:
                sizes.extend([size] * min(len(text.strip()), 200))

    def operation(operator, operands, cm, tm):
        if operator not in (b'rg', b'RG') or len(operands) != 3:
            return
        try:
            rgb = tuple(float(c) for c in operands)
            if any(not math.isfinite(c) or not 0 <= c <= 1 for c in rgb):
                return
            # Ignore gray/white fills. Heading color is a suggestion, not a claim.
            if max(rgb) - min(rgb) > .10 and max(rgb) > .12:
                colors[tuple(round(c * 255) for c in rgb)] += 1
        except (TypeError, ValueError):
            pass

    # Read only the first page. Content text is discarded in this process.
    page.extract_text(visitor_text=text_run, visitor_operand_before=operation)
    if not sizes or runs < 2:
        raise ValueError('This example has no usable text layout. Scanned PDFs are not supported yet.')
    settings = {
        'page_size': 'a4' if abs(width - 595.28) < abs(width - 612) else 'letter',
        'spacing': 'comfortable' if statistics.median(sizes) >= 10.5 else 'compact',
    }
    if colors:
        rgb = colors.most_common(1)[0][0]
        # Darken very light accent colors for legible headings.
        luminance = sum(c * weight for c, weight in zip(rgb, (.2126, .7152, .0722)))
        if luminance > 155:
            rgb = tuple(round(c * 155 / luminance) for c in rgb)
        settings['accent'] = '#' + ''.join(f'{c:02x}' for c in rgb)
    return {'settings': settings, 'pages': len(reader.pages)}


if __name__ == '__main__':
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        print(json.dumps(inspect_pdf(sys.stdin.buffer.read(8 * 1024 * 1024 + 1))))
    except Exception:
        print(json.dumps({'error': 'Example could not be analyzed. Use a text-based portrait PDF up to 8 MB and 20 pages.'}))
        sys.exit(1)
