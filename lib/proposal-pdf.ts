import { authHeaders } from './auth';

export async function proposalPDF(companion: string, message: string, title: string, body: string): Promise<Blob> {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Lumen API address is missing.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${base}/v0.6/documents/companions/${encodeURIComponent(companion)}/drafts/${encodeURIComponent(message)}/pdf`, {
      method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({title: title.trim(), body}), signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(typeof error?.detail === 'string' ? error.detail : 'PDF export failed. Review the draft and source references.');
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('PDF service returned an unexpected response.');
    return await response.blob();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('PDF export timed out. Try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
