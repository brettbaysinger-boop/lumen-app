# Lumen — Authoritative Project Status

<!-- memory-97-97-gold-standard-checkpoint-2026-10-12 -->
## October 12, 2026 (America/Phoenix) — Semantic memory 97/97, Phase 1 queued

**Source:** User-supplied production terminal results, confirmed after the
October 12 durability repair; not a repository snapshot of private DB data.
**Repository application code:** `f86e2d8` on `feat/lumen-take2-local`
before this documentation checkpoint. Host `aiLumen-llm-video`, checkout
`/home/brett/lumen-push`.

Product contract: memory ownership is always the authenticated end user and
their specific companion, never hard-coded personal/companion names. The
local database has 11 companions owned by 10 distinct users; one user owns
two companions. Scope every memory query and embedding to the actual owner
AND companion.

- Memory quality implementation `f86e2d8` was pushed; 542 backend tests,
  TypeScript check and Expo web export passed. SQL guardrails migration
  `20261012090000_memory_quality_guardrails.sql` was applied/ledgered
  atomically in the local Supabase database. API and web deployed, API,
  Ollama and database health OK.
- Seven earlier attribution/durability mistakes were cleaned using
  exact source-message evidence, strict row/revision/fingerprint checks and
  independent transactions. One verified attribution repair set changed
  8 rows; a subsequent verified durability repair corrected 2 useful
  statements and deactivated 5 one-off/temporary statements. Original
  suggestions and evidence were preserved; revisions advanced.
- The pilot companion's latest verified state: **97 active saved memories,
  97 current embeddings, 0 stale/invalid bindings, 0 embeddings for other
  companions**, and 122 active saved memories total database-wide.
  This is a single companion's complete shadow index, not a globally
  shared memory index. Other accounts' data was not indexed.
- Pinned model: `nomic-embed-text:v1.5`, digest
  `0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`,
  768 L2-normalized dimensions, `search_document:` and `search_query:`
  preprocessing, CPU-only Ollama at `127.0.0.1:11435`, `size_vram=0`.
- Both `semantic_memory_enabled=False` and
  `semantic_index_after_chat=False`; **semantic candidates do not yet
  influence chat replies**. Existing lexical recall remains in use.
- Foreign owner denied by real authenticated SQL match RPC; same-owner
  sibling companion isolated. The original 4-row retrieval smoke trial
  scored 4/4 direct top-1 with an unrelated control; that is not a full
  performance estimate.
- Historical benchmark of **8 targets / 16 model-generated questions**
  on the old 102-memory index: direct top-1 7/8 (87.5%), indirect top-1
  4/8 (50%); many prompts were ambiguous and several gold targets had
  valid near-equivalents. The 102-memory report is retained as historical
  evidence only, NOT a validated current 97-memory benchmark. The
  `think=False` structured question-generation fix was verified.
- Pre-durability-repair backup, created and verified:
  `/home/brett/lumen-backups/durability-repair-20261012-210932`.
  Local read-only source audit report:
  `/home/brett/.local/state/lumen-audits/durability-context-20261012-063448.json`.
  Backups and private benchmarks remain outside Git.

**Current priority — Phase 1, prevent future bad memories.** Cover natural
observation extraction, automatic saving, user review approval, and explicit
manual/remember requests with a generic, conservative durability decision.
Skip unmistakable throwaway messages; flag uncertain one-off requests for
review and preserve explicit user override with a clear confirmation.
Add backend/TypeScript/SQL regression tests before any deployment.
Then Phase 2: independently labeled 97-memory retrieval benchmark; Phase 3:
hybrid lexical/entity/subject/temporal candidate selection and abstention.
No semantic runtime activation until measured and accepted.

The historical cleanup is **local database state**, not code committed to Git.
Preserve four unrelated local files:
`supabase/config.toml`,
`lib/image-followup.ts.before-subject-fix`,
`supabase/config.toml.before-tail-redirects`,
`supabase/config.toml.before-tail-site-url`.
Never reset/clean/broad-stage the checkout. No deployment of Phase 1 yet.

<!-- chat-usability-checkpoint-2026-10-11 -->

