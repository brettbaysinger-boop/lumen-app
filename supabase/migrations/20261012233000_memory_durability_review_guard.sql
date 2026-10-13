-- Phase 1b: reviewed-observation durability must be enforced in PostgreSQL.
-- No existing memories or suggestions are rewritten. The authenticated owner
-- may deliberately override a warning; the decision is separately auditable.
-- Legacy four-argument review and automatic save remain callable but cannot
-- silently approve a questionable source statement.

CREATE TABLE public.memory_durability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL UNIQUE REFERENCES public.memory_suggestions(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'form_of_address','connection_check','temporary_state','greeting',
    'immediate_feedback','one_time_request','question','stored_wording_is_request'
  )),
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  approved_subject text NOT NULL CHECK (approved_subject IN ('user','companion','shared','unknown')),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX memory_durability_overrides_companion_time
  ON public.memory_durability_overrides(companion_id,approved_at DESC);
ALTER TABLE public.memory_durability_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY durability_overrides_owner_read ON public.memory_durability_overrides
  FOR SELECT TO authenticated
  USING (
    actor_user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.companions c
      WHERE c.id = companion_id AND c.owner_user_id = (SELECT auth.uid())
    )
  );
REVOKE ALL ON public.memory_durability_overrides
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.memory_durability_overrides TO authenticated;

