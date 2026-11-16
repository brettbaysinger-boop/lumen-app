/*
  Clips of up to 120 seconds (FramePack's own maximum).

  20261116100000 limited media_generation_jobs.duration_seconds to 10. That migration is applied and is
  never edited or run again; this one only replaces that one CHECK. numeric(4,1) already holds 120.0.
  Nothing else changes: same table, same rows, RLS stays on with no client policies, the chat-media bucket
  keeps its 50 MB limit and its allowed types.

  Safe to run twice: it removes whatever CHECK currently limits duration_seconds and adds the named one.

  Undo, in ONE transaction (if any row is longer than 10 seconds it fails and changes nothing):
    BEGIN;
    ALTER TABLE media_generation_jobs DROP CONSTRAINT media_generation_jobs_duration_seconds_check;
    ALTER TABLE media_generation_jobs ADD CONSTRAINT media_generation_jobs_duration_seconds_check
      CHECK (duration_seconds > 0 AND duration_seconds <= 10);
    COMMIT;
*/
DO $$
DECLARE
  found record;
BEGIN
  FOR found IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.media_generation_jobs'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%duration_seconds%'
  LOOP
    EXECUTE format('ALTER TABLE public.media_generation_jobs DROP CONSTRAINT %I', found.conname);
  END LOOP;
  ALTER TABLE public.media_generation_jobs
    ADD CONSTRAINT media_generation_jobs_duration_seconds_check
    CHECK (duration_seconds > 0 AND duration_seconds <= 120);
END $$;