## October 11, Phoenix — Chat usability first pass; acceptance pending

Base application checkpoint: 756519f, previously pushed and verified.
Checkout: /home/brett/lumen-push on aiLumen-llm-video.
Branch: feat/lumen-take2-local.

Implemented first pass:
- New generic chats receive a bounded title from their opening message.
  This is deterministic naming, not model-generated topic summarization.
  Existing history and custom names are preserved. The conditional update
  guards the prior title and companion scope; naming failure does not fail chat.
- Chat history rows are compact and expose options through an ellipsis.
- The management dialog has a bounded desktop width and height.
- Desktop history opening removes the dimming backdrop and reserves space
  beside the conversation. Mobile retains its dismissible drawer.
- Basic assistant formatting renders bold text, headings, bullets, inline
  code and fenced code. Citation links retain their existing validation.
  This is a limited renderer, not complete Markdown support.
- Provider records and activity timings are grouped behind Details.

Evidence:
Earlier supplied terminal output showed TypeScript passing, all 47 Node tests
passing, four dedicated naming tests passing, and all 488 backend tests passing.
No additional tests were run for this documentation checkpoint.
Brett states acceptance tests have not been completed. Browser visual,
interaction, naming persistence, formatting, citation and both-account checks
remain pending. No new Android or iOS acceptance is established.

A staged web export and API/web restart command was supplied for this pass.
Its completion has not been verified by terminal output in this session.
Confirm the running build before beginning acceptance; do not assume deployment.

Product scope:
Continue together carries selected chats into a new conversation through an
editable, reviewed summary, retaining original-chat links. It does not create
or link a My Day project. Brett explicitly chose to keep these purposes separate.
No new project-planning integration should be added as part of this UI work.

Reviewed-handoff acceptance is incomplete. A reported continued-chat answer
used $150; whether a proposed $125 correction was actually saved has not been
verified. Inspect the saved reviewed summary before attributing that result
to a model or persistence defect.

Remaining redesign:
- Simplify collection controls into a compact filter.
- Put occasional history actions in a menu.
- Improve multi-chat selection and Continue together discoverability.
- Group history by recency and refine the conversation header.
- Consider one-time model-generated topic titles after reliable first-message
  naming, while preserving user-selected names.
- Review contrast, keyboard behavior and layout on desktop and mobile.
- Test, refine, then rebuild and accept the Android preview on both accounts.

Previous My Day project-step acceptance remains recorded at 756519f.
Archive project hides the whole project; step-level Undo is not implemented.
Broader natural My Day actions, iOS acceptance/push and other recorded pending
work remain open. Memory relevance, skills and proposal work remain paused.

Local Supabase settings, environment values, build artifacts and backups remain
outside Git. Preserve them; do not reset or clean the checkout.


<!-- consolidated-mobile-checkpoint-2026-10-11 -->

## Current checkpoint — October 11, 2026 (America/Phoenix)

Latest accepted application commit: `a5d184e`.
Branch: `feat/lumen-take2-local`.
Active checkout: `/home/brett/lumen-push` on `aiLumen-llm-video`.

Android Galaxy S22 acceptance passed on the existing Lumen account and a
second test account: chat/login keyboard positioning, companion reply
playback, tap-to-start/tap-to-stop STT, transcript review before sending,
five-minute native recording limit, leaving/background cancellation,
and notification regression checks.

Companion creation/customization and Android reminder push were also
accepted earlier on both account flows. Push implementation is committed
at `8522280`; mobile keyboard/voice implementation at `a5d184e`.

Host validation: TypeScript and all 47 Node tests passed for mobile fixes.
Earlier Android push host checkpoint: 459 backend tests, queue/ownership/
permission checks and pip check passed. Backend tests were not rerun for
the frontend-only mobile fixes. Assistant component regression checks and
platform exports passed; final STT follow-up Android export passed.

Chrome Google sign-in/sign-out passed twice after the local auth allowlist
added `raialume-preview://login`. Running allowlist verified.
API and push worker active; API/Ollama/database health reported OK.
The redirect configuration remains a local, uncommitted setting.
Firebase service-account credentials remain outside Git and the APK.

