import { authHeaders } from './auth';
export interface SupportAccount { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; banned_until: string | null }
export async function supportRequest(path: string, method = 'GET', signal?: AbortSignal) {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Lumen API address is missing.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetch(`${base}/v0.4/support/${path}`, { method, headers: await authHeaders(), signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Account support request failed.');
    return body;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
