ALTER TABLE public.my_day_items ADD COLUMN step_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.my_day_items ADD CONSTRAINT my_day_step_mode_project CHECK (NOT step_mode OR kind='project');
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.finish_small_step(p_companion_id uuid,p_item_id uuid,p_index integer,p_text text)
RETURNS SETOF public.my_day_items LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.my_day_items;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c WHERE c.id=p_companion_id AND c.owner_user_id=auth.uid())
    THEN RAISE EXCEPTION 'Companion not found'; END IF;
  SELECT * INTO target FROM public.my_day_items WHERE id=p_item_id AND companion_id=p_companion_id AND step_mode FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Small-step plan not found'; END IF;
  IF target.status<>'open' OR p_index IS NULL OR p_text IS NULL OR p_index<0 OR p_index>=jsonb_array_length(target.checklist)
    THEN RAISE EXCEPTION 'Reload this plan before changing progress'; END IF;
  IF target.checklist->p_index->>'text' IS DISTINCT FROM p_text THEN RAISE EXCEPTION 'Step changed; reload this plan'; END IF;
  IF target.checklist->p_index->>'done'='true' THEN RETURN NEXT target; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(target.checklist) WITH ORDINALITY e(value,n)
    WHERE n-1<p_index AND value->>'done' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'Finish the current step first'; END IF;
  UPDATE public.my_day_items SET checklist=jsonb_set(checklist,ARRAY[p_index::text,'done'],'true'::jsonb)
    WHERE id=target.id RETURNING * INTO target;
  RETURN NEXT target;
END $$;
REVOKE ALL ON FUNCTION public.finish_small_step(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_small_step(uuid,uuid,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';
