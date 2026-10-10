> **Canonical project checkpoint:** [Project Status](../PROJECT-STATUS.md).

# Validation

## October 7, 2026 checkpoint

- 174 backend tests pass, including note-specific schema, citation retry, draft
  persistence, no automatic item/memory writes, authenticated saves and reminders.
- TypeScript and clean Expo web export pass.
- Actual SQL migrations in PostgreSQL/PGlite verify private sources, cross-account
  and cross-companion rejection, duplicate protection, and source retention.
- Production-export Chromium at 390 pixels verifies draft editing, failed save
  retry, save/Undo/Restore/reload, notes, reminder timezone conversion, My Day
  source-page inspection and checklist changes. Existing attachments still pass.
- User-reported host checks: checklist generation, note review/edit/save to My Day,
  and a saved follow-up reminder. A short three-detail note request worked after
  the longer request failed schema validation. The updated shortcut itself awaits
  host deployment verification.
- Mobile HTTPS login, microphone/camera, photo and PDF understanding were reported
  working previously; this increment does not claim a fresh full device retest.

## Historical first assistant increment

- TypeScript check and Expo web export passed.
- 88 backend tests passed. New checks cover explicit vs incidental intent,
  timezone conversion, relative reminders, invalid dates, DST ambiguity,
  owner checks, duplicate create retries, scoped search/dismissal, and chat cards
  acknowledging successful writes without triggering a model or memory save.
- PostgreSQL WASM executed the migration with authenticated roles and RLS.
  Ownership, cross-companion source rejection, keyword search, due inbox,
  duplicate delivery prevention, persistent dismissal, rescheduling, completion,
  and timezone validation passed.
- Chromium exercised the exported Expo app with mocked Auth/Supabase/API data.
  Six-tab navigation, reminder dismissal, checklist creation/progress, local time
  conversion, completion, source navigation, resume drafts, saved chat cards,
  desktop/mobile layouts, and no page runtime errors passed.
- Screenshots use sample data. The export uses placeholder service addresses;
  rebuild with the user's existing `.env` before local deployment.
- Live reminder delivery, actual Supabase migrations, Ollama chat, Helios, native
  hardware, and closed-app push have not been exercised on the user's machines.

## Goals & practice checkpoint

182 backend tests pass. Goal checks cover scopes, profiles, explicit finish,
idempotency, bounded context and suppressed automatic observations. Actual SQL
migrations verify start/resume atomicity, immutable preference snapshots,
completion/new sessions, privacy and deletion. Mobile-sized production-export
checks cover goal setup, linked draft chat, resume, failed finish/retry and saved
progress reload. Host tutoring/voice quality is not established by these tests.

On October 7, the user verified the direct-JSON note fix at `63e3e62`, reported a major speed improvement, and pushed the branch and `lumen-take2-note-json-20261007` tag. The speed gain is user-reported, not a measured benchmark.

## Explicit chat-save checkpoint

192 backend tests pass, including explicit/negative/deferred intent, scoped
transcripts and writes, duplicate saves, literal fallback, uncertain write
failures, receipt metadata, editing completed notes, and memory-promise guards.
Typecheck and clean web export pass. The goals browser test adds completed-note
edits and saved chat receipt/reload/navigation to the prior manual flow.

On October 7, the user verified goal setup, practice, progress saving and continuity at `946b017`. After deploying `1006343`, the user reported that everything was working well, confirming the practice chat-save checkpoint. This is user-reported deployment verification; automated coverage is recorded separately.

## October 8: everyday capture

Explicit chat commands now append to named open lists, save gift ideas and capture
quick notes in My Day. Saved cards expose the captured text and link to editing.
Owner-scoped atomic appends retain retry receipts and reject ambiguous list names.
Local verification: 198 backend tests, typecheck, clean web export and capture SQL
checks. The user reported the corrected capture flow working on October 8 at `6e1260e`. See `../everyday-capture.md`.

Capture host testing found missed greeting, period and smart-quote forms despite
working eggs capture/list read. These inputs now have regression coverage. The
fix also guards generated list/note save claims and replaces unrelated-memory
fallbacks with a no-save reply. Local checks: 200 backend tests, typecheck and
clean web export. The user reported the fix working on October 8 at `6e1260e`; no new migration.

## October 8: help when stuck

Workstream #5 adds editable small-step drafts from explicit chat requests. Saving
creates a My Day project; the card shows one unfinished step with durable
completion and reload continuity. Duplicate completions cannot advance the next
step. No timer, automatic scheduling, or external work is performed.
Local checks: 207 backend tests, typecheck, clean web export, migration/RPC privacy
and persistence checks, and a mobile-sized mocked browser flow. On October 8, the user reported the deployed flow working at `eb7cea4`. See `../getting-unstuck.md`.

## October 8 verified-use checkpoint

The user reported the small-step flow working after deploying `eb7cea4`, following
the requested checks for draft review/save, step completion, reload continuity and
My Day editing. The user also reported daily Lumen use with an active shopping
list and reminders. This records continued practical use, not a measured reliability
rate or verification of closed-app notification delivery. Local automated coverage
remains 207 backend tests plus typecheck, clean web export, SQL and mobile-sized
mocked browser checks. No application changes or new migration in this checkpoint.

## October 10 — Provider visibility

Configured provider routes and persisted foreground request details are implemented
and locally verified (259 backend tests, typecheck, clean web export and mocked
mobile browser checks). Direct-image reply wording is also refined. Deployment and
new-feature user acceptance remain pending. Prior companion-image prose and Gallery
behavior were user-verified at `0cde482`. Routing and Helios remain unchanged.
See [../provider-visibility.md](../provider-visibility.md) for scope, hardware evidence and acceptance checks.

## Live acceptance and subject correction — October 9, Phoenix

Provider visibility at `db21282` is now deployed and user-verified, superseding
the preceding pending-acceptance note. A follow-up fixes companion-name greetings
being mistaken for portrait subjects. The subject fix passed 25 targeted backend
tests; its deployment and live acceptance remain pending. Full evidence and
limits: `docs/provider-acceptance-checkpoint.md` (repository-relative path).

## Conversation performance baseline — October 9, Phoenix

Image-subject correction at `205d6f7` is user-verified. A synthetic streaming
Ollama benchmark now measures visible-answer latency and token throughput without
changing application routing. Three offline parser tests passed; live measurement
is pending. See `docs/conversation-benchmark.md` from the repository root.
