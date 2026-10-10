-- Versioned, owner-scoped correction receipts. Existing memory IDs remain stable.
ALTER TABLE public.memories ADD COLUMN revision_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.bump_memory_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.revision_version := OLD.revision_version + 1;
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER memory_revision_version BEFORE UPDATE ON public.memories
FOR EACH ROW EXECUTE FUNCTION public.bump_memory_revision();

CREATE TABLE public.memory_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
 memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('correction','change')),
 before_content text NOT NULL,
 after_content text NOT NULL CHECK(length(after_content) BETWEEN 1 AND 500),
 before_source text,
 source_text text NOT NULL CHECK(length(source_text) BETWEEN 1 AND 4000),
 applied_version bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 undone_at timestamptz,
 UNIQUE(companion_id,request_id)
);
ALTER TABLE public.memory_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_revisions_owner ON public.memory_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
REVOKE ALL ON public.memory_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.memory_revisions TO authenticated;

CREATE FUNCTION public.correct_user_memory(p_companion uuid,p_conversation uuid,p_request uuid,
 p_memory uuid,p_version bigint,p_before text,p_after text,p_kind text,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memories; r public.memory_revisions; v bigint;
BEGIN
 -- Lock in the same order as automatic remembering.
 PERFORM 1 FROM public.companions WHERE id=p_companion AND owner_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Companion unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.conversations WHERE id=p_conversation AND companion_id=p_companion)
 THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 SELECT * INTO r FROM public.memory_revisions WHERE companion_id=p_companion AND request_id=p_request;
 IF FOUND THEN
  IF r.memory_id<>p_memory OR r.source_text<>p_source OR r.after_content<>p_after OR
     r.kind<>p_kind OR r.conversation_id IS DISTINCT FROM p_conversation
  THEN RAISE EXCEPTION 'Request conflict'; END IF;
  RETURN to_jsonb(r);
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('correction','change') OR p_after IS NULL OR
    length(btrim(p_after)) NOT BETWEEN 1 AND 500 OR p_source IS NULL OR
    length(p_source) NOT BETWEEN 1 AND 4000 OR p_request IS NULL
 THEN RAISE EXCEPTION 'Invalid correction'; END IF;
 SELECT * INTO m FROM public.memories WHERE id=p_memory AND companion_id=p_companion FOR UPDATE;
 IF m.id IS NULL OR m.subject<>'user' OR m.is_active IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Memory unavailable'; END IF;
 IF p_version IS NULL OR m.revision_version<>p_version OR m.content IS DISTINCT FROM p_before
 THEN RAISE EXCEPTION 'Memory changed; retry with current value'; END IF;
 IF EXISTS(SELECT 1 FROM public.memories x WHERE x.companion_id=p_companion AND x.subject='user'
   AND x.is_active AND x.id<>m.id AND (lower(btrim(x.content))=lower(btrim(m.content)) OR EXISTS(
    SELECT 1 FROM unnest(coalesce(m.tags,'{}')) t WHERE t LIKE 'topic:%' AND t=ANY(x.tags))))
 THEN RAISE EXCEPTION 'Conflicting saved memories'; END IF;
 UPDATE public.memories SET content=btrim(p_after),
  source=CASE WHEN p_kind='change' THEN 'user_changed' ELSE 'user_corrected' END
 WHERE id=m.id RETURNING revision_version INTO v;
 INSERT INTO public.memory_revisions(companion_id,conversation_id,memory_id,request_id,kind,
  before_content,after_content,before_source,source_text,applied_version)
 VALUES(p_companion,p_conversation,m.id,p_request,p_kind,m.content,btrim(p_after),m.source,p_source,v)
 RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.undo_memory_correction(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.memory_revisions; m public.memories; cid uuid;
BEGIN
 SELECT mr.companion_id INTO cid FROM public.memory_revisions mr JOIN public.companions c ON c.id=mr.companion_id
 WHERE mr.id=p_id AND c.owner_user_id=auth.uid();
 IF cid IS NULL THEN RAISE EXCEPTION 'Correction unavailable'; END IF;
 PERFORM 1 FROM public.companions WHERE id=cid AND owner_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Correction unavailable'; END IF;
 SELECT * INTO r FROM public.memory_revisions WHERE id=p_id FOR UPDATE;
 IF r.undone_at IS NOT NULL THEN RETURN to_jsonb(r); END IF;
 SELECT * INTO m FROM public.memories WHERE id=r.memory_id AND companion_id=cid FOR UPDATE;
 IF m.id IS NULL OR m.subject<>'user' OR m.is_active IS DISTINCT FROM true OR
    m.revision_version<>r.applied_version OR m.content IS DISTINCT FROM r.after_content
 THEN RAISE EXCEPTION 'Memory changed since this correction; review its current value'; END IF;
 UPDATE public.memories SET content=r.before_content,source=r.before_source WHERE id=m.id;
 UPDATE public.memory_revisions SET undone_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.correct_user_memory(uuid,uuid,uuid,uuid,bigint,text,text,text,text),
 public.undo_memory_correction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_user_memory(uuid,uuid,uuid,uuid,bigint,text,text,text,text),
 public.undo_memory_correction(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
