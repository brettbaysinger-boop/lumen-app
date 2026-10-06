CREATE TABLE public.my_day_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task','reminder','note','list','project','goal')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 12000),
  checklist jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checklist)='array' AND jsonb_array_length(checklist)<=100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','archived')),
  due_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'reminder' OR due_at IS NOT NULL),
  UNIQUE(companion_id,request_key)
);
CREATE INDEX my_day_companion_due ON public.my_day_items(companion_id,status,due_at);
ALTER TABLE public.my_day_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.my_day_items TO authenticated,service_role;
CREATE POLICY my_day_owner ON public.my_day_items TO authenticated
  USING (EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
CREATE FUNCTION public.check_my_day_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.source_conversation_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.conversations c WHERE c.id=NEW.source_conversation_id AND c.companion_id=NEW.companion_id
  ) THEN RAISE EXCEPTION 'Conversation does not belong to this companion'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone)
    THEN RAISE EXCEPTION 'Invalid timezone'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER my_day_scope BEFORE INSERT OR UPDATE ON public.my_day_items
  FOR EACH ROW EXECUTE FUNCTION public.check_my_day_scope();

CREATE TABLE public.my_day_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.my_day_items(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,due_at)
);
ALTER TABLE public.my_day_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.my_day_alerts TO authenticated,service_role;
CREATE POLICY my_day_alert_owner ON public.my_day_alerts TO authenticated
  USING (EXISTS(SELECT 1 FROM public.my_day_items i WHERE i.id=item_id))
  WITH CHECK (EXISTS(SELECT 1 FROM public.my_day_items i WHERE i.id=item_id));

-- Invoker rights: due reminders are persisted once, scoped to the signed-in user.
CREATE FUNCTION public.my_day_due(p_companion_id uuid) RETURNS TABLE(
  id uuid,item_id uuid,title text,due_at timestamptz,seen_at timestamptz
) LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c WHERE c.id=p_companion_id AND c.owner_user_id=auth.uid())
    THEN RAISE EXCEPTION 'Companion not found'; END IF;
  INSERT INTO public.my_day_alerts(item_id,due_at)
    SELECT i.id,i.due_at FROM public.my_day_items i WHERE i.companion_id=p_companion_id
      AND i.kind='reminder' AND i.status='open' AND i.due_at<=now()
    ON CONFLICT ON CONSTRAINT my_day_alerts_item_id_due_at_key DO NOTHING;
  RETURN QUERY SELECT a.id,i.id,i.title,a.due_at,a.seen_at FROM public.my_day_alerts a
    JOIN public.my_day_items i ON i.id=a.item_id WHERE i.companion_id=p_companion_id
      AND i.status='open' AND i.due_at=a.due_at AND a.seen_at IS NULL
    ORDER BY a.due_at LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.my_day_due(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_day_due(uuid) TO authenticated;

CREATE INDEX memories_text_search ON public.memories USING gin(to_tsvector('english',content));
CREATE INDEX messages_text_search ON public.messages USING gin(to_tsvector('english',content));
CREATE FUNCTION public.search_my_information(p_companion_id uuid,p_query text)
RETURNS TABLE(id uuid,kind text,content text,conversation_id uuid,created_at timestamptz,rank real)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH q AS (SELECT websearch_to_tsquery('english',left(trim(p_query),200)) AS terms),
 matches AS (
  SELECT m.id,'memory'::text AS kind,'[subject='||m.subject||'] '||m.content AS content,m.conversation_id,m.created_at,
    ts_rank(to_tsvector('english',m.content),q.terms) AS rank
  FROM public.memories m,q WHERE m.companion_id=p_companion_id AND m.is_active AND to_tsvector('english',m.content)@@q.terms
  UNION ALL
  SELECT m.id,'message'::text,m.role||': '||m.content,m.conversation_id,m.created_at,
    ts_rank(to_tsvector('english',m.content),q.terms)
  FROM public.messages m,q WHERE m.companion_id=p_companion_id AND to_tsvector('english',m.content)@@q.terms
  UNION ALL
  SELECT i.id,i.kind,i.title||E'\n'||i.body,i.source_conversation_id,i.created_at,
    ts_rank(to_tsvector('english',i.title||' '||i.body),q.terms)
  FROM public.my_day_items i,q WHERE i.companion_id=p_companion_id AND i.status<>'archived' AND to_tsvector('english',i.title||' '||i.body)@@q.terms
 ) SELECT id,kind,left(content,1500),conversation_id,created_at,rank FROM matches
 WHERE length(trim(p_query))>=2 ORDER BY rank DESC,created_at DESC LIMIT 30;
$$;
REVOKE ALL ON FUNCTION public.search_my_information(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_my_information(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
