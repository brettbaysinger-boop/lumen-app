# Raialume — Development Session Handoff
Date: October 9, 2026

## Current state

Raialume is operational on the existing local-first AI infrastructure.

This session completed companion-initiated image generation and
natural image-response polishing.

The image-generation feature has been verified by the user in the
live application. The subsequent response-polish change has been
tested and deployed, but its wording has not yet been rechecked
in a fresh live conversation.

## Git state

Repository: `~/lumen-push`

Branch: `feat/lumen-take2-local`

Remote: `git@github.com:brettbaysinger-boop/lumen-app.git`

Latest application commit: `0cde482`

Relevant commits:

- `2c157b3` — Recover image Gallery functionality.
- `7f7877a` — Avoid rerendering chat history while typing.
- `3b47f68` — Enable companion-initiated image generation.
- `0cde482` — Preserve natural companion image replies.

All four commits were included in the successful GitHub push.

## Verified functionality

### Companion-initiated images

The user asked Raialume to share something meaningful about herself.

Raialume described an imagined "Memory Garden" and generated
an accompanying image.

Confirmed by the user:

- Image generation completed.
- Image appeared directly in the conversation.
- Image appeared in Gallery.
- The conversation did not expose internal action JSON.

### Response polish

Successful image generation now preserves the companion's
own explanation without appending a canned success sentence.

When no companion prose exists, a short fallback is used.

Generation failures retain explicit, truthful failure messaging.

Automated verification passed; fresh live acceptance remains pending.

## Test results

- Backend: 251 tests passed.
- Frontend: TypeScript typecheck passed.
- Python compilation: passed.
- Git diff checks: passed.

Some backend tests intentionally exercise failure paths and emit
diagnostic warnings or stack traces. The complete suite passed.

## Deployment

Application backend service: `lumen-api.service`

Local health endpoint:
`http://127.0.0.1:8001/health`

Tailscale HTTPS health endpoint:
`https://ailumen-llm-video.tail577ac1.ts.net:8444/health`

Both endpoints returned:

`{"status":"ok","ollama":"ok","database":"ok"}`

Backend service was active following deployment.

## Hardware and infrastructure

The application uses existing local AI infrastructure.

Heavy image generation is hosted separately through the
existing ComfyUI pipeline.

The project has an RTX 5060 Ti 16 GB GPU available for
image-generation workloads.

TTS/STT infrastructure must not be modified without explicit
user approval.

Hardware topology, GPU assignments, and current model deployments
should be confirmed on the home LAN before making changes.

## Preserve existing local files

The following files were intentionally not staged or modified
during this workstream:

- `supabase/config.toml`
- `lib/image-followup.ts.before-subject-fix`
- `supabase/config.toml.before-tail-redirects`
- `supabase/config.toml.before-tail-site-url`

Do not delete or overwrite these files without reviewing them.

## Recommended next-session startup

1. Read `docs/PROJECT-STATUS.md` and this handoff.
2. Check Git branch, remote synchronization, and working-tree status.
3. Confirm the running application and service health.
4. Review GPU availability and hardware assignments.
5. Test a new companion-generated image and confirm the response
   no longer includes the redundant canned ending.
6. Choose the next development milestone based on the current
   project roadmap and actual repository state.

## Development principles

- Preserve working functionality.
- Avoid duplicating existing systems.
- Distinguish implemented, tested, deployed, and user-verified work.
- Prefer targeted changes with regression tests.
- Protect local user data and existing infrastructure.
- Never assume a feature is deployed merely because it is committed.

<!-- provider-visibility-2026-10-10 -->
## October 10 — Provider visibility checkpoint

Implemented and locally verified; deployment and new-feature user acceptance pending.

