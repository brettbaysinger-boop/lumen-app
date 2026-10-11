-- Local Supabase validation after migration. Fixtures roll back; no sends.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('9a4c0000-0000-4000-8000-000000000001','push-fixture-a@example.invalid'),
 ('9a4c0000-0000-4000-8000-000000000002','push-fixture-b@example.invalid');
SELECT set_config('request.jwt.claim.sub','9a4c0000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.register_push_device('9a4c0000-0000-4000-8000-000000000011','synthetic-push-token-aaaaaaaaaaaaaaaaaaaa');
DO $$
DECLARE denied boolean := false;
BEGIN
 BEGIN PERFORM 1 FROM public.push_devices; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Device tokens exposed'; END IF;
 denied:=false;
 BEGIN PERFORM public.claim_push_jobs(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Worker claims exposed'; END IF;
 PERFORM public.test_push_device('9a4c0000-0000-4000-8000-000000000011');
END $$;
SELECT set_config('request.jwt.claim.sub','9a4c0000-0000-4000-8000-000000000002',true);
SELECT public.disable_push_device('9a4c0000-0000-4000-8000-000000000011');
RESET ROLE;
DO $$ BEGIN
 IF NOT (SELECT enabled FROM public.push_devices WHERE id='9a4c0000-0000-4000-8000-000000000011') THEN RAISE EXCEPTION 'Another owner disabled device'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT public.register_push_device('9a4c0000-0000-4000-8000-000000000011','synthetic-push-token-aaaaaaaaaaaaaaaaaaaa',false);
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.push_devices WHERE id='9a4c0000-0000-4000-8000-000000000011' AND (enabled OR owner_user_id<>'9a4c0000-0000-4000-8000-000000000002')) THEN RAISE EXCEPTION 'Account binding failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.push_jobs WHERE device_id='9a4c0000-0000-4000-8000-000000000011' AND status<>'cancelled') THEN RAISE EXCEPTION 'Old account job not cancelled'; END IF;
 RAISE NOTICE 'PASS: hidden tokens, worker role, owner scope, test queue, disabled rebind and cancellation';
END $$;
ROLLBACK;
