// Typed, read-only client for the Project Steward snapshot API.
//
// Contract: contracts/project-steward/project-snapshot.v1.schema.json.
// The endpoint does not exist yet (Gemini lane, PS-02). Failures are returned as
// explicit states; this client NEVER falls back to fixture data. Demo data is only
// shown when the caller asks for it, and the UI labels it.

import { demoSnapshot } from './fixtures';
import type { DataOrigin, ProjectSnapshot } from './types';
import { validateSnapshot } from './validate';

export const DEFAULT_TIMEOUT_MS = 10_000;

export type SnapshotResult =
  | {
      status: 'ok';
      origin: DataOrigin;
      snapshot: ProjectSnapshot;
      /** When this client received the data (not when the server checked sources). */
      receivedAt: string;
    }
  | { status: 'unauthorized'; httpStatus: 401 | 403 }
  | { status: 'offline'; detail: string }
  | { status: 'timeout'; timeoutMs: number }
  | { status: 'missing'; reason: 'not_configured' | 'not_found' | 'empty_body' }
  | { status: 'invalid'; errors: string[] }
  | { status: 'http_error'; httpStatus: number };

export type SnapshotStatus = SnapshotResult['status'];

export interface FetchSnapshotOptions {
  /** Full snapshot URL. Empty/undefined means the live source is not configured. */
  url: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * Optional owner-auth header provider. The contract does not yet define the auth
   * scheme (see PR notes), so nothing is wired by default. Never pass a GitHub token.
   */
  getAuthorization?: () => Promise<string | null>;
  signal?: AbortSignal;
  now?: () => Date;
}

export async function fetchSnapshot(opts: FetchSnapshotOptions): Promise<SnapshotResult> {
  const url = opts.url?.trim();
  if (!url) return { status: 'missing', reason: 'not_configured' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? (() => new Date());

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = opts.getAuthorization ? await opts.getAuthorization() : null;
    if (auth) headers.Authorization = auth;

    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
    } catch (err) {
      if (timedOut) return { status: 'timeout', timeoutMs };
      if (opts.signal?.aborted) throw err;
      return { status: 'offline', detail: err instanceof Error ? err.message : String(err) };
    }

    if (res.status === 401 || res.status === 403) {
      return { status: 'unauthorized', httpStatus: res.status };
    }
    if (res.status === 404) return { status: 'missing', reason: 'not_found' };
    if (!res.ok) return { status: 'http_error', httpStatus: res.status };

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      if (timedOut) return { status: 'timeout', timeoutMs };
      if (opts.signal?.aborted) throw err;
      return { status: 'offline', detail: err instanceof Error ? err.message : String(err) };
    }
    if (text.trim() === '') return { status: 'missing', reason: 'empty_body' };

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: 'invalid', errors: ['response is not valid JSON'] };
    }
    const v = validateSnapshot(body);
    if (!v.ok) return { status: 'invalid', errors: v.errors };
    return {
      status: 'ok',
      origin: 'live-api',
      snapshot: v.snapshot,
      receivedAt: now().toISOString(),
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** The offline demo. Validated like live data so the fixture cannot drift from the contract. */
export function loadDemoSnapshot(now: () => Date = () => new Date()): SnapshotResult {
  const v = validateSnapshot(demoSnapshot);
  if (!v.ok) return { status: 'invalid', errors: v.errors };
  return {
    status: 'ok',
    origin: 'demo-fixture',
    snapshot: v.snapshot,
    receivedAt: now().toISOString(),
  };
}