Native STT uses Helios via the authenticated backend, mono AAC at 64 kbps,
and a five-minute recording limit. Backend limits remain 10 MB per upload
and 120 seconds for the upstream speech request. Web recording retains
its existing one-minute limit.

Pending: Firefox native Google-login verification, iOS device acceptance
and iOS push. Broader mobile polish and chat consolidation remain open.
Memory relevance, skills and proposal work remain paused.

Hardware evidence: [AI infrastructure](AI-INFRASTRUCTURE.md).
This checkpoint does not deploy the web frontend.
Historical sections below retain their original scope and dates.


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

<!-- natural-memory-extraction-host-validation-2026-10-10 -->
## October 10, Phoenix — Natural memory acceptance and extraction fix

Host checkpoint efc22bf is committed and synchronized with the remote branch.
The user verified existing-chat direct recall, certainty follow-up and ordinary
conversation correctly use the restored value after Undo.

Natural-memory browser testing verified an ordinary explanation preference
was automatically saved with user ownership and recalled in a fresh chat.
A hypothetical guitar statement produced no visible saved memory or proposal.
An ongoing-project statement was not available in a fresh chat. Repeated
background observation failures were reported; their generic logs did not
establish the cause of each individual failure.

A synthetic installed-model probe reproduced an empty structured response for
an ongoing-project statement. An in-process think=False follow-up returned
valid evidence-backed preference and project candidates, and an empty candidate
list for the hypothetical. All database operations were mocked.

The bounded fix sets think=False for memory extraction only. Regression
assertions cover default and selected-model extraction. Guarded host application,
clean whitespace checks and 445 backend tests passed in 3.809 seconds.
No migration or frontend build is required. Deployment and real project-memory
retry acceptance remain pending.

Project and next-step candidates shared a topic in the synthetic output.
Real database conflict checks may leave one for review; both auto-saves are
not established. Existing evidence, sensitivity, ownership and conflict
protection remain intact. Broader natural-memory acceptance remains ongoing.
Skills and proposal work remain paused. Configuration and backups are preserved.

<!-- natural-memory-browser-acceptance-2026-10-10 -->
## October 10, Phoenix — Natural memory browser acceptance

19acf46 was committed, pushed and deployed. API/Ollama/database health
reported OK; the host backend suite passed 445 tests.

User testing verified ordinary preference extraction with correct user
ownership and fresh-chat recall. A hypothetical guitar statement produced
no visible memory or proposal. Following the extraction fix and retries,
previously failed checks populated memories and the UI reported no
unfinished checks. A fresh conversation correctly recalled the Lumen
natural-memory project and its next step. The user subsequently confirmed
a new memory populated automatically without pressing Retry.

The user reported an unwanted suggestion was removed and did not return.
This is bounded reported suppression acceptance, not a comprehensive replay
or duplicate-accuracy evaluation. The recovered backlog's full accuracy
has not been audited.

Remembered project facts do not automatically create My Day projects or
Goals & practice records. The existing-chat Undo recall fix at efc22bf
was also browser-verified for direct recall, certainty and ordinary explanation.

Next: evaluate differently worded project recall, relevant retrieval as
memory grows, and conversational continuity. Durable automatic retry workers,
semantic/temporal retrieval and evidence-linked reflection remain open.
Skills and proposal work remain paused. Configuration and backups are preserved.

<!-- companion-memory-session-handoff-2026-10-10 -->
## October 10, Phoenix — Companion memory checkpoint and session handoff

Latest verified application commit: 19acf46.
Latest verified documentation commit before this checkpoint: 55a4c66.
Active host: aiLumen-llm-video, /home/brett/lumen-push.
Active branch: feat/lumen-take2-local.

Application evidence:
- 445 host backend tests passed after the extraction fix.
- 19acf46 was pushed, API restarted, and API/Ollama/database health reported OK.
- Explicit and natural corrections, confirmation/cancellation, saved-memory
  visibility, reload persistence, Undo and deletion have bounded user acceptance.
- Existing-chat direct recall, certainty and ordinary explanation correctly
  recognize the restored value after Undo.
