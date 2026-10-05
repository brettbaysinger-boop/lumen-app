-- Per-companion selection inherits existing owner-only companions RLS.
ALTER TABLE public.companions ADD COLUMN conversation_model text
 CHECK (conversation_model IS NULL OR length(btrim(conversation_model)) BETWEEN 1 AND 200);
