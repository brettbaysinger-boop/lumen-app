-- Direct FCM delivery; no conversation or reminder text enters the push queue.
CREATE TABLE public.push_devices (
 id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 20 AND 4096),
 enabled boolean NOT NULL DEFAULT true,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_devices FROM anon, authenticated;
GRANT ALL ON public.push_devices TO service_role;
CREATE TABLE public.push_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 device_id uuid NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 item_id uuid REFERENCES public.my_day_items(id) ON DELETE CASCADE,
 due_at timestamptz NOT NULL,
 kind text NOT NULL CHECK (kind IN ('reminder','test')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 claim_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(device_id,item_id,due_at)
);
ALTER TABLE public.push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_jobs FROM anon, authenticated;
GRANT ALL ON public.push_jobs TO service_role;
CREATE INDEX push_job_pending ON public.push_jobs(status,next_attempt_at);

CREATE FUNCTION public.register_push_device(p_device_id uuid,p_token text,p_enabled boolean DEFAULT true) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(p_token) NOT BETWEEN 20 AND 4096 OR p_token IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF;
 IF EXISTS(SELECT 1 FROM public.push_devices WHERE id=p_device_id AND owner_user_id<>auth.uid() AND token<>p_token) THEN RAISE EXCEPTION 'Installation token changed; sign in to the previous account to disable first'; END IF;
 -- The native token is a private high-entropy installation credential. Rotation
 -- and account switches replace its prior binding atomically.
 DELETE FROM public.push_devices WHERE token=p_token AND id<>p_device_id;
 INSERT INTO public.push_devices(id,owner_user_id,token,enabled) VALUES(p_device_id,auth.uid(),p_token,p_enabled)
 ON CONFLICT(id) DO UPDATE SET owner_user_id=auth.uid(),token=p_token,
 enabled=p_enabled,expires_at=now()+interval '30 days',updated_at=now();
 UPDATE public.push_jobs SET status='cancelled' WHERE device_id=p_device_id
 AND (owner_user_id<>auth.uid() OR NOT p_enabled) AND status IN ('pending','sending');
 RETURN true;
END $$;
CREATE FUNCTION public.disable_push_device(p_device_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 UPDATE public.push_devices SET enabled=false,updated_at=now()
 WHERE id=p_device_id AND owner_user_id=auth.uid();
 UPDATE public.push_jobs SET status='cancelled' WHERE device_id=p_device_id
 AND owner_user_id=auth.uid() AND status IN ('pending','sending');
 RETURN true;
END $$;
CREATE FUNCTION public.test_push_device(p_device_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM 1 FROM public.push_devices WHERE id=p_device_id AND owner_user_id=auth.uid()
 AND enabled AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enable this device first'; END IF;
 IF EXISTS(SELECT 1 FROM public.push_jobs WHERE device_id=p_device_id
 AND kind='test' AND created_at>now()-interval '30 seconds') THEN RAISE EXCEPTION 'Wait 30 seconds before another test'; END IF;
 INSERT INTO public.push_jobs(device_id,owner_user_id,due_at,kind)
 VALUES(p_device_id,auth.uid(),now(),'test') RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.claim_push_jobs() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 DELETE FROM public.push_jobs WHERE status IN ('sent','cancelled','failed') AND created_at<now()-interval '30 days';
 INSERT INTO public.push_jobs(device_id,owner_user_id,item_id,due_at,kind)
 SELECT d.id,d.owner_user_id,i.id,i.due_at,'reminder' FROM public.my_day_items i
 JOIN public.companions c ON c.id=i.companion_id
 JOIN public.push_devices d ON d.owner_user_id=c.owner_user_id
 WHERE i.kind='reminder' AND i.status='open' AND i.due_at<=now()
 AND i.due_at>now()-interval '24 hours' AND d.enabled AND d.expires_at>now()
 ON CONFLICT(device_id,item_id,due_at) DO NOTHING;
 UPDATE public.push_jobs j SET status='cancelled' WHERE j.status IN ('pending','sending') AND (
 j.created_at<now()-interval '24 hours' OR NOT EXISTS(SELECT 1 FROM public.push_devices d
 WHERE d.id=j.device_id AND d.owner_user_id=j.owner_user_id AND d.enabled AND d.expires_at>now())
 OR (j.kind='reminder' AND NOT EXISTS(SELECT 1 FROM public.my_day_items i
 JOIN public.companions c ON c.id=i.companion_id WHERE i.id=j.item_id
 AND i.status='open' AND i.due_at=j.due_at AND c.owner_user_id=j.owner_user_id)));
 WITH picked AS (
 SELECT id FROM public.push_jobs WHERE attempts<5 AND next_attempt_at<=now()
 AND (status='pending' OR (status='sending' AND lease_until<now()))
 ORDER BY due_at LIMIT 5 FOR UPDATE SKIP LOCKED
 ), claimed AS (
 UPDATE public.push_jobs j SET status='sending',attempts=attempts+1,
 claim_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 FROM picked WHERE j.id=picked.id RETURNING j.*
 ) SELECT coalesce(jsonb_agg(to_jsonb(claimed) || jsonb_build_object('token',d.token)), '[]'::jsonb)
 INTO result FROM claimed JOIN public.push_devices d ON d.id=claimed.device_id;
 UPDATE public.push_jobs SET status='failed' WHERE attempts>=5 AND status='sending' AND lease_until<now();
 RETURN result;
END $$;
CREATE FUNCTION public.finish_push_job(p_id uuid,p_claim_id uuid,p_result text,p_token text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device uuid;
BEGIN
 IF p_result NOT IN ('sent','retry','invalid','failed','cancelled') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 UPDATE public.push_jobs SET status=CASE WHEN p_result='retry' AND attempts<5 THEN 'pending'
 WHEN p_result IN ('invalid','failed') OR p_result='retry' THEN 'failed' ELSE p_result END,
 next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)),lease_until=NULL
 WHERE id=p_id AND claim_id=p_claim_id AND status='sending' RETURNING device_id INTO device;
 IF device IS NULL THEN RETURN false; END IF;
 IF p_result='invalid' THEN UPDATE public.push_devices SET enabled=false WHERE id=device AND token=p_token; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.register_push_device(uuid,text,boolean),public.disable_push_device(uuid),public.test_push_device(uuid),public.claim_push_jobs(),public.finish_push_job(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_device(uuid,text,boolean),public.disable_push_device(uuid),public.test_push_device(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_jobs(),public.finish_push_job(uuid,uuid,text,text) TO service_role;
