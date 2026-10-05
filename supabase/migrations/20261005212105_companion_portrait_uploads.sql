/*
# Private storage for custom companion portraits

1. New Storage Bucket
- `companion-portraits` (private)
- Max 5 MB per file
- Only JPEG, PNG, WebP and GIF images accepted

2. Security
- Files live under a folder named after the signed-in user's id.
- Signed-in users can view, upload, update and delete only files inside their own folder.
- Nobody signed out can access these files; the app shows them through short-lived signed links.

3. Notes
1. `companions.portrait_url` now holds either a built-in portrait path (starting with "/")
   or the storage path of an uploaded photo (starting with the user's id).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('companion-portraits', 'companion-portraits', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "portraits_select_own" ON storage.objects;
CREATE POLICY "portraits_select_own" ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'companion-portraits' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portraits_insert_own" ON storage.objects;
CREATE POLICY "portraits_insert_own" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'companion-portraits' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portraits_update_own" ON storage.objects;
CREATE POLICY "portraits_update_own" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'companion-portraits' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'companion-portraits' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portraits_delete_own" ON storage.objects;
CREATE POLICY "portraits_delete_own" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'companion-portraits' AND (storage.foldername(name))[1] = auth.uid()::text);