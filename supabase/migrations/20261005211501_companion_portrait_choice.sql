/*
# Add changeable companion portraits

1. Modified Tables
- `public.companions`
- Adds `portrait_url`, the selected portrait image URL for each companion.
- Existing companions keep the default portrait automatically.

2. Security
- The existing owner-scoped companion RLS policy remains responsible for reads and updates.
- No new table or broader access is introduced.

3. Important Notes
- Portrait choices are application-controlled local assets, not user-supplied remote URLs.
- This preserves each companion's selected portrait across reloads and devices.
*/

ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS portrait_url text NOT NULL DEFAULT '/lumen-portrait.webp';

NOTIFY pgrst, 'reload schema';