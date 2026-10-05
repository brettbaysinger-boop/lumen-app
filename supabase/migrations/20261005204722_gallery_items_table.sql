/*
# Create gallery_items table for Shared Gallery

1. New Tables
- `gallery_items` — stores images and videos shared between user and companion
  - id (uuid, primary key)
  - companion_id (uuid, FK to companions)
  - conversation_id (uuid, FK to conversations, nullable)
  - source ('user' | 'companion') — who shared it
  - category ('moment' | 'user_showed' | 'companion_sent') — visual categorization
  - media_type ('image' | 'video')
  - url (text) — storage URL or external URL
  - caption (text, nullable)
  - metadata (jsonb)
  - created_at (timestamptz)

2. Security
- Single-tenant personal app, no sign-in screen at schema level
- Enable RLS with anon + authenticated CRUD access
*/

CREATE TABLE IF NOT EXISTS gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('user', 'companion')),
  category text NOT NULL DEFAULT 'moment' CHECK (category IN ('moment', 'user_showed', 'companion_sent')),
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  url text NOT NULL,
  caption text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_companion ON gallery_items(companion_id);
CREATE INDEX IF NOT EXISTS idx_gallery_category ON gallery_items(companion_id, category);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at);

ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_select" ON gallery_items;
CREATE POLICY "gallery_select" ON gallery_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "gallery_insert" ON gallery_items;
CREATE POLICY "gallery_insert" ON gallery_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "gallery_update" ON gallery_items;
CREATE POLICY "gallery_update" ON gallery_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gallery_delete" ON gallery_items;
CREATE POLICY "gallery_delete" ON gallery_items FOR DELETE TO anon, authenticated USING (true);