- Settings now shows configured AI provider hosts and models instead of placeholder infrastructure badges.
- New assistant replies retain expandable provider request records: actual inference host, model, completion/failure and duration. Deterministic actions show no inference calls when appropriate.
- Records exclude prompts, credentials and response text. Background memory extraction and later speech playback are outside this per-reply record. Configured routes do not prove availability, GPU use or distributed inference.
- Direct image replies now use a short natural fallback; companion-authored image explanations remain preserved.
- Existing routing, models, workflows, speech infrastructure and database schema are unchanged.
- Local verification: 259 backend tests, TypeScript check, clean web export and mobile-sized mocked browser coverage. Live acceptance remains separate.
- User verified the prior companion-image prose change at `0cde482`, with images appearing in conversation and Gallery. Direct image requests still used the old canned sentence; this increment addresses that separate path.
- User-supplied home-LAN evidence: Video RTX 5070 12 GB; Heavy ComfyUI RTX 5060 Ti 16 GB, about 3.13 GiB free at the sampled moment; Heavy Ollama had no loaded models. API health reported Ollama/database OK. Heavy SSH refused connections while its HTTP providers responded. These are snapshots, not ongoing health guarantees.

See `docs/provider-visibility.md` (or `provider-visibility.md` from this directory). Next: deploy, check Settings and a fresh text-plus-image reply, then use observed routing to choose the next bounded milestone. Explicit multi-provider selection/scheduling is not implemented in this increment.

<!-- provider-acceptance-image-subject-2026-10-09 -->
## October 9 (America/Phoenix) — Live provider acceptance and image-subject fix

Provider visibility at `db21282` is deployed and user-verified. The user reported
Settings destinations correct and supplied persisted reply request details:
- Direct image: Heavy ComfyUI at `192.168.86.50:8188`, completed in 3.06 seconds.
- Companion-chosen scene: Video Ollama at `127.0.0.1:11434`, selected Gemma model,
  completed in 26.16 seconds; Heavy image generation completed in 3.10 seconds.
- Helios remains configured at `100.121.251.39:8000`; no speech changes.

Heavy also has Tailscale access. No routing change was needed: Video continues
to call Heavy over the home LAN while clients can reach Video through Tailscale.
The request records show separate calls, not distributed model inference.

A newly observed issue was fixed: merely addressing “Lumen” in a landscape
request previously injected her visual identity. Named subjects now require
an explicit depiction relationship such as “of Lumen”, “paint Lumen” or
“featuring Lumen”. Existing “yourself”, “of you” and “with you” references remain.
Ordinary scenery requests retain their original prompt and generic reply;
explicit companion portraits retain identity conditioning. This is a bounded
rule fix, not comprehensive natural-language subject parsing.

Verification: 25 targeted backend tests passed across image identity, direct
image endpoints, companion images and companion-image runtime. No frontend,
dependency, database, workflow or infrastructure change. This subject fix is
locally tested; deployment and live acceptance remain pending. Next acceptance:
address Lumen while requesting scenery, then explicitly request her portrait;
confirm both images and Gallery persistence. Generated content remains subject
to the image model; the regression checks verify identity prompt injection.

<!-- effort-work-2026-10-09 -->
## October 9, Phoenix — Effort controls and proposal workflow

Prior image-subject fix `205d6f7` is user-verified. User benchmarks established a
large reduction in synthetic answer latency with Boolean thinking disabled on the
installed Gemma model; default-reasoning runs were truncated, not complete answers.
See `docs/effort-and-document-work.md` for exact results and limitations.

Implemented: Quick / Think deeper / Model default controls, bounded to the verified
model; source-based proposal draft → check → revise workflow; editable text download
including references; existing reviewed save-to-My-Day flow reused. No migration,
Helios change or node reassignment. Six targeted effort/workflow tests passed;
full existing backend suite passed before the final additional payload test.
TypeScript, clean web export and mobile browser validation passed, including
effort selection, unsupported fallback and edited text download with source excerpts. Deployment and live user acceptance remain pending.

Work harder currently improves proposals from retrieved document excerpts. It is
not autonomous execution or formatted PDF/DOCX export. User review remains necessary
for prices, scope, warranties and missing source coverage. The broader lifelong
companion objective requires continued memory, identity and continuity work;
this increment does not claim to complete it.

User clarification: new projects must use explicit new customer, scope and price
details rather than only rewrite an old document. This increment accepts these
replacements. Approved reusable templates and persistent formatting preferences
remain the next part of this workstream; no automatic template memory is claimed.

<!-- life-companion-direction-2026-10-09 -->
## October 9, Phoenix — Direction and honest document-work status

The user confirmed the product direction: a lifelong AI companion that learns
preferences and helps with real projects. Next acceptance milestone is approved
reusable document templates plus new project details and print-ready PDF output.
See docs/lifelong-companion-and-templates.md for design and acceptance criteria.

