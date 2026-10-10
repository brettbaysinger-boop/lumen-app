# Lumen — Authoritative Project Status

**Checkpoint:** October 8, 2026
**Development branch:** `feat/lumen-take2-local`
**Last user-verified feature deployment:** `eb7cea4`
**Previous documentation checkpoint:** `1ea6142`

This document is the canonical summary of Lumen's current development
position. Detailed feature documentation, architecture decisions, and
validation history remain in their respective files.

## Project direction

Lumen is a local-first, privacy-conscious AI companion designed to
remember useful context, assist with everyday life, support ongoing
goals, understand documents and images, and use local AI infrastructure.

The repository is authoritative for implementation status. Chat
history is not a substitute for checking the current code and records.

## Infrastructure

| Node | Responsibility |
| --- | --- |
| `aiLumen-llm-video` | Application, backend, database, orchestration |
| `aiLumen-llm-tts-stt` | Helios speech recognition and synthesis |
| `aiLumen-llm-heavy` | RTX 5060 Ti 16GB GPU compute node |

Heavy is documented as an image-generation provider through ComfyUI.
Its current runtime utilization and broader inference capabilities
have not yet been audited.

## Implemented foundations

### Companion experience

- Take 2 interface and appearance customization.
- Companion name, persona, portrait, and visual identity editing.
- Companion-specific Helios voice selection and preview.
- Animated companion presence and speech-state effects.
- Persistent conversations and companion state.

### Everyday assistant

- My Day items, reminders, notes, and checklists.
- Conversational capture into named lists.
- Gift ideas and quick notes.
- Reviewed small-step plans with persistent completion.
- Goals, practice sessions, and explicit progress saving.

### Research and understanding

- Local SearXNG-backed web research with cited excerpts.
- Private PDF/TXT/Markdown document imports and search.
- Document questions with source/page references.
- Reviewed document-to-checklist, note, and reminder drafts.
- Local photo understanding using a vision-capable Ollama model.
- Existing ComfyUI image-generation provider integration.

## Verification and evidence

- October 6: user-reported mobile HTTPS login, camera,
  microphone, photo understanding, and document attachment checks.
- October 7: user-reported document action and practice-flow checks.
- October 8: user-reported everyday capture and small-step plan checks.
- October 8: user reported daily use of shopping lists and reminders.
- Latest documented automated checkpoint: 207 backend tests,
  TypeScript check, clean web export, SQL privacy/persistence checks,
  and mobile-sized mocked browser verification.

User reports, automated checks, implementation inspection, and
unverified runtime behavior must remain clearly distinguished.

## Known limitations

- Closed-app push and recurring reminder notifications remain future work.
- Document and memory retrieval are primarily lexical, not semantic.
- Scanned PDF OCR and richer document layout extraction remain future work.
- Companion portrait generation-to-selection flow needs verification.
- Heavy's active GPU workloads, available VRAM, model inventory,
  and inference routing need direct runtime inspection.
- Existing image generation does not establish that Heavy is
  currently serving conversation or vision inference.
- Provider/capability registry remains a planned architectural increment.

## Current priority

**Improve utilization of `aiLumen-llm-heavy` without duplicating
already implemented Companion UI, voice, vision, or research features.**

Next steps:

1. Inspect Heavy's actual GPU services, models, memory, and utilization.
2. Inspect backend Ollama and ComfyUI routing and deployed endpoints.
3. Identify one safe, measurable GPU workload improvement.
4. Validate behavior, responsiveness, and VRAM contention.
5. Verify companion portrait generation and saved-portrait integration.
6. Update this checkpoint after each completed workstream.

## October 9, 2026 — Image generation and gallery recovery

**State:** Database recovery applied and verified. Application changes tested
locally but not yet committed, deployed, or user-verified in the browser.

### Confirmed infrastructure

