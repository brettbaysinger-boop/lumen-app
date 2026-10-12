ALTER TABLE public.conversations ADD COLUMN handoff jsonb;
ALTER TABLE public.conversations ADD CONSTRAINT handoff_size
  CHECK (handoff IS NULL OR octet_length(handoff::text) <= 40000);

-- Invoker security: all reads and writes retain account RLS.
-- Request UUID becomes the new chat ID, making a repeated request idempotent.
CREATE FUNCTION public.start_handoff_chat(
  p_request_id uuid,
  p_companion_id uuid,
  p_title text,
  p_summary text,
  p_source_ids uuid[],
  p_collection_id uuid DEFAULT NULL
) RETURNS public.conversations
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  result public.conversations;
  source_row public.conversations;
  source_id uuid;
  source_list jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_request_id IS NULL OR p_companion_id IS NULL OR
     p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 OR
     p_summary IS NULL OR length(btrim(p_summary)) NOT BETWEEN 1 AND 6000 OR
     p_source_ids IS NULL OR cardinality(p_source_ids) NOT BETWEEN 1 AND 5 OR
     array_position(p_source_ids, NULL) IS NOT NULL OR
     (SELECT count(DISTINCT value) FROM unnest(p_source_ids) value) <> cardinality(p_source_ids)
  THEN RAISE EXCEPTION 'Invalid handoff'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companions
    WHERE id=p_companion_id AND owner_user_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Companion unavailable'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  SELECT * INTO result FROM public.conversations WHERE id=p_request_id;
  IF FOUND THEN
    IF result.companion_id <> p_companion_id OR
       result.title IS DISTINCT FROM btrim(p_title) OR
       result.collection_id IS DISTINCT FROM p_collection_id OR
       result.handoff->>'summary' IS DISTINCT FROM btrim(p_summary) OR
       result.handoff->'source_ids' IS DISTINCT FROM to_jsonb(p_source_ids)
    THEN RAISE EXCEPTION 'Request already used for a different handoff'; END IF;
    RETURN result;
  END IF;

  -- Source rows are locked against deletion until creation commits.
  FOREACH source_id IN ARRAY p_source_ids LOOP
    SELECT * INTO source_row FROM public.conversations
      WHERE id=source_id AND companion_id=p_companion_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source chat unavailable'; END IF;
    source_list := source_list || jsonb_build_array(jsonb_build_object(
      'id', source_row.id, 'title', source_row.title
    ));
  END LOOP;

  INSERT INTO public.conversations(
    id, companion_id, title, is_active, collection_id, handoff
  ) VALUES (
    p_request_id, p_companion_id, btrim(p_title), true, p_collection_id,
    jsonb_build_object(
      'summary', btrim(p_summary),
      'source_ids', to_jsonb(p_source_ids),
      'sources', source_list,
      'reviewed_at', now()
    )
  ) RETURNING * INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.start_handoff_chat(uuid,uuid,text,text,uuid[],uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_handoff_chat(uuid,uuid,text,text,uuid[],uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
