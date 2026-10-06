import { Platform } from 'react-native';
import { requestKey, userTimezone } from './my-day';
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

const IMAGE_REQUEST = /\b(generate|create|make|draw|paint|sketch|design|render|illustrate)\b[^.?!]{0,80}\b(image|picture|pic|photo|drawing|painting|illustration|artwork|art|portrait|wallpaper|logo|sketch)\b|\b(show|send)\b[^.?!]{0,40}\b(image|picture|pic|photo|drawing|portrait)\b/i;

export function isImageRequest(text: string): boolean {
  return IMAGE_REQUEST.test(text);
}

export async function generateImage(
  companionId: string,
  conversationId: string | null,
  prompt: string,
): Promise<{ conversation_id: string; message_id: string }> {
  const baseUrl = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Set EXPO_PUBLIC_LUMEN_API_URL to your Lumen server address, then restart Expo.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);

  try {
    const response = await fetch(`${baseUrl}/v0.2/images/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({
        companion_id: companionId,
        conversation_id: conversationId,
        prompt,
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof body?.detail === 'string'
          ? body.detail
          : 'The image could not be created. Please try again.',
      );
    }

    if (
      !body ||
      typeof body.conversation_id !== 'string' ||
      typeof body.message_id !== 'string'
    ) {
      throw new Error('Lumen returned an invalid image response.');
    }

    return {
      conversation_id: body.conversation_id,
      message_id: body.message_id,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Image generation timed out. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach Lumen. Check the API address, server, and network connection.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function respondToMessage(
  companionId: string,
  conversationId: string | null,
  message: string,
  attachments: MessageAttachment[] = [],
  onEvent?: (event: { type: string; text: string }) => void,
  turnKey?: string,
): Promise<RespondResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Set EXPO_PUBLIC_LUMEN_API_URL to your Lumen server address, then restart Expo.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);
  try {
    const response = await fetch(`${baseUrl}${onEvent && Platform.OS === "web" ? "/v0.2/respond/stream" : "/v0.1/respond"}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ companion_id: companionId, conversation_id: conversationId, message, attachments, timezone: userTimezone(), request_id: turnKey || requestKey() }),
      signal: controller.signal,
    });
    if (onEvent && Platform.OS === 'web' && response.ok) {
      if (!response.body) throw new Error('Streaming unavailable. Reload before retrying.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done: RespondResponse | null = null;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.text);
        if (event.type === 'done') done = event.response;
        else onEvent(event);
      };
      try {
        while (true) {
          const chunk = await reader.read();
          buffer += decoder.decode(chunk.value, { stream: !chunk.done });
          let split;
          while ((split = buffer.indexOf('\n')) >= 0) {
            consume(buffer.slice(0, split)); buffer = buffer.slice(split + 1);
          }
          if (chunk.done) break;
        }
        consume(buffer);
      } finally { reader.releaseLock(); }
      if (!done) throw new Error('Reply interrupted. Reload before retrying.');
      return done;
    }
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
