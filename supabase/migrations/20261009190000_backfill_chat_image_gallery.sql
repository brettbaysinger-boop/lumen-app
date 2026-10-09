-- Recover historical chat images into the companion gallery.
-- Safe to rerun: deterministic UUIDv5 identifiers and ON CONFLICT DO NOTHING.
-- Only references existing private chat-media objects; never modifies them.
-- Uses the original message timestamp to preserve gallery chronology.

WITH image_attachments AS (
  SELECT
    m.id AS message_id,
    m.role,
    m.companion_id,
    m.conversation_id,
    m.content,
    m.created_at,
    attachment.value->>'path' AS storage_path,
    attachment.value->>'mime_type' AS mime_type
  FROM public.messages AS m
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(m.metadata->'attachments') = 'array'
      THEN m.metadata->'attachments'
      ELSE '[]'::jsonb
    END
  ) AS attachment(value)
  WHERE m.role IN ('user', 'assistant')
),
valid_images AS (
  SELECT DISTINCT ON (a.message_id, a.storage_path)
    a.*
  FROM image_attachments AS a
  JOIN public.companions AS c
    ON c.id = a.companion_id
  JOIN public.conversations AS conversation
    ON conversation.id = a.conversation_id
   AND conversation.companion_id = a.companion_id
  JOIN storage.objects AS object
    ON object.bucket_id = 'chat-media'
   AND object.name = a.storage_path
  WHERE a.storage_path IS NOT NULL
    AND a.storage_path <> ''
    AND a.mime_type LIKE 'image/%'
  ORDER BY a.message_id, a.storage_path
)
INSERT INTO public.gallery_items (
  id,
  companion_id,
  conversation_id,
  source,
  category,
  media_type,
  url,
  caption,
  metadata,
  created_at
)
SELECT
  extensions.uuid_generate_v5(
    '6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
    CASE
      WHEN role = 'assistant'
      THEN 'raialume:generated-image:' || message_id::text
      ELSE 'raialume:user-image:' || message_id::text || ':' || storage_path
    END
  ),
  companion_id,
  conversation_id,
  CASE WHEN role = 'assistant' THEN 'companion' ELSE 'user' END,
  CASE WHEN role = 'assistant' THEN 'companion_sent' ELSE 'user_showed' END,
  'image',
  storage_path,
  NULLIF(LEFT(content, 500), ''),
  jsonb_build_object(
    'bucket', 'chat-media',
    'storage_path', storage_path,
    'message_id', message_id::text,
    'mime_type', mime_type,
    'generated_image', role = 'assistant'
  ),
  created_at
FROM valid_images
ON CONFLICT (id) DO NOTHING;
