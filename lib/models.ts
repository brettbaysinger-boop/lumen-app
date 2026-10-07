import { authHeaders } from './auth';

export interface ModelOptions {
  models: string[];
  vision?: boolean | null;
  selected: string | null;
  effective: string;
  default: string;
  memory_model: string;
}

export async function modelRequest(companionId: string, model?: string | null) {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Lumen API address is missing.');
  const saving = model !== undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${base}/v0.2/companions/${encodeURIComponent(companionId)}/${saving ? 'model' : 'models'}`, {
      method: saving ? 'PUT' : 'GET',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      ...(saving ? { body: JSON.stringify({ model }) } : {}),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Model settings request failed.');
    return body;
  } finally { clearTimeout(timeout); }
}