- An ordinary explanation preference saved automatically and was recalled
  in a fresh chat.
- A hypothetical statement produced no visible saved memory or proposal.
- Failed extraction checks recovered after think=False was applied to
  background structured extraction. The UI reported no unfinished checks.
- Fresh-chat recall returned the ongoing project and its next step.
- A subsequent new memory populated automatically without pressing Retry.
- The user reported dismissal/removal stayed suppressed in the tested sequence.

Latest finding:
A differently worded project-continuation question recalled the general project,
but also surfaced unrelated personal preferences and omitted the concrete next
step. This establishes a relevance/answer-focus gap for that sample, not a
failure to persist all memories. Do not copy private conversation text into
public fixtures or documentation.

Next memory work:
Inspect retrieval and prompt/context composition using synthetic mixed-topic
fixtures. Measure selection of relevant project facts and next steps while
preserving appropriate preference recall in other conversations. Keep the
solution general across users, projects, hobbies and relationships; do not
hardcode this user's project or suppress entire subject categories.

Current boundaries:
Retrieval is bounded and lexical, not established semantic/temporal recall.
Recovered backlog accuracy and duplicate behavior have not been fully audited.
Project and next-step candidates can share a topic; real conflict checks may
leave a candidate for review. Remembered projects do not automatically create
My Day projects or Goals & practice records. Deletion deactivates memories;
historical conversations and revisions are retained.
Durable automatic retry, evidence-linked reflection and grounded companion
self-model improvements remain open. Consciousness is not established.

Paused workstreams:
Proposal/document work remains paused at its recorded checkpoint, including
approved business defaults and exact reusable example-layout matching.
Skills/language/website-learning expansion remains paused.

Fresh-session instructions:
Read the newest appended PROJECT-STATUS and SESSION-HANDOFF entries first.
Verify actual host branch, HEAD and worktree before editing; this handoff does
not authorize assuming host access or treating GitHub as local-state evidence.
The user intends to work on another app aspect in the next conversation.
Preserve supabase/config.toml changes and existing source/configuration backups.
No reset, clean, broad staging or automatic deployment.

<!-- mobile-chat-cache-candidate-2026-10-10 -->
## October 10, Phoenix — Android-first mobile testing and cached-chat candidate

User-supplied host output verifies aiLumen-llm-video, /home/brett/lumen-push,
feat/lumen-take2-local at d71fce9, with local origin tracking synchronized 0/0.
Existing supabase/config.toml edit and three source/configuration backups remain.
Domains are reported purchased; a VPS is planned but not provisioned or specified.

Agreed direction: cached chat and connection recovery, Android preview, personal
companion onboarding/mobile navigation refresh, reliable jobs and push, then iPhone.
This candidate adds bounded owner-private cached chats, per-conversation text
drafts, retry/foreground refresh and stale-response guards. Cached existing users
can pass companion setup without waiting for the backend; local session availability
is still required. Sign-out clears private cache and blocks late writes.

Local validation: 17 Node tests, TypeScript, web export and synthetic React
component runtime checks pass. Chromium is unavailable and its download failed;
390px browser script is included but unexecuted. Host validation, deployment,
real browser acceptance and native builds remain pending. No automatic send queue,
background job, push, onboarding or navigation redesign is claimed.
No schema, backend, model/provider/voice configuration or backup changes.
Memory relevance, skills and proposal work remain paused.
See docs/mobile-testing.md for bounds, remaining work and acceptance checks.

Additional user scope at 22:35 Phoenix: end-user chat rename, deletion and
consolidation/organization. Record these for the next chat increment, including
archive/search and clear deletion/cache/derived-memory behavior. Controls are
not implemented in this cached-chat candidate; transcript merging remains undecided.

<!-- mobile-cache-host-validation-2026-10-10 -->
## October 10, Phoenix — Cached-chat host validation passed

User-supplied host evidence confirms guarded patch application, clean
whitespace checks, TypeScript and all 17 Node tests passing.
A clean temporary export passed synthetic endpoint checks and the
390px browser test: cached chats, separate drafts, backend-unavailable
reload and reconnect retry. The earlier timeout used an export containing
the real authentication URL; clearing Metro and disabling dotenv resolved
the test setup mismatch.