Work harder at 73e6751 failed on the user's real proposal after one generation;
it is not user-verified. Persistent templates and PDF rendering are not built.
A follow-up fixes reproducible currency notation rejection and adds stage-only
failure logging. Seven focused tests passed; live retest is pending. No schema,
frontend, routing or Helios change. Customer reference data remains outside Git.

<!-- citation-provider-probes-2026-10-10 -->
## October 10, Phoenix — Citation provider investigation

User-supplied checkout verified:
`feat/lumen-take2-local` at
`45b26a1196bfad659a03a7ec4a5c05dccb1f0c94`.
Probe target files had no uncommitted changes. This is supplied
terminal evidence, not direct assistant access to the host.

The deployed retry did not resolve live acceptance: October 9 at
21:42:00, the workflow failed at draft_citation_retry_validation
with citations_missing. Review and revision were not reached.
The previously supplied 293 passing backend tests do not establish
real-request acceptance.

Two live synthetic probes used the deployed prepare_work prompts,
Proposal schema, OllamaProvider.structured path and existing validator.
Both used invented excerpts only. The second added invented customer/site
details and replaced $295 with explicitly user-supplied $595.

Both passed on their first generation:
- Baseline: 870 characters, 231 output tokens, done_reason=stop.
- Replacement: 788 characters, 210 output tokens, done_reason=stop.
- Model: satgeze/gemma4-12b-uncensored-1.5m:latest.
- think=false, temperature=0, num_predict=4096, num_ctx=8192.
- Outgoing schema/messages matched the provider arguments.
- Provider return exactly matched Ollama message.content.
- Recognized source citations and existing price validation passed.
- Each probe stopped before review, revision or persistence.

The inspected structured provider returns message.content directly;
no citation rewriting was found. These probes did not reproduce
the real failure and do not establish its cause. New customer details
and replacement pricing alone did not reproduce citation omission.
The private failed output remains uninspected, so omission versus
unrecognized formatting remains unresolved.

Next bounded investigation: compare failing-request input/output
structure through privacy-preserving counts and citation-format
indicators. Keep real customer text out of logs, Git and fixtures.
No application patch, model/routing change or deployment was made.
Preserve all existing source, citation, price and final-validation checks.

<!-- citation-final-contract-2026-10-10 -->
## October 10, Phoenix — Proposal citation fix validated locally

The saved failing interaction was replayed locally without printing customer
text. Its 813-character request and six saved excerpts reproduced
citations_missing on both draft attempts. Ollama output was returned unchanged
by the provider. Both calls ended normally without reaching their configured
context or output limits.

A candidate appends a final citation contract after proposal inputs, separating
user replacements from retained excerpt-backed terms. It does not insert
citations into generated output or weaken validation. The contract applies to
initial draft, permitted retry and final revision; review remains unchanged.

The candidate experiment completed draft, review and revision. The application
patch then passed 297 host backend tests, including four new synthetic
regression tests. A subsequent live replay through the patched application
code, without the experimental wrapper, completed all three stages and
returned a validated final draft with nine numeric citations and four
confirmation placeholders. Nothing was saved, exported or sent.

This establishes local workflow success on the saved failing inputs, not
independent claim verification or browser acceptance. Deployment and a fresh
user-facing retest remain pending. Inspect source support, new project details,
prices, exclusions, warranties and confirmation placeholders before accepting.
No provider, model, routing, frontend, database or Helios change is required.

<!-- proposal-job-context-candidate-2026-10-10 -->
## October 10, Phoenix — Proposal context and multi-user branding candidate

User-supplied host evidence: 2ba9ea9 deployed successfully after 304 backend
checks and TypeScript checks passed; web build succeeded, API/web services
were active, and API/Ollama/database health was OK. Browser evidence shows
an editable proposal card and PDF controls. Visual/download/edit acceptance
is not yet fully recorded. A subsequent draft exposed old-customer and
unrelated-service carryover, and missed details referenced from prior chat.

The supplied runtime confirms proposal drafting was not passed recent user
messages. The selected-document path already pins retrieval to that document;
no automatic reference-switching bug has been established.

