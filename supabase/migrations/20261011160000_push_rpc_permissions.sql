-- Supabase's schema default privileges grant function execution directly to
-- API roles. Revoking PUBLIC alone does not remove those inherited defaults.
REVOKE ALL ON FUNCTION
 public.register_push_device(uuid,text,boolean),
 public.disable_push_device(uuid),
 public.test_push_device(uuid),
 public.claim_push_jobs(),
 public.finish_push_job(uuid,uuid,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
 public.register_push_device(uuid,text,boolean),
 public.disable_push_device(uuid),
 public.test_push_device(uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION
 public.claim_push_jobs(),
 public.finish_push_job(uuid,uuid,text,text)
TO service_role;