Live phone acceptance, deployment and native builds remain pending.
Configuration and backups remain preserved. No services were restarted.
Memory relevance, skills and proposal work remain paused.

<!-- android-preview-phone-acceptance-2026-10-10 -->
## October 10, Phoenix — Android preview passed live phone acceptance

User-supplied host evidence confirms the isolated Android release build
completed successfully from cached-chat commit b1e1f34 with the native
session-storage and foreground token-refresh changes overlaid.

Build directory: /home/brett/lumen-android-builds/preview.ijhcJd
APK: android/app/build/outputs/apk/release/app-release.apk
Package: com.raialume.preview
Label: Raialume Preview
Architecture: arm64-v8a
Minimum Android SDK: 24
APK signature verification passed.
APK SHA256: 36cff44d618fc6ff814bda0e705edcdf547fdce796214b666c3ec4faaca211ca

ADB installation succeeded on Samsung SM-S901U (Galaxy S22).
Brett reports all live phone acceptance checks passed:
- Email/password sign-in and successful chat reply.
- Session and chat history retained after closing and reopening.
- Cached history and unsent draft retained during airplane-mode reopening.
- Connectivity restoration and chat recovery.
Brett reports smoother operation and easier navigation.

Native auth candidate passed host TypeScript and all 18 Node tests.
This is a private preview using the existing backend; production release,
iOS testing and push notifications remain pending. Native voice and
document attachments remain pending. No production services were deployed
or restarted for this checkpoint.

Next work: chat rename/archive/delete with cache invalidation, followed by
personalized companion onboarding, mobile UI polish and push notifications.
Chat consolidation semantics remain to be defined before implementation.
Memory relevance, skills and proposal work remain paused.
Configuration and backups remain preserved.

<!-- chat-management-phone-acceptance-2026-10-11 -->
## October 11, Phoenix — Chat management passed phone acceptance

User-supplied host evidence confirms patch checksum, whitespace checks,
TypeScript and all 21 Node tests passed against 9fd757d.
Brett reports the updated Android preview passed live Galaxy S22 checks:
rename, archive/restore, deletion cancellation, confirmed deletion,
offline reopening without the deleted chat/draft, and unrelated chat use.

During testing, cached chats remained available while live requests failed.
Host API/database/Ollama health reported OK; Tailscale ping reached the S22.
Android hostname lookup returned unknown host for the configured server.
Phone reboot restored connectivity; Brett then reported all checks passed.

Chat deletion preserves saved companion memories, Gallery items,
documents and My Day items. Other devices reconcile their cache when
they reconnect. Transcript consolidation remains pending.

No production service deployment or restart performed.
Configuration and backups preserved.
Memory relevance, skills and proposal work remain paused.
Next: personalized companion onboarding, mobile UI polish and push.

<!-- companion-creation-accepted-2026-10-11 -->
## October 11, Phoenix — Guided companion creation accepted

Host TypeScript, 24 Node tests and all 447 backend tests passed.
Migration 20261011080000 applied locally; existing companion fields
were verified unchanged. Ownership, validation and atomic identity
tests passed with fixtures rolled back.
Database backup: /home/brett/lumen-db-backups/companion-creation.8zFfGZ

Android preview build and installation succeeded.
APK SHA256: a095946d3065766d0b1e51280e2c392782e206860134614ba6342db19641430b
Brett reports all phone tests passed, including first-time creation
on a new account.

Requested next: name suggestions, remove pronoun field from setup,
romantic personality, appearance builder, voice samples on Android,
and generated companion portrait preview/regenerate/use flow.
These enhancements are pending.
Configuration and backups preserved.
Memory relevance, skills and proposal work remain paused.

<!-- companion-customization-accepted-2026-10-11 -->
## October 11, Phoenix — Companion customization accepted

Host TypeScript, all 31 Node tests and all 450 backend tests passed.
Android preview build completed successfully and ADB installation succeeded.
Brett reports all requested phone acceptance checks passed:
name suggestions, removal of the pronoun field, romantic personality,
appearance description builder, native voice samples, and generated
portrait preview/regenerate/use/save persistence.

