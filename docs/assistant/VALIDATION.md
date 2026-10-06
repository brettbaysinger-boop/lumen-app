# Validation

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