-- Reasons only. The source text and approved memory are kept in their
-- existing owner-scoped tables, not copied into the audit log.
CREATE FUNCTION public.memory_suggestion_durability_issue(
  p_source_statement text,
  p_evidence text,
  p_content text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $function$
DECLARE
  statement text := lower(regexp_replace(btrim(coalesce(p_source_statement,'')), '[[:space:]]+', ' ', 'g'));
  wording text := lower(regexp_replace(btrim(coalesce(p_content,'')), '[[:space:]]+', ' ', 'g'));
BEGIN
  IF statement = '' OR btrim(coalesce(p_evidence,'')) = '' OR wording = '' THEN
    RETURN 'stored_wording_is_request';
  END IF;

  -- A request explicitly to remember is owned by the distinct intentional
  -- saving flow, not by heuristic automatic observation.
  IF statement ~ '^(please[[:space:]]+)?remember([[:space:][:punct:]]|$)' THEN
    RETURN NULL;
  END IF;

  IF statement ~ '(will|can|could|would) you[[:space:]]+(please[[:space:]]+)?call me([[:space:][:punct:]]|$)'
     OR statement ~ '^(please[[:space:]]+)?call me([[:space:][:punct:]]|$)'
     OR statement ~ '^from now on[,[:space:]]+call me([[:space:][:punct:]]|$)' THEN
    RETURN 'form_of_address';
  END IF;

  IF statement ~ '(can|could|do) you[[:space:]]+(hear|see) me([[:space:][:punct:]]|$)' THEN
    RETURN 'connection_check';
  END IF;

  IF statement ~ '^(i''m|i’m|im|i am)[[:space:]]+(hungry|tired|bored|sleepy|horny|horney|frustrated|exhausted)([[:space:][:punct:]]|$)' THEN
    RETURN 'temporary_state';
  END IF;

  IF statement ~ '^(hi|hello|hey|good morning|good afternoon|good evening|good night)([[:space:][:punct:]]|$)' THEN
    -- These are deliberately review-only at the DB boundary, not assertions
    -- that the greeting cannot contain anything valuable.
    RETURN 'greeting';
  END IF;

  IF statement ~ '^(still|try again|not quite|nope|nah|wtf|that''s wrong|that is wrong)([[:space:][:punct:]]|$)' THEN
    RETURN 'immediate_feedback';
  END IF;

  IF statement ~ '^((dammit|please|hey|okay)[[:space:],!.]+)*(tell|show|give|send|play|read|write|draw|generate|translate|summarize|explain|repeat|say)[[:space:]]+'
     OR statement ~ '^((please|hey)[[:space:],!.]+)*(can|could|would|will) you[[:space:]]+(tell|show|give|send|play|read|write|draw|generate|translate|summarize|explain)([[:space:][:punct:]]|$)' THEN
    RETURN 'one_time_request';
  END IF;

  -- Using the ORIGINAL statement prevents the model from laundering a
  -- question as a durable preference with different saved wording.
  IF position('?' IN statement) > 0
     OR statement ~ '^(what|when|where|who|why|how|which|did|do|does|are|is|can|could|will|would|should|have|has)([[:space:][:punct:]]|$)' THEN
    RETURN 'question';
  END IF;

  IF position('?' IN wording) > 0
     OR wording ~ '^(tell|show|give|send|play|read|write|draw|generate|translate|summarize|explain|repeat|say|good morning|good evening|hello|hi)([[:space:][:punct:]]|$)' THEN
    RETURN 'stored_wording_is_request';
  END IF;

  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.memory_suggestion_durability_issue(text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

-- New explicit-confirmation API. No default arguments prevents ambiguity
-- with the existing four-parameter PostgREST function.
CREATE FUNCTION public.review_memory_suggestion_v2(
  p_id uuid,
  p_action text,
  p_content text,
  p_subject text,
  p_confirm_durability boolean
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  s public.memory_suggestions;
  src public.messages;
  mid uuid;
  active boolean;
  fact text;
  who text;
  issue text;
  durability_issue text;
BEGIN
  SELECT ms.* INTO s
  FROM public.memory_suggestions ms
  JOIN public.companions c ON c.id=ms.companion_id
  WHERE ms.id=p_id AND c.owner_user_id=auth.uid()
  FOR UPDATE OF ms;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion not available' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('approve','dismiss') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Invalid review action';
  END IF;
  IF s.status <> 'pending' THEN RETURN s.status; END IF;
  IF p_action='dismiss' THEN
    UPDATE public.memory_suggestions
       SET status='dismissed',reviewed_at=now()
     WHERE id=s.id;
    RETURN 'dismissed';
  END IF;

  fact:=btrim(coalesce(p_content,s.content));
  who:=coalesce(p_subject,s.subject);
  IF length(fact) NOT BETWEEN 1 AND 500
     OR who NOT IN ('user','companion','shared','unknown') THEN
    RAISE EXCEPTION 'Invalid memory';
  END IF;
  issue:=public.memory_suggestion_subject_issue(fact,who,s.type,s.companion_id);
  IF issue IS NOT NULL THEN
    RAISE EXCEPTION 'Memory wording and subject disagree';
  END IF;

  SELECT * INTO src FROM public.messages
    WHERE id=s.source_message_id
      AND companion_id=s.companion_id AND role='user';
  IF src.id IS NULL OR s.evidence IS NULL
     OR length(btrim(s.evidence))=0 OR strpos(src.content,s.evidence)=0 THEN
    RAISE EXCEPTION 'Source evidence unavailable';
  END IF;

  durability_issue:=public.memory_suggestion_durability_issue(
    src.content,s.evidence,fact
  );
  IF durability_issue IS NOT NULL AND p_confirm_durability IS DISTINCT FROM TRUE THEN
    -- No status transition, memory creation, or audit write. Auto-save and
    -- older clients cannot approve without the intentional owner override.
    RETURN 'durability_confirmation_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(s.companion_id::text||lower(fact)||who,0)
  );
  SELECT id,is_active INTO mid,active FROM public.memories
  WHERE companion_id=s.companion_id
    AND lower(btrim(content))=lower(fact) AND subject=who
  ORDER BY created_at LIMIT 1;
  IF mid IS NOT NULL AND NOT active THEN
    UPDATE public.memory_suggestions
       SET status='deleted',reviewed_at=now() WHERE id=s.id;
    RETURN 'deleted';
  END IF;
  IF mid IS NULL THEN
    INSERT INTO public.memories(
      companion_id,conversation_id,type,content,subject,importance,confidence,source,tags
    ) VALUES (
      s.companion_id,src.conversation_id,s.type,fact,who,0.7,1.0,
      'user_approved_observation',ARRAY['reviewed',s.id::text]
    ) RETURNING id INTO mid;
  END IF;
  UPDATE public.memory_suggestions
     SET status='approved',memory_id=mid,reviewed_at=now()
   WHERE id=s.id;

  IF durability_issue IS NOT NULL THEN
    INSERT INTO public.memory_durability_overrides(
      companion_id,suggestion_id,source_message_id,memory_id,
      actor_user_id,reason_code,content_digest,approved_subject
    ) VALUES (
      s.companion_id,s.id,s.source_message_id,mid,auth.uid(),durability_issue,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(fact,who,s.evidence)::text,'UTF8'
      )),'hex'),who
    );
  END IF;
  RETURN 'approved';
END;
$function$;
REVOKE ALL ON FUNCTION public.review_memory_suggestion_v2(uuid,text,text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_memory_suggestion_v2(uuid,text,text,text,boolean)
  TO authenticated;

-- Replace the original function with a safe, compatible adapter.
-- The existing auto_save_memory_suggestion calls this exact four-arg RPC.
CREATE OR REPLACE FUNCTION public.review_memory_suggestion(
  p_id uuid,
  p_action text,
  p_content text DEFAULT NULL,
  p_subject text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  RETURN public.review_memory_suggestion_v2(
    p_id,p_action,p_content,p_subject,FALSE
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.review_memory_suggestion(uuid,text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_memory_suggestion(uuid,text,text,text)
  TO authenticated;

NOTIFY pgrst,'reload schema';
