// Which memory store the Lumen server is using, decided fail-closed.
//
// The Memories screen, chat memory notices, suggestion review and correction
// undo all write the Supabase memory tables directly. When the server uses the
// Raialume Memory Core (RMC) instead, those writes would create a second,
// divergent store. So the app may only touch Supabase memories when the server
// has said "supabase" for the SAME signed-in account, recently. Anything else
// (no answer yet, network or HTTP error, odd response, account change, stale
// answer) means: no Supabase memory reads or writes.
//
// A remembered answer is only a display hint. Every write asks the server
// again first (authorizeSupabaseMutation).
//
// This file has no React Native imports so it can be tested in node.

export type BackendKind = 'checking' | 'supabase' | 'rmc' | 'unavailable';

export interface BackendState {
  kind: BackendKind;
  userId: string | null;
  checkedAt: number;
  reason?: string;
}

export interface BackendDeps {
  baseUrl: () => string | undefined;
  // The currently signed-in account and its access token, or null.
  session: () => Promise<{ userId: string; token: string } | null>;
  fetch: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
    ok: boolean; status: number; json: () => Promise<unknown>;
  }>;
  now: () => number;
  timeoutMs?: number;
}

// An answer older than this no longer allows editing Supabase memories.
export const MAX_AGE_MS = 30_000;
// Refresh well before an answer goes stale, so normal use never flickers.
export const REFRESH_EVERY_MS = 15_000;
// How soon to try again after a failed check.
export const RETRY_FAILED_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const unavailable = (userId: string | null, now: number, reason: string): BackendState =>
  ({ kind: 'unavailable', userId, checkedAt: now, reason });

export async function probeMemoryBackend(deps: BackendDeps, expectedUserId: string | null): Promise<BackendState> {
  const started = deps.now();
  if (!expectedUserId) return unavailable(null, started, 'signed_out');
  const base = deps.baseUrl()?.trim().replace(/\/+$/, '');
  if (!base) return unavailable(expectedUserId, started, 'not_configured');
  let session;
  try { session = await deps.session(); } catch { return unavailable(expectedUserId, started, 'session_error'); }
  if (!session || session.userId !== expectedUserId) return unavailable(expectedUserId, started, 'account_changed');

  const limit = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response;
  try {
    response = await Promise.race([
      deps.fetch(`${base}/v0.2/memory/backend`, {
        headers: { Authorization: `Bearer ${session.token}` }, signal: controller?.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(new Error('timeout')); }, limit);
      }),
    ]);
  } catch {
    return unavailable(expectedUserId, deps.now(), 'network');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  // A 404 may be an old server or a wrong address; neither proves Supabase.
  if (!response.ok) return unavailable(expectedUserId, deps.now(), `http_${response.status}`);
  let body: unknown;
  try { body = await response.json(); } catch { return unavailable(expectedUserId, deps.now(), 'invalid_response'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return unavailable(expectedUserId, deps.now(), 'invalid_response');
  const keys = Object.keys(body);
  const backend = (body as { backend?: unknown }).backend;
  if (keys.length !== 1 || keys[0] !== 'backend' || (backend !== 'supabase' && backend !== 'rmc')) {
    return unavailable(expectedUserId, deps.now(), 'invalid_response');
  }
  // The account must not have changed while we waited.
  let after;
  try { after = await deps.session(); } catch { return unavailable(expectedUserId, deps.now(), 'session_error'); }
  if (!after || after.userId !== expectedUserId) return unavailable(expectedUserId, deps.now(), 'account_changed');
  // Freshness is measured from when the question was asked.
  return { kind: backend, userId: expectedUserId, checkedAt: started };
}

export function isCurrentSupabase(state: BackendState, userId: string | null | undefined, now: number): boolean {
  return state.kind === 'supabase' && !!userId && state.userId === userId
    && now - state.checkedAt >= 0 && now - state.checkedAt <= MAX_AGE_MS;
}

export class MemoryBackendTracker {
  private generation = 0;
  private activeUser: string | null = null;
  private listeners = new Set<(state: BackendState) => void>();
  state: BackendState;

  constructor(private deps: BackendDeps) {
    this.state = { kind: 'checking', userId: null, checkedAt: 0 };
  }

  subscribe(listener: (state: BackendState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(state: BackendState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  get user(): string | null { return this.activeUser; }

  // Call on every sign-in, sign-out or account switch.
  setActiveUser(userId: string | null): Promise<BackendState> {
    if (userId !== this.activeUser) {
      this.activeUser = userId;
      this.generation++;
      // Never carry another account's answer over.
      this.set(userId ? { kind: 'checking', userId, checkedAt: 0 } : unavailable(null, this.deps.now(), 'signed_out'));
    }
    return this.refresh();
  }

  // Ask the server again. Only the newest question for the current account
  // may change the state, so a slow old answer can never win a race.
  async refresh(): Promise<BackendState> {
    const generation = ++this.generation;
    const userId = this.activeUser;
    const result = await probeMemoryBackend(this.deps, userId);
    if (generation !== this.generation || userId !== this.activeUser) return this.state;
    this.set(result);
    return result;
  }

  canEditSupabase(): boolean {
    return isCurrentSupabase(this.state, this.activeUser, this.deps.now());
  }

  // Call immediately before any Supabase memory write. Always asks the
  // server; a remembered answer is never enough.
  async authorizeSupabaseMutation(): Promise<boolean> {
    const userId = this.activeUser;
    if (!userId) return false;
    // Use this call's own answer, never whatever state another check left.
    const generation = ++this.generation;
    const result = await probeMemoryBackend(this.deps, userId);
    if (userId !== this.activeUser) return false;
    if (generation === this.generation) this.set(result);
    return result.userId === userId && isCurrentSupabase(result, userId, this.deps.now());
  }
}

export function backendNotice(state: BackendState, companionName: string): string {
  if (state.kind === 'rmc') {
    return `${companionName} now keeps long-term memories in the Raialume Memory Core. Viewing and editing them here is not available yet. You can still ask in chat what is remembered, or say “remember that” followed by a fact.`;
  }
  if (state.kind === 'checking') return 'Checking which memory store is active…';
  return 'Lumen could not confirm which memory store is active, so memories can’t be viewed or changed here right now. Nothing has been changed. This will retry automatically.';
}

export const MUTATION_BLOCKED_MESSAGE =
  'Lumen could not confirm that this memory store is active, so nothing was changed. Try again in a moment.';
