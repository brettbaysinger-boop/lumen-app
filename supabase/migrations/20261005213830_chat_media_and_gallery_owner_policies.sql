/*
# Chat photo storage and private gallery access

1. New Storage Bucket
- `chat-media` (private): photos users attach in chat and images the companion creates.
- Max 10 MB per file; only JPEG, PNG, WebP and GIF accepted.
- Files live in a folder named after the signed-in user's id.

2. Security
- Storage: signed-in users can view, upload, update and delete only files in their own folder.
- `gallery_items`: replaces the previous open policies (anyone, even signed out, could read,
  change or delete every gallery item) with owner-only policies. A user can only touch gallery
  items belonging to a companion they own.

3. Notes
1. No data is changed or removed; only access rules are tightened.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat_media_select_own" ON storage.objects;
CREATE POLICY "chat_media_select_own" ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "chat_media_insert_own" ON storage.objects;
CREATE POLICY "chat_media_insert_own" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "chat_media_update_own" ON storage.objects;
CREATE POLICY "chat_media_update_own" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "chat_media_delete_own" ON storage.objects;
CREATE POLICY "chat_media_delete_own" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "gallery_select" ON gallery_items;
DROP POLICY IF EXISTS "gallery_insert" ON gallery_items;
DROP POLICY IF EXISTS "gallery_update" ON gallery_items;
DROP POLICY IF EXISTS "gallery_delete" ON gallery_items;

DROP POLICY IF EXISTS "gallery_select_own" ON gallery_items;
CREATE POLICY "gallery_select_own" ON gallery_items FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM companions c WHERE c.id = gallery_items.companion_id AND c.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "gallery_insert_own" ON gallery_items;
CREATE POLICY "gallery_insert_own" ON gallery_items FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM companions c WHERE c.id = gallery_items.companion_id AND c.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "gallery_update_own" ON gallery_items;
CREATE POLICY "gallery_update_own" ON gallery_items FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM companions c WHERE c.id = gallery_items.companion_id AND c.owner_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM companions c WHERE c.id = gallery_items.companion_id AND c.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "gallery_delete_own" ON gallery_items;
CREATE POLICY "gallery_delete_own" ON gallery_items FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM companions c WHERE c.id = gallery_items.companion_id AND c.owner_user_id = auth.uid()));