A candidate now forwards one explicitly referenced previous USER message,
keeps the selected reference title, and pins user-message IDs for consistent
PDF price revalidation. It reinforces generic new-job/same-job and applicable
service-term instructions. No fixed rodent-only template is introduced.

The first PDF implementation hardcoded one business identity. This candidate
removes that global header/logo/footer/author. Owner-specific business profiles,
logos and approved templates remain unimplemented and must be scoped to the
signed-in owner when added. Existing image assets and configuration are intact.

Validation before application: 26 isolated mocked-provider tests passed,
including 19 new cases and 7 existing PDF regressions. The full host suite,
live synthetic model probe and browser acceptance remain pending. This entry
records candidate application, not deployment or semantic acceptance.
See docs/proposal-job-context.md for boundaries and remaining limitations.

<!-- proposal-context-host-validation-2026-10-10 -->
## October 10 — Host validation of proposal context candidate

User-supplied host evidence: 323 backend tests passed in 2.786 seconds.
Live synthetic rodent, termite and combined-job probes passed their
indicators, each using three model calls. The ant probe's keyword flag
was manually inspected: the draft explicitly excluded unrelated services.
Its customer, address and prices were correct.

The combined draft kept rodent workmanship and termite retreat terms
separate. These bounded examples do not establish universal semantic
correctness. No customer records were used by these synthetic probes.

Deployment and browser acceptance remain pending. The candidate uses
neutral PDF branding; owner-specific business profiles and logos remain
to be implemented.

<!-- proposal-pdf-layout-candidate-2026-10-10 -->
## October 10 — Generic proposal PDF layout candidate

Applied a bounded renderer candidate at supplied checkpoint 252de5f. It adds
compact customer/pricing tables, embedded fonts and grouped acceptance fields.
Reference filenames are replaced with generic document labels; citation/page
mapping remains. The export authorization and all existing validation remain.
34 isolated tests passed and rendered pages were inspected. Full host tests,
deployment and browser acceptance are pending; this is not a deployment record.
No model, routing, frontend or business-brand configuration changes were made.
Content corrections and owner-specific branding remain separate pending work.
See docs/proposal-pdf-layout.md for details and limitations.

<!-- proposal-layout-host-tests-331 -->
## October 10 — PDF layout host validation

User-supplied host output confirms bundle checksum verification,
successful guarded application, clean whitespace checks, and 331 backend
tests passing in 2.885 seconds. This supersedes pending host-suite status.
Deployment and browser PDF acceptance remain pending.

<!-- private-document-style-candidate-2026-10-10 -->
## October 10 — Account-private document style candidate

Supplied host checkpoint: 5900e1c. Prior layout host suite: 331 tests passed.
A newly downloaded PDF confirmed the improved two-page renderer visually;
restart health output was not supplied. Existing wording issues remain.

Candidate adds a web draft-card style panel with owner-private logo and visual
settings, transient analysis of one or two PDF examples, synthetic preview,
save/reset, and validated PDF export integration. Examples suggest page size,
spacing and accent only; exact visual template recreation remains future work.
Customer text and original examples are not persisted or used as job evidence.
A new owner-RLS document_styles table stores the profile and sanitized logo.

Validation: 56 isolated backend tests, isolated strict frontend typecheck,
component account-switch checks, and isolated PostgreSQL RLS checks passed.
Both synthetic preview pages were rendered and inspected. Full host tests,
migration, deployment and browser acceptance remain pending. No model or
provider routing, Gallery, Supabase configuration or existing backups changed.
See docs/private-document-style.md for limits and remaining work.

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

<!-- proposal-wording-live-probes-2026-10-10 -->
## October 10 — Proposal wording candidate validated with installed model

Continuing from deployed a2cca68. Four user-run synthetic probes passed
through the installed OllamaProvider and full draft/review/revision flow,
using three calls each. Printed invented drafts were also inspected.

New-job examples did not import unapproved promotions. Explicitly approved
license information, service warranty limitations and the 10% price-match
offer were retained. Same-job offers survived. Supplied schedules were
not marked unconfirmed; unsigned acceptance fields remained blank.

