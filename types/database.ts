export type MemoryType =
  | 'episodic'
  | 'semantic'
  | 'preference'
  | 'relationship'
  | 'autobiographical'
  | 'procedural';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Companion {
  auto_memory_enabled?: boolean;
  conversation_model?: string | null;
  id: string;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  persona: string;
  system_prompt: string | null;
  voice_enabled: boolean;
  vision_enabled: boolean;
  portrait_url: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  companion_id: string;
  title: string;
  summary: string | null;
  is_active: boolean;
  message_count: number;
  started_at: string;
  last_message_at: string;
  ended_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  companion_id: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown>;
  model_used: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}

export type MemorySubject = 'user' | 'companion' | 'shared' | 'unknown';

export interface Memory {
  id: string;
  subject: MemorySubject;
  subject_user_id: string | null;
  reported_by_user_id: string | null;
  occurred_at: string | null;
  companion_id: string;
  conversation_id: string | null;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanionState {
  id: string;
  companion_id: string;
  attention: number;
  energy: number;
  curiosity: number;
  confidence: number;
  uncertainty: number;
  social_engagement: number;
  task_focus: number;
  novelty: number;
  current_goal: string | null;
  current_context: string | null;
  updated_at: string;
}

export interface SelfModel {
  id: string;
  companion_id: string;
  identity: {
    name: string;
    description: string;
  };
  autobiography: Array<{ text: string; date: string }>;
  beliefs: Array<{ text: string; confidence: number }>;
  goals: Array<{ text: string; priority: string; status: string }>;
  values: Array<{ text: string; importance: number }>;
  uncertainties: Array<{ text: string; context: string }>;
  relationships: Array<{ name: string; nature: string; notes: string }>;
  capabilities: string[];
  limitations: string[];
  updated_at: string;
}

export interface Reflection {
  id: string;
  companion_id: string;
  conversation_id: string | null;
  summary: string;
  insights: Array<{ text: string; type: string }>;
  memories_formed: Array<{ type: string; content: string }>;
  state_changes: Record<string, { from: number; to: number }>;
  beliefs_changed: Array<{ text: string; change: string }>;
  model_used: string | null;
  created_at: string;
}

export type GalleryCategory = 'moment' | 'user_showed' | 'companion_sent';
export type GallerySource = 'user' | 'companion';
export type GalleryMediaType = 'image' | 'video';

export interface GalleryItem {
  id: string;
  companion_id: string;
  conversation_id: string | null;
  source: GallerySource;
  category: GalleryCategory;
  media_type: GalleryMediaType;
  url: string;
  caption: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ModelRun {
  id: string;
  companion_id: string | null;
  conversation_id: string | null;
  task: string;
  selected_model: string;
  provider: string;
  reason: Record<string, unknown>;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  success: boolean;
  error: string | null;
  created_at: string;
}
