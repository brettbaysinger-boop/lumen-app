# Private document imports

This Take 2 checkpoint adds a **Your documents** screen, accessible from the
conversation header and Settings. Import a PDF with selectable text, UTF-8 TXT,
or Markdown file, search its extracted text, and open a result's source page.
Phone and desktop browsers support the file picker. Native app imports are not
included in this release.

**Ask companion** prepares `Search my documents: QUESTION` in the conversation
draft. Press Send to ask the selected local conversation model to answer from
matching excerpts with numbered document and page references. Ordinary chat does
not silently search documents. `Ask my documents: QUESTION` also works.
No matches produces an explicit message rather than an invented answer.

## Storage and ownership

Only extracted text, page numbers, filename, file hash and import metadata are
saved. Original files are not retained as document assets; temporary upload
handles are closed after processing. Imports belong to the selected companion
and its authenticated owner. API requests use the caller's token. Database RLS
also protects documents, pages and chunks; import and search functions run with
the caller's privileges. The support admin screen has no document-reading tools.
Server/database operators still control the underlying self-hosted storage.

Import is one database transaction: invalid pages roll back the complete import.
Uploading identical bytes to the same companion reuses its existing document.
Deletion removes the import, its pages and search chunks. **Previously saved chat
answers and quoted excerpts remain in conversation history**, including their
source cards; opening a deleted page reports that it is unavailable. Backups can
also retain prior data until their own retention policy expires.

Document synthesis receives only the explicit question and matching excerpts,
without previous conversation, personal memories or authentication credentials.
The supplied excerpts are treated as untrusted data. This model turn has no
external search or action tools. It does not automatically create memories from
the document answer. A user can still deliberately copy private text into a web
search; web queries use the separately configured search provider.

## Limits

| Limit | Value |
| --- | --- |
| File types | PDF, TXT, MD |
| Upload size | Up to 5 MiB |
| Documents | Up to 100 per companion |
| Pages | Up to 100 per document |
| Extracted text | Up to 50,000 characters per page; 1,000,000 per document |
| Query | 2–500 characters |
| Retrieved excerpts | Up to 5 |
| Search chunks | 2,000 characters, overlapping by 200 |
| Extraction worker | 512 MiB address space, 15 CPU seconds, 25-second wall deadline |

PDF page references preserve the original page order, including blank pages.
Text and Markdown files are one logical page unless separated by form-feed
characters. Layout and images are not preserved. Password-protected PDFs must
be unlocked first; scanned image-only PDFs need OCR before import. Files with
fewer than ten readable characters are rejected.

Search uses PostgreSQL English full-text ranking with OR matching between query
terms. It is lexical retrieval, not embeddings or semantic search. Specific
words from the document work best; unrelated excerpts may rank when a question
contains common terms. There is no filesystem crawl or connected drive access.

PDF extraction runs in a separate bounded process using pypdf. It reads uploaded
bytes and does not execute embedded scripts or follow document links. This is a
resource limit, not a complete operating-system sandbox.

Generated answers must cite existing source numbers. Grouped references such as
`[1, 2]` are validated individually and normalized to `[1] [2]`. Invalid references,
missing citations, unexpected HTTP URLs, or generation errors fall back to the
actual matching excerpts. Citation validation does not verify that every claim
is true or supported. Inspect the referenced page when accuracy matters.

## Install

After fetching and merging the checkpoint:

```bash
cd ~/lumen-push &&
(cd backend && .venv/bin/python -m pip install -e .) &&
"$HOME/.local/share/lumen-tools/node_modules/.bin/supabase" migration up --local &&
npm run typecheck &&
npm run build:web &&
sudo systemctl restart lumen-api.service lumen-web.service
```

The Python dependency adds `pypdf>=6.4,<7`. The migration is
`20261007050000_private_documents.sql`. Do not reset the database or change Auth,
HTTPS mappings, Google callbacks, or the search container for this update.
The existing backup script includes the new public tables automatically.

Verify on the host:

1. Import a small selectable-text PDF or TXT file through Your documents.
2. Search a distinctive phrase; open the source page and check its number/text.
3. Ask companion, confirm the draft, then Send; inspect the cited page.
4. Reload and confirm the answer and source cards persist.
5. Reimport the same file; confirm it is recognized as already imported.
6. Delete the import; confirm search no longer returns its text.

If reverting application code, retain the document tables unless intentionally
removing user data. Dropping the migration's tables is destructive.

## Development checks

The backend suite covers real PDF/text extraction, page preservation, invalid and
encrypted files, input limits, authentication, ownership checks, duplicate
handling, API scopes, isolated answer generation and citation fallback.
`scripts/test-documents-sql.cjs` runs the migration in PGlite PostgreSQL to check
atomic import, full-text search, two-account RLS isolation, anonymous denial and
delete cascades. Set `LUMEN_PGLITE_MODULE` to an installed PGlite package path.
This complements, rather than replaces, applying the migration to live Supabase.

`scripts/test-documents-browser.cjs` uses an exported web build and mocked services
for grouped web citations, mobile upload/search/page reading, draft-only questions,
chat source persistence, deletion and sign-out. Set `LUMEN_PLAYWRIGHT_MODULE` to an
installed Playwright package path. Live model quality and actual phone uploads
still require verification on the deployment.
