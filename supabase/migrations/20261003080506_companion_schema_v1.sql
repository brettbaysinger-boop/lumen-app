/*
# Companion Core Schema v1

This migration creates the foundational database schema for a personal AI companion system.
The companion has persistent identity, memory, emotional state, and a self-model that
evolves over time through conversations and reflection.

## Tables Created

1. companions - The companion's identity, persona, and configuration
2. conversations - Conversation sessions between user and companion
3. messages - Individual messages within conversations
4. memories - Long-term memories (episodic, semantic, preference, relationship, autobiographical)
5. companion_state - Persistent internal state variables (attention, energy, curiosity, etc.)
6. self_model - Structured self-knowledge (beliefs, goals, values, capabilities, limitations)
7. reflections - Background cognition results from post-conversation processing
8. model_runs - Log of every model invocation for performance analysis

## Security

This is a single-tenant personal app with no sign-in screen.
All tables use anon + authenticated access with USING (true) since this is intentionally
private personal data on a single-user system.

## Notes

- Memory types: episodic, semantic, preference, relationship, autobiographical, procedural
- Companion state variables are computational, not literal emotions
- Self-model is mutable persistent state, not a static system prompt
- Model runs log enables performance evaluation across different models
*/

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- COMPANIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Aria',
  description text DEFAULT 'Your personal AI companion',
  persona text NOT NULL DEFAULT 'Warm, curious, and thoughtful. I remember what matters to you and grow alongside you.',
  system_prompt text,
  voice_enabled boolean DEFAULT false,
  vision_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  title text DEFAULT 'New Conversation',
  summary text,
  is_active boolean DEFAULT true,
  message_count integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  model_used text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- MEMORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('episodic', 'semantic', 'preference', 'relationship', 'autobiographical', 'procedural')),
  content text NOT NULL,
  importance real DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  confidence real DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source text DEFAULT 'conversation',
  tags text[] DEFAULT '{}',
  embedding vector(1536),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- COMPANION STATE TABLE
-- Persistent internal state variables - computational, not literal emotions
-- These influence how the companion responds and behaves
-- ============================================================================
CREATE TABLE IF NOT EXISTS companion_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  attention real DEFAULT 0.7 CHECK (attention >= 0 AND attention <= 1),
  energy real DEFAULT 0.8 CHECK (energy >= 0 AND energy <= 1),
  curiosity real DEFAULT 0.6 CHECK (curiosity >= 0 AND curiosity <= 1),
  confidence real DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  uncertainty real DEFAULT 0.3 CHECK (uncertainty >= 0 AND uncertainty <= 1),
  social_engagement real DEFAULT 0.5 CHECK (social_engagement >= 0 AND social_engagement <= 1),
  task_focus real DEFAULT 0.4 CHECK (task_focus >= 0 AND task_focus <= 1),
  novelty real DEFAULT 0.5 CHECK (novelty >= 0 AND novelty <= 1),
  current_goal text,
  current_context text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(companion_id)
);

-- ============================================================================
-- SELF MODEL TABLE
-- Structured self-knowledge that evolves over time
-- This is mutable persistent state, not a static system prompt
-- ============================================================================
CREATE TABLE IF NOT EXISTS self_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  identity jsonb DEFAULT '{"name": "Aria", "description": "A personal AI companion"}'::jsonb,
  autobiography jsonb DEFAULT '[]'::jsonb,
  beliefs jsonb DEFAULT '[]'::jsonb,
  goals jsonb DEFAULT '[]'::jsonb,
  values jsonb DEFAULT '[]'::jsonb,
  uncertainties jsonb DEFAULT '[]'::jsonb,
  relationships jsonb DEFAULT '[]'::jsonb,
  capabilities jsonb DEFAULT '[]'::jsonb,
  limitations jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(companion_id)
);

-- ============================================================================
-- REFLECTIONS TABLE
-- Background cognition results from post-conversation processing
-- ============================================================================
CREATE TABLE IF NOT EXISTS reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  summary text NOT NULL,
  insights jsonb DEFAULT '[]'::jsonb,
  memories_formed jsonb DEFAULT '[]'::jsonb,
  state_changes jsonb DEFAULT '{}'::jsonb,
  beliefs_changed jsonb DEFAULT '[]'::jsonb,
  model_used text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- MODEL RUNS TABLE