APK SHA256:
f77f825a5b6fa0c51393fe7bfcf5725ce16e52876e683c7d0761b2bc9bf1a341
Previous APK:
/home/brett/lumen-android-builds/preview.ijhcJd/before-customization.7aZ7cl.apk

No new database migration was required.
Configuration, database backups and prior preview APK preserved.
Memory relevance, skills and proposal work remain paused.
Push notifications, further mobile UI polish and iOS testing remain pending.

<!-- android-push-accepted-2026-10-11 -->
## October 11, Phoenix — Android push notifications accepted

Host TypeScript, all 36 Node tests and all 459 backend tests passed.
Queue tests passed. Both push migrations were applied locally:
20261011150000_android_push.sql
20261011160000_push_rpc_permissions.sql

Host validation caught Supabase default function grants exposing worker
claims to authenticated users. The corrective migration explicitly revoked
API-role access and regranted only the intended functions. Actual database
ownership and permission tests then passed with fixtures rolled back.
Backend dependencies installed; pip check passed.

API and lumen-push.service reported active; API/Ollama/database health OK.
Worker enabled for startup. Existing environment files preserved; push
configuration uses /home/brett/.config/raialume/push.env and an API drop-in.
Firebase service-account key remains outside Git and the APK.

Android build and ADB installation succeeded.
APK SHA256:
5b5429b9e7aabdc98f8d874e8aedfcb12e5bfd3b6451cd1b9a542d8b32aff2d6
Native build/APK backup:
/home/brett/lumen-android-builds/before-push.pmv2Zk
Database correction backup:
/home/brett/lumen-db-backups/push-permissions.4NDBrD

Brett reports all phone acceptance checks passed on the existing Lumen
account and a newly created account: live notifications, tap-to-My-Day,
background reminders, cancellation/deletion before due, disable/re-enable,
sign-out and account switching.

Direct FCM delivery uses generic notification text; reminder details remain
on the local backend. Offline sign-out revocation is best effort, and
already queued notifications cannot be recalled. Delivery is not guaranteed
exactly once. See docs/android-push.md for behavior and limitations.

Supabase configuration and existing backups preserved.
No web deployment or Git push performed in this checkpoint.
Memory relevance, skills and proposal work remain paused.
Further mobile UI polish, iOS testing and iOS push remain pending.

<!-- mobile-voice-keyboard-accepted-2026-10-11 -->
## October 11, Phoenix — Mobile keyboard and voice accepted

Baseline commit: 8522280 on feat/lumen-take2-local.
Host TypeScript and all 47 Node tests passed.
Assistant chat cache/management regressions and platform exports passed;
the final STT startup follow-up Android export also passed.

Brett reports S22 acceptance on both accounts:
- Chat and login fields remain visible above the keyboard.
- Native companion reply playback works.
- Tap Talk / tap Stop records and transcribes into the draft.
- Five-minute native recording limit verified.
- Leaving chat and backgrounding cancel voice work as intended.
- Reply playback and notification regression checks still pass.

Chrome Google sign-in/sign-out passed twice after adding
raialume-preview://login to the local Supabase redirect allowlist.
Running auth allowlist verified; API and push services restarted and active.
API/Ollama/database health reported OK. Firefox remains unverified.

Native recording uses mono AAC at 64 kbps with a five-minute limit.
Permission checks reuse existing grants; startup tolerates temporary inactive
state, while backgrounding cancels. Voice errors persist independently of
chat refresh and identify the failing recorder stage.
Transcripts remain drafts until the user sends them.
Backend retains its 10 MB upload limit and 120-second speech timeout.

Known pre-follow-up APK:
e7b65eab578adacbd0432b5b3f537f9b7f2798d168369f7a96abe09c460711fc
Its backup: /home/brett/lumen-android-builds/before-login-stt.WH6G5B.
Final follow-up APK hash and backup path have not been supplied here.

No new dependencies, backend changes or migrations in these mobile fixes.
Local Supabase configuration and existing backup files remain outside this
commit. No Git push or web deployment performed by this checkpoint.
iOS device testing remains pending.

