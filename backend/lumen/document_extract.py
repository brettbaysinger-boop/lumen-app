"""PDF extraction worker: bounded resources, stdin in / JSON out, no networking."""
import io
import json
import re
import sys

MAX_UPLOAD = 25 * 1024 * 1024


def clean(text):
    return re.sub(r'[\x00-\x08\x0b\x0e-\x1f]', '', text).strip()


def extract(data, kind):
    if kind == 'pdf':
        from pypdf import PdfReader
        if not data.startswith(b'%PDF-'):
            raise ValueError('That file is not a PDF.')
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValueError('Unlock the PDF before uploading it.')
        if len(reader.pages) > 100:
            raise ValueError('Use a PDF with at most 100 pages.')
        pages = [clean(page.extract_text() or '') for page in reader.pages]
    else:
        try:
            pages = [clean(page) for page in data.decode('utf-8-sig').split('\f')]
        except UnicodeDecodeError as exc:
            raise ValueError('Save text files as UTF-8 before uploading.') from exc
    if not pages or len(pages) > 100:
        raise ValueError('Use a document with at most 100 pages.')
    if any(len(page) > 50000 for page in pages) or sum(map(len,pages)) > 1000000:
        raise ValueError('Too much text. Split this document into smaller files.')
    if sum(len(page.strip()) for page in pages) < 10:
        raise ValueError('No readable text found. Scanned PDFs need OCR before import.')
    return [{'text':page} for page in pages]


if __name__ == '__main__':
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
        data = sys.stdin.buffer.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            raise ValueError('Use a file up to 25 MB.')
        print(json.dumps({'pages':extract(data, sys.argv[1])}))
    except ValueError as exc:
        print(json.dumps({'error':str(exc)}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'error':'Could not extract this document. Try an unlocked PDF with selectable text or a UTF-8 text file.'}))
        sys.exit(1)
