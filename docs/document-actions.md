# Reviewed document actions

This Take 2 increment turns an imported document into a checklist, useful note,
or follow-up reminder. It is implemented and locally tested; verification on the
deployment host remains pending. Photo-to-action drafts are outside this increment.

## Use

1. Attach a PDF/TXT/Markdown document with the chat paperclip, or choose an
   existing import from the document library.
2. Choose **Draft checklist**, **Draft note**, or **Draft follow-up**, then Send.
   These shortcuts only prepare the prompt; selecting one does not send it.
3. Inspect the cited document pages. Choose **Review and save**, then edit the
   title, notes and checklist steps. A follow-up requires a future date and time
   in the browser's timezone; the model does not choose the time.
4. Choose **Save to My Day**. The saved card provides Open My Day and Undo.
   Undo archives the item; Restore reopens the same item.

Natural requests such as “Create a preparation checklist from this document”
work while the document is selected. Ordinary explanations still produce answers.
Draft generation never creates a My Day item, schedules a reminder, contacts
anyone, or queues automatic memory extraction. Unedited model drafts are saved
in conversation metadata, so they survive reload. Unsaved user edits and selected
dates are local component state and do not survive reload. **Keep as draft**
collapses the editor without saving those edits to the server.

## Scope and limits

Drafting uses the existing document retrieval budget: up to six excerpts, each
up to 2,000 characters. This is not a guarantee that every page or exclusion was
read. Each checklist step and the notes must cite a supplied source number.
Malformed structured output, missing/unknown citations, empty checklists and
unsupported URLs produce a failure answer without a saveable draft. Citation
validation checks references, not the truth of the interpretation; review the
original source before using a checklist for work.

The selected conversation model must support structured JSON output. The draft
prompt treats document text as untrusted reference data, prohibits invented
procedures and commitments, and requests only source-supported steps. Existing
document limits and PDF extraction requirements still apply; see `documents.md`.
Generated drafts allow 30 steps, with at most 300 characters per step. Reviewed
saved items allow 100 steps, a 300-character title, and 12,000-character notes.

Reminders use the existing My Day delivery system. This does not introduce
background push delivery while the app is closed.

## Ownership, persistence and retries

Authenticated routes under `/v0.6/documents/companions/{companion_id}`:

- `GET /drafts/{message_id}` retrieves save status for that assistant draft.
- `POST /drafts/{message_id}/save` accepts reviewed fields and an explicit time
  for reminders. Kind, source conversation and document references come from
  the stored assistant message, rather than from caller-supplied identifiers.

The repository uses the caller's token and verifies companion/message ownership.
Saving verifies the source documents belong to that companion. A database trigger
also rejects cross-companion sources. My Day row policies protect copied excerpts
from other accounts. The server derives a stable UUID request key from the draft
message; the existing unique constraint prevents duplicate items on retries.
An already saved draft returns the original item, including archived status.

Document title, page and excerpt are copied into `source_documents` on the item.
My Day and the saved chat card provide page inspection. Deleting an import does
not erase these historical quotations or prevent Undo/Restore; opening its full
page then fails while the copied excerpt remains. Existing chat quotations and
database backups likewise retain their copies.

## Deployment and verification

Apply `20261007233000_document_action_sources.sql` before restarting the new API.
No new runtime dependencies are required. Preserve deployment `.env`, Supabase
Google redirects and HTTPS proxy configuration. Export with `--clear` to discard
Metro's cached public environment values, then restart API and static web services.

Checks performed for this increment:

- Backend suite: generation, citation failure, authenticated draft lookup/save,
  explicit future times, stable keys, repeat save, draft metadata persistence,
  and absence of automatic task/memory writes.
- PostgreSQL/PGlite using the actual migrations: ownership trigger, unique-key
  duplicate prevention, ordinary items, historical sources after deletion,
  Undo/Restore and account isolation.
- Production-export browser tests at a 390-pixel viewport: paperclip document
  selection, draft shortcuts, editing, failed save and retry, Undo/Restore after
  reload, notes, and Phoenix local time conversion for a reminder.
- Existing document browser regression: PDF/photo attachment, citation cards,
  library import/search/read/delete and resilient sign-out.

Suggested host smoke test: attach a proposal, draft and edit its checklist, save,
open My Day, inspect a source page, Undo and reload. Draft a follow-up, choose its
time explicitly, and confirm one reminder is created after Save.
