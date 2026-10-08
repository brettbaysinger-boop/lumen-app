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
