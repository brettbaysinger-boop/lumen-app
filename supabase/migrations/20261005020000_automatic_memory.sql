-- Clear direct facts can be saved automatically; uncertain proposals remain reviewable.
ALTER TABLE public.companions ADD COLUMN auto_memory_enabled boolean NOT NULL DEFAULT true;
CREATE FUNCTION public.auto_save_memory_suggestion(p_id uuid,p_topic text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.memory_suggestions; enabled boolean; outcome text;
BEGIN
 SELECT ms.* INTO s FROM public.memory_suggestions ms JOIN public.companions c ON c.id=ms.companion_id
 WHERE ms.id=p_id AND c.owner_user_id=auth.uid();
 IF s.id IS NULL THEN RAISE EXCEPTION 'Suggestion not available'; END IF;
 -- Lock companion before suggestion: concurrent saves of the same attribute serialize.
 SELECT auto_memory_enabled INTO enabled FROM public.companions WHERE id=s.companion_id FOR UPDATE;
 SELECT * INTO s FROM public.memory_suggestions WHERE id=p_id FOR UPDATE;
 IF NOT enabled OR s.status <> 'pending' OR s.subject <> 'user' OR
    p_topic IS NULL OR p_topic !~ '^[a-z][a-z0-9_]{1,79}$' THEN RETURN 'review'; END IF;
 -- A changed value for an established topic needs confirmation. Do not overwrite history.
 IF EXISTS(SELECT 1 FROM public.memories WHERE companion_id=s.companion_id AND subject='user'
   AND ('topic:'||p_topic)=ANY(tags) AND lower(btrim(content))<>lower(btrim(s.content))) THEN RETURN 'review'; END IF;
 outcome:=public.review_memory_suggestion(p_id,'approve',NULL,NULL);
 IF outcome='approved' THEN
  UPDATE public.memories SET source='automatic_observation',
    tags=array_append(tags,'topic:'||p_topic) WHERE id=(SELECT memory_id FROM public.memory_suggestions WHERE id=p_id);
 END IF;
 RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION public.auto_save_memory_suggestion(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.auto_save_memory_suggestion(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
