-- Atomic list appends and retry receipts. Invoker rights retain owner RLS.
CREATE TABLE public.capture_receipts (
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.my_day_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(companion_id, request_key)
);
ALTER TABLE public.capture_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.capture_receipts TO authenticated;
CREATE POLICY capture_receipt_owner ON public.capture_receipts TO authenticated
  USING (EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid())
    AND EXISTS(SELECT 1 FROM public.my_day_items i WHERE i.id=item_id AND i.companion_id=capture_receipts.companion_id));

CREATE FUNCTION public.capture_list_items(p_companion_id uuid, p_conversation_id uuid,
  p_request_key uuid, p_title text, p_items jsonb)
RETURNS SETOF public.my_day_items LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.my_day_items; matches integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c WHERE c.id=p_companion_id AND c.owner_user_id=auth.uid())
    THEN RAISE EXCEPTION 'Companion not found'; END IF;
  IF p_request_key IS NULL OR p_conversation_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.conversations c WHERE c.id=p_conversation_id AND c.companion_id=p_companion_id)
    THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 300 OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
    THEN RAISE EXCEPTION 'Invalid list'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid item count'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e)<>'object'
    OR jsonb_typeof(e->'text') IS DISTINCT FROM 'string' OR length(trim(e->>'text')) NOT BETWEEN 1 AND 300
    OR e->'done' IS DISTINCT FROM 'false'::jsonb) THEN RAISE EXCEPTION 'Invalid checklist item'; END IF;
  -- Serialize a companion's appends and receipt checks, including first creation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_companion_id::text, 817));
  SELECT i.* INTO target FROM public.capture_receipts r JOIN public.my_day_items i ON i.id=r.item_id
    WHERE r.companion_id=p_companion_id AND r.request_key=p_request_key;
  IF FOUND THEN RETURN NEXT target; RETURN; END IF;
  SELECT count(*) INTO matches FROM public.my_day_items i WHERE i.companion_id=p_companion_id
    AND i.kind='list' AND i.status='open' AND lower(i.title)=lower(trim(p_title));
  IF matches>1 THEN RAISE EXCEPTION 'Multiple open lists share this name'; END IF;
  SELECT i.* INTO target FROM public.my_day_items i WHERE i.companion_id=p_companion_id
    AND i.kind='list' AND i.status='open' AND lower(i.title)=lower(trim(p_title)) FOR UPDATE;
  IF FOUND THEN
    IF jsonb_array_length(target.checklist)+jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'List is full'; END IF;
    UPDATE public.my_day_items SET checklist=checklist||p_items WHERE id=target.id RETURNING * INTO target;
  ELSE
    INSERT INTO public.my_day_items(companion_id,kind,title,checklist,source_conversation_id,request_key)
      VALUES(p_companion_id,'list',trim(p_title),p_items,p_conversation_id,p_request_key) RETURNING * INTO target;
  END IF;
  INSERT INTO public.capture_receipts(companion_id,request_key,item_id) VALUES(p_companion_id,p_request_key,target.id);
  RETURN NEXT target;
END $$;
REVOKE ALL ON FUNCTION public.capture_list_items(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_list_items(uuid,uuid,uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
