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
checks. This increment awaits actual-device testing. See `../everyday-capture.md`.
