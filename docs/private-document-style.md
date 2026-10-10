# Private document style — bounded first version

Baseline: supplied host commit 5900e1c on feat/lumen-take2-local.

## User flow

On an unsaved proposal note card in the web UI, open Document style.
Upload a still PNG/JPG/WebP logo, optionally import one or two text-based PDF
examples, adjust the visual settings, preview with invented sample content,
and save. Future PDF exports use the signed-in account's saved style across
its companions. Reset removes the stored profile and logo. Existing downloaded
PDFs are not changed; regenerate a preview to use the new style.

This release supports a logo, optional business/contact header, darkened accent
color, Letter/A4 page size, compact/comfortable spacing and left/center header.
Business/contact details already in the draft are preserved; leave the style's
header fields blank if those details would duplicate the existing body.

## Examples and limits

Examples suggest page size, text density and an RGB accent from their first page.
If examples disagree, the first wins on conflicting settings and the UI reports
that conflict. Suggestions can be adjusted before saving. This is bounded PDF
geometry/color analysis, not a vision-model reconstruction or exact template clone.
It does not infer arbitrary columns, section order, borders or fonts. Scanned,
encrypted, rotated and landscape examples are rejected; use a portrait text PDF.
Native app style editing and arbitrary layout reproduction remain future work.

Each example is at most 8 MB / 20 pages; at most two examples per request.
The extraction child has a 15-second wall timeout, 10 CPU seconds and 512 MB
address-space limit on Linux. Example bytes, text, names and filenames are
transient and are neither stored nor passed to proposal generation or memory.
Only page-size, spacing and accent values leave the worker. No new model call,
provider routing, Gallery interaction or document-source mutation occurs.

The earlier exploration suggested storing original style examples. This first
implementation intentionally persists only the reusable visual settings and logo;
retaining customer-filled originals is unnecessary for the supported settings.

## Ownership and validation

A new document_styles table is keyed by auth.users.id with authenticated-owner
RLS for read/insert/update/delete. Anonymous access and ownership transfer are
denied. The backend uses the user's bearer token and derives ownership from
verified authentication. A client account header can reject an account-switch
race but never grants access. The panel unmounts its profile state on account
change and ignores stale request completion.

Logos are limited to 4 MB / four megapixels, decoded as still raster images,
converted to RGBA PNG, resized to at most 1000x400 and stripped of metadata.
The sanitized logo is at most 500 KB, stored as base64 with the profile in one
atomic row. SVG, external logo URLs and animated images are unsupported.
Database row size is bounded. Rendering never fetches external image URLs.

Current PDF clients request saved style explicitly. Older callers retain their
neutral behavior. Existing companion/message/document authorization and
source/citation/price validation run before loading/applying the style. Saved
style outages produce an explicit error rather than silently changing branding.
Company/contact fields reject control characters and currency/percentage signs;
these fields are identity text, not a new source of proposal terms.

Owner isolation prevents reading other accounts' stored logos; it cannot certify
ownership of a logo supplied by the authenticated user. A user-selected logo is
branding, not evidence for claims or pricing.

## Validation before host application

- 56 isolated backend tests passed: 34 prior fixture cases plus 22 new cases.
- New frontend files passed isolated strict TypeScript checks against React 19
  and React Native 0.81.4 types; project-specific auth/theme interfaces were
  represented by typed stubs. Full host typecheck remains required.
- Component checks covered lazy loading, save, account switch and stale results.
- The actual migration ran in isolated PGlite PostgreSQL; owner CRUD, cross-owner
  read/update/delete isolation, transfer denial, size bounds and anonymous denial passed.
- A synthetic branded A4 PDF was rendered and both pages visually inspected.
- Guarded installer was tested in an isolated checkout; unrelated edits preserved.

Full host backend tests, project typecheck, local migration and browser upload /
save / reload / export / account-isolation acceptance remain pending. No customer
content or real logo is in fixtures. No host deployment was performed by this bundle.

Prior uploaded PDF review confirmed the 5900e1c layout in a downloaded artifact:
one proposal/acceptance page plus a reference page, clean tables and anonymous
reference filenames. No restart health output was supplied for that checkpoint.

Unnecessary confirmation placeholders, copied offers, and broader proposal
semantics remain a separate workstream. This change does not claim to fix them.

<!-- document-style-host-validation-353 -->
## October 10 — Private document style host validation

User-supplied host evidence confirms checksum verification, guarded
application, clean whitespace checks, 353 backend tests passing in
3.495 seconds, and the full project TypeScript check passing.
Isolated PostgreSQL tests passed owner CRUD, cross-owner isolation,
ownership-transfer denial, size limits and anonymous-access denial.
This supersedes pending host test status. The application database
migration, deployment and browser acceptance remain pending.

<!-- document-style-deployed-74659b0 -->
## October 10, Phoenix — Private document style deployed

User-supplied evidence confirms commit 74659b0 deployed after 353 backend
tests, full TypeScript checks and isolated PostgreSQL ownership checks passed.
Migration 20261010170000 applied locally and migration history is synchronized.
Web export succeeded; API/web services are active; API/Ollama/database
health all report OK.

The uploaded browser-exported PDF was visually inspected: the user's logo
and green accent appear correctly, with readable tables and preserved source
references. The user reported improvement. This confirms branded export;
reload persistence, reset, example-import behavior and second-account browser
isolation have not yet been separately verified.

Remaining work: compact the branded header to avoid a separate acceptance
page; correct unnecessary confirmation placeholders and unapproved offer
carryover. Exact example-layout reproduction remains unimplemented.
Existing configuration, backups and unrelated status edits remain intact.

<!-- compact-proposal-header-candidate-2026-10-10 -->
## October 10 — Compact branded header candidate

Continuing from deployed 74659b0 with 353 passing host backend tests. The
user supplied successful migration/build/health output and a branded PDF.
Its logo and green accent work, but acceptance spilled onto a separate page.
This renderer-only candidate places the logo beside the title/header instead
of stacking it above. Proposal wording and all validation remain unchanged.

60 isolated tests passed, including four new header regressions. Synthetic
pages were visually inspected. A private re-render of the supplied draft/logo
fits proposal and acceptance on page one, references on page two. No real
customer content or logo is in tests or Git. Full host tests, deployment and
new browser PDF acceptance remain pending. No migration or frontend build
is needed. Wording corrections and richer example matching remain pending.
See docs/compact-proposal-header.md.

<!-- compact-header-host-tests-357 -->
## October 10 — Compact header host validation

User-supplied host output confirms checksum verification, guarded
application, clean whitespace checks, and 357 backend tests passing
in 3.616 seconds. Deployment and new browser PDF acceptance remain pending.

<!-- compact-header-deployed-a2cca68 -->
## October 10, Phoenix — Compact header deployed and PDF inspected

User-supplied terminal evidence confirms a2cca68 committed and the API
restarted successfully, with API/Ollama/database health all OK. The earlier
host suite passed 357 tests. The newly uploaded browser PDF was rendered
and both pages visually inspected: the branded proposal and acceptance
fit on page one; readable private reference labels remain on page two.
This closes the bounded compact-header layout acceptance for that sample.
It does not establish that every future proposal fits on one page.

The exported content still has an unnecessary confirmation on a supplied
schedule and an unapproved reference price-match offer. The next investigation
tests stricter offer authorization, supplied-fact handling and unsigned
acceptance blanks using invented inputs through the installed provider.
The candidate runs only in the diagnostic process; no generation patch or
deployment is performed. Exact example-layout reproduction remains pending.
