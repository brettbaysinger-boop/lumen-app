-- Lumen memory-store guard (RMC activation). NOT a migration: applied only by
-- scripts/lumen-rmc.sh activate, with the owner's confirmation.
--
-- When RMC is the active memory store, refuse every INSERT, UPDATE or DELETE
-- on the Supabase memory tables, whoever the caller is: older app builds
-- that write directly, a user's own Supabase session, and the security-
-- definer RPCs (review, correction, undo, observation) alike. Reads still
-- work, so nothing existing is hidden or lost. With backend = 'supabase'
-- (the default) the trigger does nothing and Lumen behaves exactly as before.
--
-- Idempotent: safe to apply more than once. It never changes memory rows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lumen_memory_store (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  backend text NOT NULL DEFAULT 'supabase' CHECK (backend IN ('supabase', 'rmc')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.lumen_memory_store (singleton) VALUES (true) ON CONFLICT DO NOTHING;
-- Clients can neither read nor change it; only the owner's psql session can.
ALTER TABLE public.lumen_memory_store ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lumen_memory_store FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.lumen_memory_store FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.lumen_memory_store FROM authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lumen_refuse_memory_write_when_rmc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Fail closed: only an explicit 'supabase' row allows writes. Clients
  -- cannot change or delete the row.
  IF COALESCE((SELECT backend FROM public.lumen_memory_store WHERE singleton), 'missing') <> 'supabase' THEN
    RAISE EXCEPTION 'Lumen memories are managed by the Raialume Memory Core; nothing was changed.'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.lumen_refuse_memory_write_when_rmc() FROM PUBLIC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['memories', 'memory_suggestions', 'memory_revisions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS lumen_memory_store_guard ON public.%I', t);
      -- 'lumen_' sorts before the existing memory_* triggers, so it fires first.
      EXECUTE format('CREATE TRIGGER lumen_memory_store_guard BEFORE INSERT OR UPDATE OR DELETE '
                     'ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lumen_refuse_memory_write_when_rmc()', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
