-- Recreate the accounts_and_memory_subjects migration that was never applied.
-- This is the critical migration that adds owner_user_id, profiles, ensure_my_companion,
-- and all account-scoped RLS policies. Without it, the app cannot progress past login.

-- Profiles table (if not exists)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT 'User' CHECK (length(display_name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
DROP POLICY IF EXISTS profiles_owner ON public.profiles;
CREATE POLICY profiles_owner ON public.profiles TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Add owner_user_id to companions (if not exists)
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS companions_owner ON public.companions(owner_user_id);

-- Add subject columns to memories (if not exist)
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'unknown' CHECK (subject IN ('user','companion','shared','unknown')),
  ADD COLUMN IF NOT EXISTS subject_user_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reported_by_user_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- Update existing memories with subject guesses
UPDATE public.memories m SET subject = CASE
  WHEN m.content ~* '^\s*(my\s|I\s|I''m\s)' THEN 'user'
  WHEN EXISTS (SELECT 1 FROM public.companions c WHERE c.id=m.companion_id
    AND left(lower(trim(m.content)), length(c.name)+2) = lower(c.name)||'''s') THEN 'companion'
  ELSE 'unknown' END
WHERE m.subject = 'unknown' OR m.subject IS NULL;

-- Drop old policies and recreate with owner-based scoping
DO $$
DECLARE p record; t text;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('companions','conversations','messages','memories','companion_state','self_model','reflections','model_runs')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename); END LOOP;

  DROP POLICY IF EXISTS companions_owner ON public.companions;
  CREATE POLICY companions_owner ON public.companions TO authenticated
    USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

  FOREACH t IN ARRAY ARRAY['conversations','messages','memories','companion_state','self_model','reflections','model_runs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS account_owner ON public.%I', t);
    EXECUTE format('CREATE POLICY account_owner ON public.%I TO authenticated
      USING (EXISTS (SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))', t);
  END LOOP;
END $$;

-- Conversation scope check function
CREATE OR REPLACE FUNCTION public.check_conversation_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id=NEW.conversation_id AND c.companion_id=NEW.companion_id
  ) THEN RAISE EXCEPTION 'Conversation does not belong to this companion'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['messages','memories','reflections','model_runs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS conversation_scope ON public.%I', t);
    EXECUTE format('CREATE TRIGGER conversation_scope BEFORE INSERT OR UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.check_conversation_scope()', t);
  END LOOP;
END $$;

-- Memory subject check function
CREATE OR REPLACE FUNCTION public.check_memory_subject() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
  SELECT owner_user_id INTO owner_id FROM public.companions WHERE id=NEW.companion_id;
  IF NEW.subject IN ('user','shared') THEN NEW.subject_user_id := owner_id;
  ELSE NEW.subject_user_id := NULL; END IF;
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP='INSERT' THEN NEW.reported_by_user_id := auth.uid();
    ELSE NEW.reported_by_user_id := OLD.reported_by_user_id; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memory_subject ON public.memories;
CREATE TRIGGER memory_subject BEFORE INSERT OR UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.check_memory_subject();

-- The critical ensure_my_companion function
CREATE OR REPLACE FUNCTION public.ensure_my_companion(display_name text DEFAULT 'User') RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE user_id uuid := auth.uid(); companion_id uuid;
BEGIN
  IF user_id IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(user_id::text, 0));
  INSERT INTO public.profiles(id,display_name) VALUES (user_id,coalesce(nullif(trim(display_name),''),'User'))
    ON CONFLICT (id) DO NOTHING;
  SELECT id INTO companion_id FROM public.companions WHERE owner_user_id=user_id ORDER BY created_at,id LIMIT 1;
  IF companion_id IS NULL THEN
    INSERT INTO public.companions(owner_user_id,name) VALUES (user_id,'Lumen') RETURNING id INTO companion_id;
    INSERT INTO public.companion_state(companion_id) VALUES (companion_id);
    INSERT INTO public.self_model(companion_id,identity) VALUES
      (companion_id,jsonb_build_object('name','Lumen','description','A personal AI companion'));
  END IF;
  RETURN companion_id;
END $$;
REVOKE ALL ON FUNCTION public.ensure_my_companion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_companion(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