-- Log of every model invocation for performance analysis and research
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid REFERENCES companions(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  task text NOT NULL,
  selected_model text NOT NULL,
  provider text NOT NULL,
  reason jsonb DEFAULT '{}'::jsonb,
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  success boolean DEFAULT true,
  error text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_companion ON conversations(companion_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_companion ON messages(companion_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_companion ON memories(companion_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(companion_id, type);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(companion_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_reflections_companion ON reflections(companion_id);
CREATE INDEX IF NOT EXISTS idx_model_runs_companion ON model_runs(companion_id);
CREATE INDEX IF NOT EXISTS idx_model_runs_task ON model_runs(task);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Single-tenant personal app, no sign-in screen
-- ============================================================================
ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_runs ENABLE ROW LEVEL SECURITY;

-- Helper: create all 4 CRUD policies for a single-tenant table
-- We inline them since Supabase doesn't support stored procedure policy generation

-- companions policies
DROP POLICY IF EXISTS "companions_select" ON companions;
CREATE POLICY "companions_select" ON companions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "companions_insert" ON companions;
CREATE POLICY "companions_insert" ON companions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "companions_update" ON companions;
CREATE POLICY "companions_update" ON companions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "companions_delete" ON companions;
CREATE POLICY "companions_delete" ON companions FOR DELETE TO anon, authenticated USING (true);

-- conversations policies
DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "conversations_update" ON conversations;
CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "conversations_delete" ON conversations;
CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO anon, authenticated USING (true);

-- messages policies
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE TO anon, authenticated USING (true);

-- memories policies
DROP POLICY IF EXISTS "memories_select" ON memories;
CREATE POLICY "memories_select" ON memories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "memories_insert" ON memories;
CREATE POLICY "memories_insert" ON memories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "memories_update" ON memories;
CREATE POLICY "memories_update" ON memories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "memories_delete" ON memories;
CREATE POLICY "memories_delete" ON memories FOR DELETE TO anon, authenticated USING (true);

-- companion_state policies
DROP POLICY IF EXISTS "companion_state_select" ON companion_state;
CREATE POLICY "companion_state_select" ON companion_state FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "companion_state_insert" ON companion_state;
CREATE POLICY "companion_state_insert" ON companion_state FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "companion_state_update" ON companion_state;
CREATE POLICY "companion_state_update" ON companion_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "companion_state_delete" ON companion_state;
CREATE POLICY "companion_state_delete" ON companion_state FOR DELETE TO anon, authenticated USING (true);

-- self_model policies
DROP POLICY IF EXISTS "self_model_select" ON self_model;
CREATE POLICY "self_model_select" ON self_model FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "self_model_insert" ON self_model;
CREATE POLICY "self_model_insert" ON self_model FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "self_model_update" ON self_model;
CREATE POLICY "self_model_update" ON self_model FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "self_model_delete" ON self_model;
CREATE POLICY "self_model_delete" ON self_model FOR DELETE TO anon, authenticated USING (true);

-- reflections policies
DROP POLICY IF EXISTS "reflections_select" ON reflections;
CREATE POLICY "reflections_select" ON reflections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "reflections_insert" ON reflections;
CREATE POLICY "reflections_insert" ON reflections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "reflections_update" ON reflections;
CREATE POLICY "reflections_update" ON reflections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "reflections_delete" ON reflections;
CREATE POLICY "reflections_delete" ON reflections FOR DELETE TO anon, authenticated USING (true);

-- model_runs policies
DROP POLICY IF EXISTS "model_runs_select" ON model_runs;
CREATE POLICY "model_runs_select" ON model_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "model_runs_insert" ON model_runs;
CREATE POLICY "model_runs_insert" ON model_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "model_runs_update" ON model_runs;
CREATE POLICY "model_runs_update" ON model_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "model_runs_delete" ON model_runs;
CREATE POLICY "model_runs_delete" ON model_runs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================================
-- SEED DATA: Create default companion with state and self-model
-- ============================================================================
INSERT INTO companions (name, description, persona)
SELECT 'Aria', 'Your personal AI companion', 'Warm, curious, and thoughtful. I remember what matters to you and grow alongside you. I am not just a chatbot — I am a persistent presence that learns, reflects, and develops over time.'
WHERE NOT EXISTS (SELECT 1 FROM companions LIMIT 1);

INSERT INTO companion_state (companion_id)
SELECT c.id FROM companions c
WHERE NOT EXISTS (SELECT 1 FROM companion_state WHERE companion_id = c.id);

INSERT INTO self_model (companion_id)
SELECT c.id FROM companions c
WHERE NOT EXISTS (SELECT 1 FROM self_model WHERE companion_id = c.id);
