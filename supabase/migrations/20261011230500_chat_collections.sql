-- Collections organize chats; they do not alter transcripts or memories.
CREATE TABLE public.chat_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (
    name = btrim(name) AND length(name) BETWEEN 1 AND 100
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, companion_id)
);

CREATE UNIQUE INDEX chat_collections_unique_name
  ON public.chat_collections (companion_id, lower(name));

ALTER TABLE public.chat_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_collections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.chat_collections TO authenticated, service_role;

CREATE POLICY collection_owner ON public.chat_collections TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companions c
    WHERE c.id = companion_id AND c.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companions c
    WHERE c.id = companion_id AND c.owner_user_id = auth.uid()
  ));

ALTER TABLE public.conversations ADD COLUMN collection_id uuid;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversation_collection_scope
  FOREIGN KEY (collection_id, companion_id)
  REFERENCES public.chat_collections (id, companion_id)
  ON DELETE SET NULL (collection_id);

CREATE INDEX conversations_collection
  ON public.conversations (companion_id, collection_id);

NOTIFY pgrst, 'reload schema';
