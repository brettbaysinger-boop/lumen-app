-- Run against local Supabase after the migration, with psql ON_ERROR_STOP=1.
-- All fixtures and mutations roll back. No existing account is touched.
BEGIN;
INSERT INTO public.profiles(id,display_name) VALUES
 ('8a3b0000-0000-4000-8000-000000000001','Creation fixture A'),
 ('8a3b0000-0000-4000-8000-000000000002','Creation fixture B');
INSERT INTO public.companions(id,owner_user_id,name) VALUES
 ('8a3b0000-0000-4000-8000-000000000011','8a3b0000-0000-4000-8000-000000000001','Fixture'),
 ('8a3b0000-0000-4000-8000-000000000012','8a3b0000-0000-4000-8000-000000000002','Other fixture');
INSERT INTO public.self_model(companion_id,identity) VALUES
 ('8a3b0000-0000-4000-8000-000000000011','{"name":"Fixture","custom":"keep"}');
SELECT set_config('request.jwt.claim.sub','8a3b0000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE saved jsonb; identity jsonb; failed boolean := false;
 details jsonb := '{"name":" Sol ","pronouns":"they/them","gender":"nonbinary","persona":"Curious and practical","description":"A creative partner","visual_identity":"Silver hair","portrait_url":"/lumen-original.jpg","speech_voice":null}';
BEGIN
 IF EXISTS(SELECT 1 FROM public.companions WHERE id='8a3b0000-0000-4000-8000-000000000012')
   THEN RAISE EXCEPTION 'Cross-owner RLS failure'; END IF;
 IF (SELECT setup_completed_at FROM public.companions WHERE id='8a3b0000-0000-4000-8000-000000000011') IS NOT NULL
   THEN RAISE EXCEPTION 'New companions must need setup'; END IF;
 saved := public.save_companion_creation('8a3b0000-0000-4000-8000-000000000011',details);
 IF saved->>'name'<>'Sol' OR saved->>'setup_completed_at' IS NULL OR saved->>'pronouns'<>'they/them'
   THEN RAISE EXCEPTION 'Saved identity incorrect'; END IF;
 SELECT sm.identity INTO identity FROM public.self_model sm WHERE companion_id='8a3b0000-0000-4000-8000-000000000011';
 IF identity->>'name'<>'Sol' OR identity->>'custom'<>'keep' THEN RAISE EXCEPTION 'Self-model identity not reconciled'; END IF;
 BEGIN
   PERFORM public.save_companion_creation('8a3b0000-0000-4000-8000-000000000012',details);
 EXCEPTION WHEN OTHERS THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-owner update accepted'; END IF;
 failed := false;
 BEGIN
   PERFORM public.save_companion_creation('8a3b0000-0000-4000-8000-000000000011',details||'{"name":""}');
 EXCEPTION WHEN OTHERS THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Invalid name accepted'; END IF;
 failed := false;
 BEGIN
   PERFORM public.save_companion_creation('8a3b0000-0000-4000-8000-000000000011',details||'{"portrait_url":"8a3b0000-0000-4000-8000-000000000002/other.jpg"}');
 EXCEPTION WHEN OTHERS THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-owner portrait accepted'; END IF;
 IF (SELECT name FROM public.companions WHERE id='8a3b0000-0000-4000-8000-000000000011')<>'Sol'
   THEN RAISE EXCEPTION 'Failed validation changed the companion'; END IF;
 RAISE NOTICE 'PASS: creation, completion, self-model reconciliation, owner scope and validation';
END $$;
RESET ROLE;
ROLLBACK;
