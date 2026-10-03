export interface RespondResponse {
  conversation_id: string;
  message_id: string;
  content: string;
  model: string;
  provider: string;
  latency_ms: number;
  memory_count: number;
}

export async function respondToMessage(
  companionId: string,
  conversationId: string | null,
  message: string,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companion_id: companionId, conversation_id: conversationId, message }),
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
