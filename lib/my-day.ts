import { authHeaders } from './auth';
export type DayKind = 'task' | 'reminder' | 'note' | 'list' | 'project' | 'goal';
export interface DayItem {
 id: string; companion_id: string; kind: DayKind; title: string; body: string;
 checklist: { text: string; done: boolean }[]; status: 'open' | 'done' | 'archived';
 due_at: string | null; timezone: string; source_conversation_id: string | null; created_at: string;
}
export interface DayAlert { id: string; item_id: string; title: string; due_at: string; seen_at: string | null }
export interface SearchHit { id: string; kind: string; content: string; conversation_id: string | null; created_at: string }
export function requestKey() {
 if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const n = Math.floor(Math.random()*16); return (char === 'x' ? n : (n & 3) | 8).toString(16); });
}
export function userTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
export async function dayRequest<T>(companionId: string, path = '', method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
 const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
 if (!base) throw new Error('Lumen API address is missing.');
 const controller = new AbortController(); const abort = () => controller.abort();
 signal?.addEventListener('abort', abort); if (signal?.aborted) controller.abort();
 const timeout = setTimeout(abort, 25000);
 try {
  const response = await fetch(`${base}/v0.3/my-day/companions/${encodeURIComponent(companionId)}${path}`, { method, headers: { 'Content-Type': 'application/json', ...await authHeaders() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : 'Could not update My Day. Check the latest migration and API connection.');
  return value;
 } catch (e) { if (controller.signal.aborted && !signal?.aborted) throw new Error('My Day timed out. Reload before retrying.'); throw e; }
 finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export const listDayItems = (id: string, signal?: AbortSignal) => dayRequest<DayItem[]>(id, '', 'GET', undefined, signal);
export const updateDayItem = (id: string, itemId: string, value: Partial<DayItem>) => dayRequest<DayItem>(id, `/items/${encodeURIComponent(itemId)}`, 'PATCH', value);
export const dueReminders = (id: string, signal?: AbortSignal) => dayRequest<DayAlert[]>(id, '/due', 'GET', undefined, signal);
