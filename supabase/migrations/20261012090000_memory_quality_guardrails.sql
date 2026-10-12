-- Guard reviewed natural-memory proposals against high-confidence subject/wording contradictions.
CREATE OR REPLACE FUNCTION public.memory_suggestion_subject_issue(
  p_content text,
  p_subject text,
  p_type text,
  p_companion uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  t text := lower(btrim(coalesce(p_content,'')));
  n text;
  user_prefix boolean;
  companion_prefix boolean;
  shared_prefix boolean;
BEGIN
  SELECT lower(btrim(name)) INTO n
  FROM public.companions
  WHERE id=p_companion;

  IF n IS NULL OR t='' THEN
    RETURN 'invalid';
  END IF;

  user_prefix :=
       t='i'
    OR t LIKE 'i %'
    OR t LIKE 'i''m %'
    OR t LIKE 'i’m %'
    OR t LIKE 'my %'
    OR t LIKE 'the user %'
    OR t LIKE 'the user''s %'
    OR t LIKE 'the user’s %';

  companion_prefix :=
       t LIKE 'the companion %'
    OR t LIKE 'the companion''s %'
    OR t LIKE 'the companion’s %'
    OR t LIKE n || ' %'
    OR t LIKE n || '''s %'
    OR t LIKE n || '’s %';

  shared_prefix :=
       t='we'
    OR t LIKE 'we %'
    OR t='our'
    OR t LIKE 'our %'
    OR t LIKE 'the user and ' || n || '%'
    OR t LIKE n || ' and the user%';

  IF shared_prefix THEN
    IF p_subject <> 'shared' THEN RETURN 'shared'; END IF;
    RETURN NULL;
  END IF;

  IF p_subject='companion' AND user_prefix THEN
    RETURN 'user';
  END IF;

  IF p_subject='user' AND companion_prefix THEN
    RETURN 'companion';
  END IF;

  IF p_subject='unknown' AND user_prefix THEN
    RETURN 'user';
  END IF;

  IF p_subject='unknown' AND companion_prefix THEN
    RETURN 'companion';
  END IF;

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.memory_suggestion_subject_issue(text,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_memory_suggestion(
  p_id uuid,
  p_action text,
  p_content text DEFAULT NULL,
  p_subject text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  s public.memory_suggestions;
  src public.messages;
  mid uuid;
  active boolean;
  fact text;
  who text;
  issue text;
BEGIN
 SELECT ms.* INTO s FROM public.memory_suggestions ms JOIN public.companions c ON c.id=ms.companion_id
 WHERE ms.id=p_id AND c.owner_user_id=auth.uid() FOR UPDATE OF ms;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Suggestion not available'; END IF;
 IF p_action NOT IN ('approve','dismiss') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid review action'; END IF;
 IF s.status <> 'pending' THEN RETURN s.status; END IF;
 IF p_action='dismiss' THEN
  UPDATE public.memory_suggestions SET status='dismissed',reviewed_at=now() WHERE id=s.id;
  RETURN 'dismissed';
 END IF;
 fact:=btrim(coalesce(p_content,s.content)); who:=coalesce(p_subject,s.subject);
 IF length(fact) NOT BETWEEN 1 AND 500 OR who NOT IN ('user','companion','shared','unknown') THEN RAISE EXCEPTION 'Invalid memory'; END IF;

 issue:=public.memory_suggestion_subject_issue(fact,who,s.type,s.companion_id);
 IF issue IS NOT NULL THEN
   RAISE EXCEPTION 'Memory wording and subject disagree';
 END IF;

 SELECT * INTO src FROM public.messages WHERE id=s.source_message_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.companion_id::text||lower(fact)||who,0));
 SELECT id,is_active INTO mid,active FROM public.memories WHERE companion_id=s.companion_id
  AND lower(btrim(content))=lower(fact) AND subject=who ORDER BY created_at LIMIT 1;
 IF mid IS NOT NULL AND NOT active THEN
  UPDATE public.memory_suggestions SET status='deleted',reviewed_at=now() WHERE id=s.id;
  RETURN 'deleted';
 END IF;
 IF mid IS NULL THEN
  INSERT INTO public.memories(companion_id,conversation_id,type,content,subject,importance,confidence,source,tags)
  VALUES(s.companion_id,src.conversation_id,s.type,fact,who,0.7,1.0,'user_approved_observation',ARRAY['reviewed',s.id::text]) RETURNING id INTO mid;
 END IF;
 UPDATE public.memory_suggestions SET status='approved',memory_id=mid,reviewed_at=now() WHERE id=s.id;
 RETURN 'approved';
END $$;

REVOKE ALL ON FUNCTION public.review_memory_suggestion(uuid,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_memory_suggestion(uuid,text,text,text)
  TO authenticated;

NOTIFY pgrst,'reload schema';
