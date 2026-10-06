ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unspecified'
    CHECK (gender IN ('female', 'male', 'nonbinary', 'unspecified')),
  ADD COLUMN IF NOT EXISTS speech_voice text;

-- Preserve uploaded and alternative portraits; replace only the old default.
UPDATE public.companions SET portrait_url = '/lumen-original.jpg'
WHERE portrait_url = '/lumen-portrait.webp';
ALTER TABLE public.companions ALTER COLUMN portrait_url SET DEFAULT '/lumen-original.jpg';

NOTIFY pgrst, 'reload schema';
