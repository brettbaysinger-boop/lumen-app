-- Proposals stay outside long-term memory until the account owner approves.
CREATE TABLE public.memory_observations (
 source_message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
 companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memory_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
 source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 500),
 evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 1 AND 1000),
 subject text NOT NULL CHECK(subject IN ('user','companion','shared','unknown')),
 type text NOT NULL CHECK(type IN ('semantic','preference','relationship','episodic')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','dismissed','deleted')),
 memory_id uuid REFERENCES public.memories(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 UNIQUE(source_message_id, content, subject)
);
CREATE INDEX memory_suggestions_pending ON public.memory_suggestions(companion_id,status,created_at);
ALTER TABLE public.memory_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY observations_owner ON public.memory_observations FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
CREATE POLICY suggestions_owner ON public.memory_suggestions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
REVOKE ALL ON public.memory_suggestions,public.memory_observations FROM anon,authenticated;
GRANT SELECT ON public.memory_suggestions TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.memory_observations TO authenticated;

CREATE FUNCTION public.check_observation_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.id=NEW.source_message_id AND m.companion_id=NEW.companion_id AND m.role='user') THEN
  RAISE EXCEPTION 'Observation source must be a user message for this companion';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observation_source BEFORE INSERT OR UPDATE ON public.memory_observations
 FOR EACH ROW EXECUTE FUNCTION public.check_observation_source();

CREATE FUNCTION public.claim_memory_observation(p_message uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.memory_observations SET status='processing',updated_at=now()
 WHERE source_message_id=p_message AND
 (status IN ('pending','failed') OR (status='processing' AND updated_at < now()-interval '2 minutes'));
 RETURN FOUND;
END $$;

CREATE FUNCTION public.propose_memory(p_message uuid,p_content text,p_evidence text,p_subject text,p_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE src public.messages; proposal uuid;
BEGIN
 SELECT m.* INTO src FROM public.messages m JOIN public.companions c ON c.id=m.companion_id
 WHERE m.id=p_message AND m.role='user' AND c.owner_user_id=auth.uid();
 IF src.id IS NULL THEN RAISE EXCEPTION 'Source message not available'; END IF;
 IF length(btrim(p_evidence))=0 OR strpos(src.content,p_evidence)=0 THEN RAISE EXCEPTION 'Evidence must quote the source message'; END IF;
 -- Exact dismissed suggestions and deleted memories remain suppressed. Semantic duplicates
 -- can still occur and are visible for review rather than being silently merged.
 IF EXISTS(SELECT 1 FROM public.memory_suggestions WHERE companion_id=src.companion_id
   AND lower(btrim(content))=lower(btrim(p_content)) AND subject=p_subject) OR
 EXISTS(SELECT 1 FROM public.memories WHERE companion_id=src.companion_id
   AND lower(btrim(content))=lower(btrim(p_content)) AND subject=p_subject) THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(src.companion_id::text||lower(btrim(p_content))||p_subject,0));
 IF EXISTS(SELECT 1 FROM public.memory_suggestions WHERE companion_id=src.companion_id
   AND lower(btrim(content))=lower(btrim(p_content)) AND subject=p_subject) THEN RETURN NULL; END IF;
 INSERT INTO public.memory_suggestions(companion_id,source_message_id,content,evidence,subject,type)
 VALUES(src.companion_id,p_message,btrim(p_content),p_evidence,p_subject,p_type) RETURNING id INTO proposal;
 RETURN proposal;
END $$;

CREATE FUNCTION public.review_memory_suggestion(p_id uuid,p_action text,p_content text DEFAULT NULL,p_subject text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.memory_suggestions; src public.messages; mid uuid; active boolean; fact text; who text;
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
REVOKE ALL ON FUNCTION public.claim_memory_observation(uuid),public.propose_memory(uuid,text,text,text,text),public.review_memory_suggestion(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_memory_observation(uuid),public.propose_memory(uuid,text,text,text,text),public.review_memory_suggestion(uuid,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