The exact probed JOB_REFERENCE_RULES change is now applied locally.
Source selection, citation checks, price checks, final validation, model,
routing and call budgets are unchanged. No customer data is in fixtures.
The prior 60 isolated tests passed; full host-suite validation, deployment
and actual-request browser acceptance remain pending for this candidate.
These examples do not establish universal semantic correctness.

Persistent approved business defaults and exact example-layout matching
remain unimplemented. Existing private logo/style behavior is preserved.

<!-- proposal-wording-host-tests-357 -->
## October 10 — Proposal wording host validation

User-supplied host evidence confirms guarded application, clean whitespace
checks and 357 backend tests passing in 3.711 seconds. Four installed-model
synthetic probes previously passed, including explicit offer retention,
unapproved-offer omission, supplied schedules and blank acceptance fields.
This supersedes pending host-suite status. Deployment and actual-request
browser acceptance remain pending.

<!-- proposal-wording-deployed-e09f74a -->
## October 10, Phoenix — Proposal wording deployed and browser checked

User-supplied terminal evidence confirms e09f74a committed, API restarted,
and API/Ollama/database health all OK. The host suite passed 357 tests.
Four installed-model synthetic cases passed before deployment.

The supplied fresh browser request, draft and exported PDF were inspected.
The actual request completed draft/review/revision in three model calls.
Supplied schedule, prices, conditional complimentary treatment, recurring
service and warranty remained. The unrequested price-match offer was omitted.
Unnecessary confirmation tags were removed and acceptance fields left blank.
Both PDF pages were rendered and inspected: branded proposal and acceptance
fit on page one; anonymous source-reference labels remain on page two.

This verifies the targeted corrections for this request, not universal
semantic correctness. Remaining content issues: reference sanitation wording
may imply unrequested cleanup, and the acceptance disclaimer is duplicated.
Do not treat a source citation alone as authorization for additional work.

Next work includes owner-private approved business defaults with service
applicability and per-job overrides. Saved visual styles/logos already exist;
persistent approved terms and exact example-layout reproduction do not.
Existing configuration, backups and unrelated edits remain intact.

<!-- memory-retrieval-host-checkpoint-2026-10-10 -->
## October 10, Phoenix — Companion memory work resumed

The proposal/document workstream is paused. Its deployed checkpoint is
e09f74a; the preceding October 10 entries retain its acceptance evidence
and remaining work. Private logo/style and compact PDF rendering exist.
Approved business defaults, service applicability, exact example-layout
reproduction, sanitation wording and duplicate disclaimer remain follow-up work.

Current direction: a lifelong local companion with useful memory,
natural continuity and grounded self-model research. Do not rebuild
the existing companion, voice, image or everyday-assistant foundations.

Question-aware memory retrieval is applied and the full host backend suite
passed 373 tests from the backend directory. All 16 new retrieval/runtime
tests passed. The earlier root-directory run failed importing test_images
because backend Settings could not load required Supabase configuration;
that run was not a passing full-suite checkpoint.

The candidate passes the current message into retrieval and ranks up to
500 active saved memories by lexical content/topic matches before selecting
the normal 12. Subject labels, authorization and active-memory filtering
remain. This is bounded lexical retrieval, not semantic recall or a search
of all historical conversations. See docs/question-aware-memory.md.

No service restart, migration or deployment was performed for this candidate.
Browser acceptance and live recall remain pending. Last supplied healthy
deployment is e09f74a. Next: review and explicitly deploy the memory candidate,
then verify cross-conversation recall, competing memories and attribution.

Preserve Supabase configuration, backup files and unrelated local edits.
At resume, verify branch/HEAD/status and read the newest appended entries.

<!-- conversational-corrections-candidate-2026-10-10 -->
## October 10, Phoenix — Recall accepted; conversational correction candidate

User-supplied host evidence confirms db30595 deployed by API restart and health
API/Ollama/database OK. Browser replies recalled the saved test preference and
correctly attributed it to the user. The user clarified that the test value was
not their actual preference; do not treat that fixture as a real user preference.
373 host tests passed before that deployment and the branch was pushed.

The user requested natural correction through conversation. This candidate adds
explicit correction/change interpretation, exact-source validation, a scoped
version-checked update, private revision history and a persisted chat Undo card.
Clear supported corrections need no separate approval. Missing replacement
values prompt clarification. Ordinary comments must not rewrite preferences.
Earlier false facts and later changes are distinguished in revision history.