<!-- firefox-native-auth-accepted-2026-10-11 -->

## October 11, Phoenix — Firefox native Google login accepted

Android OAuth now opens its browser with createTask: false.
User-reported Galaxy S22 acceptance passed: Firefox Google login with
two-factor verification, session persistence after reopening, second-account
companion/history isolation, Chrome sign-in/sign-out, and deliberate
cancellation followed by a successful retry.

Host TypeScript, social-auth checks and all 47 Node tests passed.
Android release build and ADB update installation succeeded.

The first rebuild crashed at startup because public Supabase build settings
were absent. Restoring the backed-up APK restored operation. The corrected
build explicitly supplied the three frontend settings from the checkout's
.env and NODE_ENV=production, forced JavaScript rebundling, and verified all
three values against both the working backup and rebuilt APK before install.
No environment values are recorded here.

Accepted APK SHA256:
da843214581c8ea52d6e33480708e25c1fa9e73d2aaeb46efeec103f0d09b3ee

Previous working APK and login source preserved at:
/home/brett/lumen-android-builds/before-firefox-auth.mymlatl_

Supabase configuration and existing backups remain outside this commit.
No backend changes, migration or web deployment.
iOS acceptance/push, broader mobile polish and chat consolidation remain open.
Memory relevance, skills and proposal work remain paused.

<!-- mobile-navigation-accepted-2026-10-11 -->

## October 11, Phoenix — Mobile navigation accepted

Mobile navigation now shows Chat, My Day, Gallery and More.
More contains Memories, Companion and Settings, with the current destination
indicated. Mobile labels and touch targets are larger.

Brett reports all Galaxy S22 checks passed on both accounts:
primary navigation, all More destinations, selected state, close button,
outside-tap and Android Back dismissal, keyboard hide/restore behavior,
and unsent chat draft preservation when switching screens.

Host TypeScript and all 47 Node tests passed.
Android release build and update installation succeeded. Public frontend
settings were verified against the previous and rebuilt APK.
Desktop browser and iOS acceptance were not performed for this increment.

Accepted APK SHA256:
ec5bd6eb23d43bb5b87362ea671427dd832da677248676118beba5f0a46c53d7

Previous working APK and navigation source:
/home/brett/lumen-android-builds/before-mobile-nav.8efx5wqu

No backend changes, migration or web deployment.
Local Supabase configuration and existing backups remain outside the commit.
Further mobile polish, chat consolidation and iOS acceptance/push remain open.
Memory relevance, skills and proposal work remain paused.

<!-- chat-collections-accepted-2026-10-11 -->

## October 11, Phoenix — Chat collections accepted

Collections organize chats per companion. Users can create, rename and delete
collections, move chats between collections or Unfiled, and filter history
alongside name search and archive status. Collection names and assignments
are included in the existing owner-private, bounded chat cache.

Brett reports all requested Galaxy S22 acceptance checks passed on both
accounts: creation, blank/duplicate rejection, assignment and removal,
collection/search/archive filtering, rename/reopen persistence, deletion
cancellation and confirmation preserving chats/messages/drafts, cached offline
browsing and reconnection, and account isolation.

Host TypeScript and all 47 existing Node tests passed. Dedicated PGlite SQL
checks passed for ownership, companion scope, name validation, rename,
collection deletion preserving chats, and anonymous denial.
These are synthetic SQL checks; exhaustive live database security testing
and multi-device reconciliation acceptance are not established.

Migration 20261011230500_chat_collections applied locally.
Live inspection confirmed RLS and the companion-scoped composite foreign key
with ON DELETE SET NULL (collection_id). Existing chats were initially Unfiled.
Database backup:
/home/brett/lumen-db-backups/chat-collections.Yso4T4

Android release build and ADB update installation succeeded.
Public frontend settings verified against previous and rebuilt APK.
Accepted APK SHA256:
8678e74cc0eb0f918d00d1e4463eab60cb75b97bf89a719f1eba77f3eee63291
Previous APK/source backup:
/home/brett/lumen-android-builds/before-collections.88djfagi

