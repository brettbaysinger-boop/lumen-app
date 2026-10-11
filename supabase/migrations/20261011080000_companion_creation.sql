-- Existing companions keep their identity and bypass first-login setup.
-- Only future companions start with a NULL completion timestamp.
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz DEFAULT now();
ALTER TABLE public.companions ALTER COLUMN setup_completed_at DROP DEFAULT;
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS pronouns text
  CHECK (pronouns IS NULL OR length(btrim(pronouns)) BETWEEN 1 AND 40);

CREATE OR REPLACE FUNCTION public.save_companion_creation(p_companion uuid, p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result public.companions; voice text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO result FROM public.companions
    WHERE id=p_companion AND owner_user_id=auth.uid() FOR UPDATE;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Companion unavailable'; END IF;
  IF jsonb_typeof(p_details) IS DISTINCT FROM 'object'
    OR length(btrim(coalesce(p_details->>'name',''))) NOT BETWEEN 1 AND 100
    OR length(btrim(coalesce(p_details->>'pronouns',''))) NOT BETWEEN 1 AND 40
    OR length(btrim(coalesce(p_details->>'persona',''))) NOT BETWEEN 1 AND 4000
    OR length(coalesce(p_details->>'description','')) > 500
    OR length(coalesce(p_details->>'visual_identity','')) > 3000
    OR length(coalesce(p_details->>'portrait_url','')) NOT BETWEEN 1 AND 1000
    OR coalesce(p_details->>'gender','') NOT IN ('female','male','nonbinary','unspecified')
    THEN RAISE EXCEPTION 'Invalid companion details'; END IF;
  voice := nullif(btrim(p_details->>'speech_voice'),'');
  IF length(voice)>100 THEN RAISE EXCEPTION 'Invalid voice'; END IF;
  -- Only known bundled assets or the current owner's private uploaded path.
  IF p_details->>'portrait_url' NOT IN ('/lumen-original.jpg','/lumen-portrait.webp',
      '/lumen-portrait-solar.webp','/lumen-portrait-tide.webp','/lumen-portrait-ember.webp')
    AND left(p_details->>'portrait_url',length(auth.uid()::text)+1) <> auth.uid()::text||'/'
    THEN RAISE EXCEPTION 'Portrait unavailable'; END IF;
  UPDATE public.companions SET name=btrim(p_details->>'name'), pronouns=btrim(p_details->>'pronouns'),
    gender=p_details->>'gender', persona=btrim(p_details->>'persona'),
    description=nullif(btrim(p_details->>'description'),''),
    visual_identity=nullif(btrim(p_details->>'visual_identity'),''),
    portrait_url=p_details->>'portrait_url', speech_voice=voice,
    setup_completed_at=coalesce(setup_completed_at,now()), updated_at=now()
    WHERE id=p_companion RETURNING * INTO result;
  UPDATE public.self_model SET identity=coalesce(identity,'{}'::jsonb)||
    jsonb_build_object('name',result.name,'description',result.description,'pronouns',result.pronouns),
    updated_at=now() WHERE companion_id=p_companion;
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.save_companion_creation(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_companion_creation(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
