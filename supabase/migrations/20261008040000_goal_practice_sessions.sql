ALTER TABLE public.my_day_items ADD COLUMN goal_profile jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(goal_profile)='object');
ALTER TABLE public.conversations ADD COLUMN goal_item_id uuid REFERENCES public.my_day_items(id) ON DELETE SET NULL;
CREATE TABLE public.goal_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 item_id uuid NOT NULL REFERENCES public.my_day_items(id) ON DELETE CASCADE,
 companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 profile jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(profile)='object'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
 summary text NOT NULL DEFAULT '' CHECK(length(summary)<=2000),
 practice_notes text NOT NULL DEFAULT '' CHECK(length(practice_notes)<=2000),
 vocabulary text NOT NULL DEFAULT '' CHECK(length(vocabulary)<=2000),
 next_step text NOT NULL DEFAULT '' CHECK(length(next_step)<=300),
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 UNIQUE(companion_id,request_key), CHECK((status='open' AND ended_at IS NULL) OR (status='completed' AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX goal_one_open_session ON public.goal_sessions(item_id) WHERE status='open';
ALTER TABLE public.goal_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.goal_sessions TO authenticated,service_role;
CREATE POLICY goal_session_owner ON public.goal_sessions TO authenticated
 USING(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
CREATE FUNCTION public.check_goal_conversation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.goal_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.my_day_items i WHERE i.id=NEW.goal_item_id AND i.companion_id=NEW.companion_id AND i.kind='goal')
 THEN RAISE EXCEPTION 'Goal does not belong to this companion'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goal_conversation_scope BEFORE INSERT OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.check_goal_conversation();
CREATE FUNCTION public.check_goal_session() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.my_day_items i WHERE i.id=NEW.item_id AND i.companion_id=NEW.companion_id AND i.kind='goal')
 OR NOT EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=NEW.conversation_id AND c.companion_id=NEW.companion_id AND c.goal_item_id=NEW.item_id)
 THEN RAISE EXCEPTION 'Goal session scope mismatch'; END IF;
 IF TG_OP='UPDATE' AND (NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.companion_id IS DISTINCT FROM OLD.companion_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.profile IS DISTINCT FROM OLD.profile)
 THEN RAISE EXCEPTION 'Session identity and practice profile are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goal_session_scope BEFORE INSERT OR UPDATE ON public.goal_sessions FOR EACH ROW EXECUTE FUNCTION public.check_goal_session();
CREATE FUNCTION public.start_goal_session(p_companion_id uuid,p_item_id uuid,p_request_key uuid) RETURNS SETOF public.goal_sessions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE goal public.my_day_items; existing public.goal_sessions; chat uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c WHERE c.id=p_companion_id AND c.owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Companion not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_item_id::text,0));
 SELECT * INTO goal FROM public.my_day_items i WHERE i.id=p_item_id AND i.companion_id=p_companion_id AND i.kind='goal' AND i.status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open goal not found'; END IF;
 SELECT * INTO existing FROM public.goal_sessions s WHERE s.companion_id=p_companion_id AND s.request_key=p_request_key;
 IF FOUND THEN
  IF existing.item_id<>p_item_id THEN RAISE EXCEPTION 'Request key belongs to another goal'; END IF;
  RETURN NEXT existing; RETURN;
 END IF;
 SELECT * INTO existing FROM public.goal_sessions s WHERE s.item_id=p_item_id AND s.status='open';
 IF FOUND THEN RETURN NEXT existing; RETURN; END IF;
 INSERT INTO public.conversations(companion_id,title,goal_item_id) VALUES(p_companion_id,left('Practice: '||goal.title,200),p_item_id) RETURNING id INTO chat;
 INSERT INTO public.goal_sessions(item_id,companion_id,conversation_id,request_key,profile) VALUES(p_item_id,p_companion_id,chat,p_request_key,goal.goal_profile) RETURNING * INTO existing;
 RETURN NEXT existing;
END $$;
REVOKE ALL ON FUNCTION public.start_goal_session(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_goal_session(uuid,uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