Development validation: 402 backend tests, 30 isolated PostgreSQL checks,
TypeScript, web export and direct React component interaction tests passed.
Chromium download failed, so mocked browser execution remains pending.
Host tests and installed-model synthetic probes must pass before applying
20261010190000_memory_corrections.sql and explicitly deploying API/web.
This entry records a candidate, not application-database migration or deployment.
See docs/conversational-memory-corrections.md for supported syntax and limits.
The proposal workstream remains paused; its existing outcome and remaining work
are preserved. Supabase configuration and unrelated backups remain untouched.

<!-- conversational-corrections-model-fix-2026-10-10 -->
## October 10 — Conversational correction model compatibility candidate

User-supplied host evidence: initial candidate passed 402 backend tests,
TypeScript and 30 isolated SQL checks. Installed-model synthetic probes failed.
Raw synthetic output showed correction/change misclassification, empty outputs,
omitted certainty, and a short value placed in the full-assertion field.

Process-only probes with reasoning disabled, explicit classification examples
and all schema fields required passed six of seven cases. The remaining temporal
case duplicated the new fragment in assertion. This follow-up recovers only
that exact duplication and still applies all existing fragment evidence,
attribute, certainty, ownership and revision checks. It does not infer certainty.

406 isolated backend tests pass, including recovery and rejection regressions.
Full host tests and installed-model probes of this final source remain pending.
No application migration, deployment or browser correction acceptance is claimed.
Configuration, backups and unrelated edits remain untouched.

<!-- memory-corrections-host-validation-406 -->
## October 10, Phoenix — Conversational corrections host validation

User-supplied host evidence confirms guarded follow-up application,
clean whitespace checks, and 406 backend tests passing in 3.630 seconds.
All seven installed-model synthetic correction probes passed:
direct, contextual, missing-value, temporal, casual, negative and hypothetical.
These probes used mocked database operations, not real memory writes.

Earlier host TypeScript and 30 isolated SQL checks passed. The follow-up
changed backend parsing/schema instructions and tests, not UI or SQL.
This supersedes pending host-suite and synthetic-model validation.
It does not establish universal natural-language correctness.

Application migration, deployment, browser correction, reload persistence
and Undo acceptance remain pending. Proposal work remains paused.
Existing configuration, backups and unrelated edits remain preserved.

<!-- memory-correction-visibility-candidate-2026-10-10 -->
## October 10, Phoenix — Deployed correction evidence and visibility follow-up

User-supplied host output confirms 4ea7cb0 pushed and deployed, migration
20261010190000 synchronized, successful web build, active API/web services
and API/Ollama/database health OK. A pre-migration database archive was
created and its archive list verified; no restore drill is claimed.
Prior validation: 406 backend tests, TypeScript, 30 isolated SQL checks,
and seven installed-model synthetic probes passed.

Browser transcript shows an explicit 'actually' correction produced a
Memory corrected / Undo / View change card. User reports the revised answer
survives reload. Undo itself and fresh-conversation recall remain unverified.
The preceding bare preference plus 'yes update it' exchange produced an
unsupported generated update claim without a receipt. Do not record that
exchange as a verified memory write.

Code inspection confirms Memories sorted/displayed creation dates and
refreshed proposals, but not saved entries, on tab focus. This follow-up
refreshes saved entries on focus and polling, sorts by updated_at, shows
created and updated dates, and exposes the latest revision card on each
saved memory, including Undo. Existing edit/delete controls remain.
It also detects unsupported ordinary-chat preference/memory mutation claims
and sends them through the existing rewrite guard.

408 backend tests, TypeScript and component checks pass locally, including
memory-linked latest-revision lookup, Undo refresh and account isolation.
Host validation, deployment and browser acceptance of this follow-up remain
pending. No migration or configuration change is required.
Bare assertions plus 'yes update it' still need grounded conversational
intent handling; this follow-up does not claim to implement that flow.

<!-- memory-visibility-host-tests-408 -->
## October 10 — Memory visibility host validation

User-supplied host output confirms guarded application, clean whitespace
checks, 408 backend tests passing in 4.086 seconds and TypeScript passing.
This supersedes pending host validation for the visibility follow-up.
Deployment and browser acceptance remain pending. No migration is required.

