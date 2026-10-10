import { authHeaders } from './auth';

export interface DocumentStyle {
  company_name: string;
  contact_line: string;
  accent: string;
  page_size: 'letter' | 'a4';
  spacing: 'compact' | 'comfortable';
  header_alignment: 'left' | 'center';
  logo_png: string | null;
}
export const defaultDocumentStyle: DocumentStyle = {
  company_name: '', contact_line: '', accent: '#243447', page_size: 'letter',
  spacing: 'compact', header_alignment: 'left', logo_png: null,
};

export async function styleRequest<T>(owner: string, path = '', method = 'GET', body?: unknown, pdf = false): Promise<T> {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Lumen API address is missing.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const form = body instanceof FormData;
  try {
    const response = await fetch(`${base}/v0.6/document-style${path}`, {
      method, headers: {...await authHeaders(), 'X-Document-Style-Owner': owner, ...(form ? {} : {'Content-Type': 'application/json'})},
      ...(body === undefined ? {} : {body: form ? body : JSON.stringify(body)}), signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(typeof error?.detail === 'string' ? error.detail : 'Document style request failed.');
    }
    if (pdf) {
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Unexpected preview response.');
      return await response.blob() as T;
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Document style request timed out. Reload the saved style before retrying a save.');
    throw error;
  } finally {clearTimeout(timer);}
}