Collections supply organization, not cross-chat model context.
Next: select source chats, generate an editable handoff, review it, and start
a fresh chat with source links. Original transcripts remain available.
Reviewed handoffs and transcript consolidation are not implemented yet.

No backend code change or web deployment. Desktop and iOS acceptance pending.
Local Supabase configuration and existing backups remain outside this commit.
Memory relevance, skills and proposal work remain paused.

<!-- project-actions-handoffs-checkpoint-2026-10-11 -->

## October 11, Phoenix — Project actions accepted; reviewed handoffs pending acceptance

This checkpoint supersedes earlier statements that reviewed handoffs are
not implemented. The implementation is now present; live handoff acceptance
remains pending.

### My Day project actions

Named project creation accepts “create project called Copper Garden”.
Project-step capture accepts natural wording without required punctuation:
“Add tasks to project Copper Garden identify weed types and gather supplies”.

The backend resolves one matching open project within the companion scope.
The selected conversation model chooses only exact text spans from the
requested step wording. Validation checks coverage and order before a
conditional checklist update. Existing completed steps are preserved,
identical step text is deduplicated, and concurrent checklist changes cause
a refusal rather than an overwrite. Invalid extraction receives one bounded
retry; failures do not produce a successful save receipt.

Brett verified in the browser: Copper Garden creation, both requested steps
visible in My Day, repeated capture without duplicates, reopening persistence,
and the corrected Archive project label and explanation.

The previous Undo label archived the entire project. The card now accurately
labels that operation Archive plus the item kind. Restore retains its steps.
Undo of only the latest added steps is NOT implemented.
Chat cards display saved snapshots; My Day supplies the current editable item.

A narrow follow-up handler for “add those two tasks” is implemented and
synthetically tested. It requires an immediately preceding numbered proposal,
the project name, and a recent backend project receipt. Broader conversational
follow-up acceptance and general natural My Day action routing remain open.

The ordinary-reply save-claim guard now covers additional project/task claims.
It remains a wording heuristic, not proof that every unsupported claim is caught.

### Continue together

Users can select up to five source chats, generate a bounded draft, edit and
review it, then create a fresh conversation with original-chat links.
The reviewed summary is stored on the new conversation and supplied as
historical reference context in subsequent model turns. Original transcripts
are preserved; generating a draft performs no database write.

Source reads use the caller's account scope. The creation RPC runs with
invoker security, verifies companion/source scope, and uses a request UUID
for atomic creation and idempotent retries.
Summaries use bounded recent text; earlier history and attachment contents
may be omitted. Live summary quality, source-link behavior, model use of
reviewed context, and cross-account acceptance remain pending.

Migration 20261011234500_reviewed_chat_handoffs.sql applied locally.
Live inspection confirmed authenticated execution allowed and anonymous
execution denied. Dedicated PGlite checks passed for source scope, ownership,
validation, retry behavior, atomic failure and source preservation.
Database backup:
/home/brett/lumen-db-backups/reviewed-handoffs.nLBTVu

### Validation and deployment

Latest complete backend suite: 484 tests passed.
Latest TypeScript check passed. Existing 47 Node tests passed earlier in
the handoff implementation; they do not establish live handoff acceptance.

The API was restarted during project-action verification.
The web export was rebuilt with explicit public frontend settings, checked
for those settings and the card wording, and deployed with its prior dist
preserved outside Git. Brett confirmed browser acceptance after refresh.
The export includes the handoff UI; exporting it is not handoff acceptance.

Android installation/acceptance of the current handoff UI and Archive label
is not established. Last verified accepted APK remains the collections build:
8678e74cc0eb0f918d00d1e4463eab60cb75b97bf89a719f1eba77f3eee63291

Next: finish reviewed-handoff browser acceptance; rebuild the Android preview
with verified public settings; verify both accounts, source links and reopen
behavior. Step-level Undo and broader conversational My Day actions remain open.
iOS acceptance/push, further mobile polish and transcript consolidation remain open.
Memory relevance, skills and proposal feature work remain paused.

Local Supabase configuration, environment values, build artifacts and existing
backups are excluded from this checkpoint.
