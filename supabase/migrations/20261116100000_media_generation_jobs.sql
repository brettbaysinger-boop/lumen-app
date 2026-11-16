/*
# Short video generation jobs and video storage (Private mode only)

1. `media_generation_jobs`: one row per background video job. Written and read only by the
   Lumen backend (service role), always scoped to the verified user id. Row level security is
   on with no client policies, so the app can never read generation history directly; it asks
   the backend, which refuses while Public mode is on.
2. `chat-media` bucket: also accepts MP4 and WebM, and files up to 50 MB (was images only,
   10 MB). Folder-per-user storage policies are unchanged.

No existing data is changed or removed.
*/
CREATE TABLE IF NOT EXISTS media_generation_jobs (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid,
  kind text NOT NULL DEFAULT 'video' CHECK (kind IN ('video')),
  mode text NOT NULL CHECK (mode IN ('t2v', 'i2v', 't2i2v')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  still_prompt text,
  source_path text,
  source_mime text,
  duration_seconds numeric(4, 1) NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 10),
  explicit boolean NOT NULL DEFAULT false,
  provider text,
  model text,
  result_path text,
  result_mime_type text,
  latency_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_owner_status ON media_generation_jobs(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_message ON media_generation_jobs(message_id);

ALTER TABLE media_generation_jobs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies for anon/authenticated: backend (service role) only.

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
WHERE id = 'chat-media';
