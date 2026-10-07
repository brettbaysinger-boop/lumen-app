ALTER TABLE public.my_day_items ADD COLUMN source_documents jsonb NOT NULL DEFAULT '[]'
  CHECK(jsonb_typeof(source_documents)='array' AND jsonb_array_length(source_documents)<=6);

-- Keep existing source-conversation/timezone checks, and reject cross-companion document references.
CREATE OR REPLACE FUNCTION public.check_my_day_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE source jsonb;
BEGIN
  IF NEW.source_conversation_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.conversations c WHERE c.id=NEW.source_conversation_id AND c.companion_id=NEW.companion_id
  ) THEN RAISE EXCEPTION 'Conversation does not belong to this companion'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone)
    THEN RAISE EXCEPTION 'Invalid timezone'; END IF;
  IF TG_OP='INSERT' OR NEW.source_documents IS DISTINCT FROM OLD.source_documents OR NEW.companion_id IS DISTINCT FROM OLD.companion_id THEN
    FOR source IN SELECT value FROM jsonb_array_elements(NEW.source_documents) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=(source->>'document_id')::uuid AND d.companion_id=NEW.companion_id)
        THEN RAISE EXCEPTION 'Source document does not belong to this companion'; END IF;
    END LOOP;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
