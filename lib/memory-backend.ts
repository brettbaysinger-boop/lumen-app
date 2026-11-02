import { useEffect, useState } from 'react';
import { authHeaders } from './auth';

// Which store holds this Lumen server's memories. 'rmc' means the installed
// Raialume Memory Core is the only memory store, so the Supabase memory
// screens (list, add, edit, delete, suggestions, undo) must not be used:
// writing there would create a second, divergent memory store.
export type MemoryBackend = 'supabase' | 'rmc' | 'checking';

let cached: MemoryBackend | null = null;

export async function fetchMemoryBackend(): Promise<MemoryBackend> {
  const baseUrl = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) return cached ?? 'supabase';
  try {
    const response = await fetch(`${baseUrl}/v0.2/memory/backend`, { headers: await authHeaders() });
    // Servers from before this flag existed only have the Supabase store.
    if (response.status === 404) return (cached = 'supabase');
    if (!response.ok) return cached ?? 'supabase';
    const body = await response.json();
    if (body?.backend === 'rmc' || body?.backend === 'supabase') return (cached = body.backend);
  } catch {
    // Keep the last answer; the server enforces the store either way.
  }
  return cached ?? 'supabase';
}

export function useMemoryBackend(): MemoryBackend {
  const [backend, setBackend] = useState<MemoryBackend>(cached ?? 'checking');
  useEffect(() => {
    let active = true;
    fetchMemoryBackend().then(value => { if (active) setBackend(value); });
    return () => { active = false; };
  }, []);
  return backend;
}
