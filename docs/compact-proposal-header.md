# Compact branded proposal header

Baseline: user-supplied deployed commit 74659b0. The user confirmed improvement
and supplied a three-page branded PDF: proposal, mostly-empty acceptance page,
and references. The migration, build, active services and all-OK health output
were supplied separately. Prior host suite: 353 passing backend tests.

This bounded patch puts the logo beside the title/review notice and any explicit
saved business header. Logo aspect ratio is preserved within an 86x44 point box.
Saved header text alignment remains active within its text column. Existing
business text in the proposal body is not guessed, removed or moved. The body
font, wording, prices, citations, placeholders and terms are unchanged.

Short acceptance blocks still stay together. Longer documents paginate normally;
there is no guarantee every proposal fits one page, no forced shrinking, and no
content is dropped to make it fit. Long titles/contact lines wrap within the header.
No API/schema/UI/migration/model/routing or configuration changes are required.

Validation: 60 isolated backend tests passed (56 prior cases and four new header
cases). Tall/wide logos, long titles, neutral/A4 export and long body preservation
are covered. Synthetic PDF pages were rendered and inspected. The supplied draft
and its logo were re-rendered privately: acceptance now fits the first page and
the references occupy page two. Real customer text/logos are not included in
fixtures, the bundle or Git. Host tests and downloaded-PDF acceptance are pending.

The separate wording workstream remains pending: unnecessary confirmation labels,
reference offers carried into new jobs, and exact example-layout matching.

<!-- compact-header-host-tests-357 -->
## October 10 — Compact header host validation

User-supplied host output confirms checksum verification, guarded
application, clean whitespace checks, and 357 backend tests passing
in 3.616 seconds. Deployment and new browser PDF acceptance remain pending.
