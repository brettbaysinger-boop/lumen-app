-- Visual settings belong to the account, not a shared companion persona.
-- Small sanitized logos are stored atomically with the profile. No example
-- PDF bytes, filenames, extracted text, prices or customer fields are stored.
CREATE TABLE public.document_styles (
  owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT document_style_object CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT document_style_size CHECK (octet_length(settings::text) <= 710000)
);
ALTER TABLE public.document_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_styles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_styles TO authenticated;
GRANT ALL ON public.document_styles TO service_role;
CREATE POLICY document_style_owner ON public.document_styles
  TO authenticated USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