<!-- memory-correction-browser-accepted-2026-10-10 -->
## October 10, Phoenix — Memory correction browser acceptance

38a5b87 was pushed and deployed with successful web build, active services,
and API/Ollama/database health OK. Host validation passed 408 backend tests
and TypeScript.

User verified correction visibility in Memories, updated dates, Undo,
persistence after reload, and restored-value recall in a new conversation.
A decorative overlay intercepted the delete control on important memories.
The pointerEvents="none" follow-up was applied; the user confirmed deletion
then worked and a fresh conversation no longer supplied the deleted value.

This closes the bounded correction/reload/Undo/deletion acceptance sequence.
It does not establish universal natural-language correction accuracy.
Deletion deactivates the saved memory; historical chat and revision records
are not erased by this control.

Remaining work: grounded handling of bare preference changes followed by
"yes update it"; more precise wording when no saved fact is available;
broader natural-memory acceptance and the original companion goal-list review.
Proposal work remains paused. Configuration and existing backups are preserved.

<!-- natural-memory-confirmation-candidate-2026-10-10 -->
## October 10, Phoenix — Grounded natural preference confirmation candidate

Continuing from pushed ae9c0b0. Prior browser acceptance covers correction,
reload, Undo, deletion and fresh-chat recall. Skills/language/website learning
is paused at the user's request; its separate scratch candidate was not applied,
pushed or deployed.

This candidate recognizes bounded first-person facts matching an existing
loaded user-memory attribute. A conflicting value produces an explicit proposal
containing the exact old and new text; no memory write or automatic observation
occurs for that proposal. "Yes, update it" (and bounded affirmative variants)
confirms only the immediately preceding persisted proposal and user assertion.
"No" cancels. Unrelated conversation expires the confirmation opportunity.
Missing proposals cannot be reconstructed from model-generated promises.

Confirmation rechecks owner-scoped active records, unique attribute/topic,
exact source-message identity, old text and revision version. The existing
atomic correction RPC supplies concurrency protection, revision receipt and Undo.
Retries recover confirmed receipts; already-undone requests are not reapplied.
No database, frontend, model/provider configuration or deployment change.

424 isolated backend tests pass, including a complete runtime two-turn flow,
proposal persistence, cancellation, stale/deleted/duplicate target refusal,
unverified assistant prose, request replay and write-time uncertainty.
The new route itself makes no model call. Full host validation and browser
acceptance remain pending.

Boundaries: lexical attributes and a matching memory in the current retrieval
context are required; this is not arbitrary semantic conflict resolution.
New unrelated facts retain the existing natural-memory observation behavior.
This does not add history erasure or temporal change inference.

<!-- natural-memory-confirmation-host-tests-424 -->
## October 10 — Natural memory confirmation host validation

User-supplied evidence confirms checksum verification, guarded application,
clean whitespace checks and 424 backend tests passing in 3.649 seconds.
This supersedes pending host-suite validation for this candidate.
Deployment and browser acceptance remain pending.
No migration or frontend build is required. Skills work remains paused.

<!-- natural-memory-season-alias-candidate-2026-10-10 -->
## October 10, Phoenix — Natural confirmation accepted; season wording follow-up

User-supplied host evidence confirms bd960b4 committed, pushed, API restarted
and API/Ollama/database health OK. Prior host validation: 424 backend tests.
Browser transcript confirms a bare favorite-season statement produced an
exact replacement proposal, plain "yes" produced a correction receipt,
and the user reports chat Undo restored summer.

Cancellation and fresh-chat recall of the confirmed new value have not yet
been separately reported for this increment. Earlier correction-flow acceptance
covered reload, Undo, deletion and fresh-chat recall.

The user also demonstrated "my favorite time is autumn" bypassing the
season conflict path and receiving unsupported speculative chat wording.
This follow-up matches favorite time/time of year to favorite season only
when the stated value is explicitly spring/summer/autumn/fall/winter.
Other times (e.g. morning or Christmas) ask for clarification when a
season memory is present. No season or preference is inferred from a question.

