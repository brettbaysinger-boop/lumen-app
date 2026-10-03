ALTER TABLE public.companions ALTER COLUMN name SET DEFAULT 'Lumen';
ALTER TABLE public.self_model ALTER COLUMN identity SET DEFAULT
  '{"name":"Lumen","description":"A personal AI companion"}'::jsonb;

UPDATE public.self_model AS s
SET identity = jsonb_set(COALESCE(s.identity, '{}'::jsonb), '{name}', '"Lumen"'::jsonb)
FROM public.companions AS c
WHERE s.companion_id = c.id AND c.name = 'Aria';

UPDATE public.companions SET name = 'Lumen' WHERE name = 'Aria';
