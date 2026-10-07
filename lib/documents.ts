import { authHeaders } from './auth';
export interface PrivateDocument { id: string; title: string; kind: string; page_count: number; created_at: string }
export interface DocumentSource { number: number; document_id: string; title: string; page: number; excerpt: string }
export interface DocumentHit { document_id: string; title: string; page: number; content: string }

export async function documentRequest<T>(companion: string, path = '', method = 'GET', body?: unknown): Promise<T> {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Lumen API address is missing.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    const response = await fetch(`${base}/v0.6/documents/companions/${encodeURIComponent(companion)}${path}`, {
      method, headers: { ...await authHeaders(), ...(form ? {} : { 'Content-Type':'application/json' }) },
      ...(body === undefined ? {} : { body: form ? body as FormData : JSON.stringify(body) }), signal: controller.signal,
    });
    const result = await response.json().catch(() => ({detail:'Document service error. Check the migration and API logs.'}));
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Document request failed. Check the API and document migration.');
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Document request timed out. Refresh the list before retrying an upload.');
    throw error;
  } finally { clearTimeout(timer); }
}
