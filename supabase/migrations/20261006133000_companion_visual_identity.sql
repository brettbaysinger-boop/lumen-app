/*
# Persistent companion visual identity

Adds an optional visual identity description to each companion.

This describes the companion's stable physical appearance for generated
images. It is companion state, not conversational memory.

The existing owner-scoped companions RLS policy controls access.
*/

ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS visual_identity text;

COMMENT ON COLUMN public.companions.visual_identity IS
  'Persistent physical appearance description used when generating images of the companion.';

NOTIFY pgrst, 'reload schema';
