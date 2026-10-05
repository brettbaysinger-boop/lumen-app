import { authHeaders } from './auth';

export interface RespondResponse {
  conversation_id: string;
  message_id: string;
  content: string;
  model: string;
  provider: string;
  latency_ms: number;
  memory_count: number;
  memory_subject?: 'user' | 'companion' | 'shared' | 'unknown' | null;
  memory_status?: 'none' | 'saved' | 'existing' | 'deleted' | 'clarification_needed';
}

export interface MessageAttachment {
  path: string;
  mime_type: string;
}

const IMAGE_REQUEST = /\b(generate|create|make|draw|paint|sketch|design|render|illustrate)\b[^.?!]{0,60}\b(image|picture|pic|photo|drawing|painting|illustration|artwork|art|portrait|wallpaper|logo|sketch)\b|\b(show me|send me)\s+(an?\s+)?(image|picture|pic|photo|drawing)\s+of\b/i;

export function isImageRequest(text: string): boolean {
  return IMAGE_REQUEST.test(text);
}

export async function generateImage(
  companionId: string,
  conversationId: string | null,
  prompt: string,
): Promise<{ conversation_id: string; message_id: string }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Apikey: anonKey ?? '', ...await authHeaders() },
      body: JSON.stringify({ companion_id: companionId, conversation_id: conversationId, prompt }),
    });
  } catch {
    throw new Error('Could not reach the image service. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'The image could not be created. Please try again.');
  }
  if (!body || typeof body.conversation_id !== 'string' || typeof body.message_id !== 'string') {
    throw new Error('The image could not be created. Please try again.');
  }
  return body;
}

export async function respondToMessage(
  companionId: string,
  conversationId: string | null,
  message: string,
  attachments: MessageAttachment[] = [],
): Promise<RespondResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Set EXPO_PUBLIC_LUMEN_API_URL to your Lumen server address, then restart Expo.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${baseUrl}/v0.1/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ companion_id: companionId, conversation_id: conversationId, message, attachments }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.detail === 'string' ? body.detail : `Lumen request failed (${response.status}).`);
    }
    if (!body || typeof body.conversation_id !== 'string' || typeof body.message_id !== 'string' || typeof body.content !== 'string') {
      throw new Error('Lumen returned an invalid response.');
    }
    return body as RespondResponse;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Lumen timed out. Reload the conversation before retrying; the server may still finish this turn.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach Lumen. Check the API address, server, and network connection. Reload before retrying.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