- `aiLumen-llm-heavy` serves ComfyUI at `192.168.86.50:8188`.
- Heavy reports an NVIDIA RTX 5060 Ti with 16 GB VRAM.
- Required FLUX.2 Klein 4B FP8 model assets and workflow nodes are available.
- A live backend-provider generation returned a valid 1024×1024 PNG
  in approximately 3.04 seconds.
- The application backend is configured to use Heavy for image generation.
- This does not establish that Heavy serves conversational or vision inference.

### Image and gallery repairs

- Expanded direct image-request detection.
- Added contextual handling for confirmations of explicit image offers.
- Preserved the user's literal confirmation separately from the resolved
  image-generation prompt.
- Added gallery registration for generated images and user-uploaded images.
- Added authenticated signed-URL rendering for private gallery images.
- Added signed-URL renewal for longer-lived gallery sessions.
- Gallery registration failures are logged without losing chat messages.

### Historical gallery recovery

Applied migration:
`20261009190000_backfill_chat_image_gallery.sql`

- 48 generated images recovered.
- 21 user-uploaded image attachments recovered.
- 69 unique gallery entries verified.
- All 69 entries have storage paths and original-message references.
- All 69 referenced storage objects and companion/conversation relationships
  were verified before recovery.
- One additional unreferenced chat-media object was left untouched.
- Recovery uses deterministic UUIDv5 IDs and conflict-safe insertion.
- Original message timestamps are preserved.

### Automated validation

- TypeScript typecheck passed.
- Six frontend image-follow-up tests passed.
- Eight backend image/gallery tests passed.
- `git diff --check` passed.
- Recovery migration dry run inserted 69 records and rolled back cleanly.
- Supabase migration applied and appears in local migration history.

### Remaining acceptance work

1. Review and commit the intended application, test, documentation,
   and migration changes.
2. Build and deploy the updated web frontend and backend.
3. Verify that all 69 historical images appear in the browser gallery.
4. Test a new direct image request and a conversational confirmation.
5. Confirm new generated and uploaded images appear in Gallery.
6. Continue the broader Heavy workload and inference-routing audit.

Do not stage unrelated `supabase/config.toml` changes or backup files.

## Cross-chat development protocol

At the beginning of every new Lumen development conversation:

1. Read this document.
2. Check `git branch --show-current`, `git log -1`, and `git status`.
3. Consult the relevant feature documentation and current implementation.
4. Distinguish implemented, tested, deployed, and user-verified states.
5. Never recommend rebuilding a completed feature without identifying
   a specific missing capability.
6. Make one bounded change, test it, review it, commit, and push.
7. Update this checkpoint whenever a workstream is completed.

## Local configuration protection

At this checkpoint, the following files have unrelated local changes:

- `supabase/config.toml`
- `supabase/config.toml.before-tail-redirects`
- `supabase/config.toml.before-tail-site-url`

Do not stage, overwrite, reset, clean, or commit these files as part
of documentation or feature work without explicit user approval.

## Supporting records

- `ROADMAP.md`
- `docs/architecture.md`
- `docs/product-design.md`
- `docs/redesign/TAKE2.md`
- `docs/assistant/STATUS.md`
- `docs/assistant/VALIDATION.md`
- `docs/everyday-capture.md`
- `docs/getting-unstuck.md`
- `docs/goals-and-practice.md`
- `docs/image-generation.md`
- `docs/vision.md`
- `docs/documents.md`
- `docs/document-actions.md`
- `docs/web-research.md`

## Chat typing performance optimization — October 9, 2026

**Status:** Implemented and locally validated; browser acceptance pending.

- Extracted the chat message renderer into a `useCallback` with explicit dependencies.
- Memoized individual web conversation message rows so ordinary draft typing
  does not unnecessarily re-render unchanged message content.
- Preserved the existing native `FlatList` implementation.
- Added `tests/conversation-render-performance.test.cjs` with three regression checks.
- Validation: 3/3 regression tests pass, TypeScript passes, and `git diff --check` passes.
- The user is testing remotely through Tailscale. Browser responsiveness must
  still be verified before claiming the typing lag is resolved.