428 isolated backend tests pass: exact original wording, ambiguity refusal,
alias duplicate checks, and affirmative confirmation with the existing version
and receipt. Host validation, deployment and browser acceptance remain pending.
This remains bounded lexical matching, not arbitrary semantic interpretation.
No migration, frontend, provider or configuration change. Skills work is paused.

<!-- memory-season-alias-host-tests-428 -->
## October 10 — Season wording host validation

User-supplied output confirms checksum verification, guarded application,
clean whitespace checks and 428 backend tests passing in 3.738 seconds.
This supersedes pending host-suite validation for the season wording candidate.
Deployment and browser acceptance remain pending.
No migration or frontend build is required. Skills work remains paused.

<!-- memory-undo-context-candidate-2026-10-10 -->
## October 10, Phoenix — Season wording accepted; stale-chat Undo investigation

User-supplied evidence confirms ea8be99 pushed, API restarted and
API/Ollama/database health OK. Earlier host suite: 428 tests passed.
Browser transcript confirms season-alias proposals, cancellation, affirmative
save and clarification for morning. The user reports Undo restored summer in
Memories and a new chat, but the existing chat incorrectly answered autumn
and defended that answer. Do not record existing-chat Undo recall as accepted.

Code inspection confirms old correction messages enter history with their
original text, while the generic current-value precedence instruction is earlier
in the prompt. The model receives no explicit database Undo status in that history.

This candidate adds a current memory snapshot after historical messages,
including fresh owner/companion/conversation-scoped status for referenced
revision receipts and current associated memory rows. Undone or superseded
receipts are labeled historical; inactive memories are excluded from current
facts. A status lookup failure is marked unavailable rather than inventing Undo.
The persistent transcript is unchanged. No memory writes are performed by this check.

438 isolated backend tests pass, including Undo, current/superseded receipts,
inactive facts, unavailable state, identity filtering and context placement.
A synthetic installed-model probe covers same-chat Undo recall, a certainty
follow-up after a stale answer, and deletion with old history. Host suite,
installed-model probe, deployment and browser acceptance remain pending.
This context change is not a guarantee of universal model adherence.
No migration, frontend, model/provider configuration or backup change.
Skills/language/website work remains paused.

<!-- memory-undo-recall-followup-candidate-2026-10-10 -->
## October 10 — Undo context host probes and direct recall follow-up

User-supplied host evidence: guarded context candidate applied, whitespace
checks passed and 438 backend tests passed in 3.771 seconds.
The same-chat Undo synthetic answer used summer. The certainty answer corrected
autumn to summer but offered to reapply autumn. The deleted-memory probe failed:
the model invented an established morning preference and offered to save autumn.
No migration, commit or deployment was performed for that candidate.

This follow-up answers bounded direct saved-preference questions and
immediate certainty follow-ups from the checked current-memory snapshot.
The model does not select those current values. Inactive facts cannot become
current preferences from old chat. Missing facts are described as unavailable
current saved values; conflicting current values require review. Verified
Undo status can explain an earlier correction without soliciting restoration.
The historical transcript remains intact; no memory writes are added.

445 isolated backend tests pass locally, including the direct recall path,
certainty, deleted facts, subject ownership, conflicting entries, unsupported
queries and repeat follow-up metadata. Ordinary conversation still uses the
late current-memory context with explicit historical receipt status.

The updated synthetic host probe reports provider-call counts: direct recall
cases need no inference; an ordinary explanatory conversation case uses the
selected installed model. Host tests, probe, deployment and browser acceptance
remain pending. This is bounded recall routing, not universal semantic recall.
No migration, frontend, provider configuration or backup change.

<!-- memory-undo-context-host-validation-445 -->
## October 10, Phoenix — Undo-aware memory context host validation

User-supplied host evidence confirms guarded application, clean whitespace
checks and 445 backend tests passing in 3.742 seconds.

All four synthetic runtime probes passed. Same-chat recall after Undo,
certainty after a stale answer, and deleted-memory recall used zero provider
calls. Ordinary conversation used one installed-model provider call and
correctly recognized the restored summer value and undone autumn correction.
Database operations were mocked; no real memory writes were made.

Commit, deployment and actual same-chat browser acceptance remain pending.
No migration or frontend build is required. Skills and proposal work remain
paused. Existing configuration and backups are preserved.
