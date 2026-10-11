import { authHeaders } from './auth';

export async function generatePortrait(companionId: string, appearance: string, style: string, signal: AbortSignal): Promise<string> {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Image server address is missing.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 660_000);
  try {
    const response = await fetch(`${base}/v0.2/companions/${encodeURIComponent(companionId)}/portrait-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ appearance: appearance.trim(), style: style.trim() }), signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not generate a portrait.');
    if (typeof body?.path !== 'string') throw new Error('Invalid portrait response.');
    return body.path;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