- The previous image-generation and gallery recovery work was deployed and
  subsequently confirmed working by the user in the browser.

## October 9, 2026 — Companion-initiated image generation

**State:** Implementation and automated tests complete. Live deployment
and user acceptance remain to be verified.

### Implemented

- Conversational model can request an image through a structured internal
  `generate_image` action rather than displaying action JSON in chat.
- Supports companion self-portraits using saved visual identity.
- Uses the existing Heavy/ComfyUI image-generation integration.
- Saves generated images in private chat-media storage.
- Attaches the image to the companion's persisted chat message.
- Registers generated images in Gallery using deterministic IDs.
- Preserves ordinary incremental chat streaming while filtering internal
  image-action markup and standalone legacy JSON.
- Handles generation failures without claiming an image was created.
- Limits image-action execution to the conversational model reply branch.
- Keeps user-uploaded photo Gallery registration intact.

### Automated validation

- 249 backend tests passed.
- TypeScript typecheck passed.
- Python compilation passed.
- `git diff --check` passed.

### Remaining acceptance

1. Commit the intended backend implementation and tests.
2. Deploy the backend API.
3. Ask Raialume to show something about herself.
4. Verify a real image appears in chat and Gallery.
5. Verify ordinary text replies still stream smoothly.
6. Confirm generated self-portraits reflect saved visual identity.

### October 9 — Live companion-image acceptance

**User-verified:** Companion-initiated image generation succeeded in the
deployed application at commit `3b47f68`.

- The companion independently chose to illustrate a "Memory Garden".
- Heavy generated the image successfully.
- The image appeared in the companion's chat response.
- The user confirmed the same image appeared in Gallery.
- No internal image-action JSON was visible in the response.
- The user requested removal of the redundant backend-generated
  "Here's the image I made for you" sentence.

**Follow-up polish:** Successful image replies now preserve the companion's
own prose without appending a canned sentence. When no prose exists, a
short natural fallback is used. Failure replies remain explicit and truthful.

**Polish deployment:** Pending.

### October 9 — Session closeout and deployment verification

**Status: deployed, tested, pushed, and partially user-verified.**

Repository:
- Branch: `feat/lumen-take2-local`
- Latest application commit: `0cde482`
- Remote: `git@github.com:brettbaysinger-boop/lumen-app.git`
- Branch pushed successfully to GitHub.

Companion-initiated images:
- Commit `3b47f68` implemented companion-requested image generation.
- User verified a generated "Memory Garden" image appeared in chat.
- User independently confirmed the same image appeared in Gallery.
- Internal image-action JSON was not exposed in that interaction.
- Image generation uses the existing Heavy provider and Gallery pipeline.

Natural response polish:
- Commit `0cde482` removes the redundant successful-image sentence:
  "Here's the image I made for you."
- Companion-authored prose is preserved.
- Empty successful replies receive a short natural fallback.
- Failed image generation retains truthful error messaging.
- Backend deployed successfully after the change.
- Fresh user-facing acceptance of the polished wording remains pending.

Verification:
- 251 backend tests passed.
- Frontend TypeScript typecheck passed.
- Python compilation and Git patch checks passed.
- `lumen-api.service` active following restart.
- Local API health returned OK.
- HTTPS API health returned OK.
- Ollama and database health returned OK.
- GitHub push completed successfully.

Existing unrelated local changes were intentionally preserved:
- `supabase/config.toml`
- `lib/image-followup.ts.before-subject-fix`
- `supabase/config.toml.before-tail-redirects`
- `supabase/config.toml.before-tail-site-url`

Next session:
- Resume development on the home LAN with local hardware access.
- Review this status file and the session handoff first.
- Verify a fresh companion-generated image uses natural closing prose.
- Confirm service and GPU health before starting new development.
- Do not modify TTS/STT infrastructure without explicit approval.

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
