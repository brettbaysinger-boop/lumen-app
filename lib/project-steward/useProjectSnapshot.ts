import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSnapshot, loadDemoSnapshot, type SnapshotResult } from './client';

export type SourceMode = 'demo' | 'live';

/**
 * Full URL of the read-only snapshot endpoint. Build-time public config; it is a URL
 * only, never a credential. Unset means "live source not configured".
 */
export const LIVE_SNAPSHOT_URL: string | undefined =
  process.env.EXPO_PUBLIC_PROJECT_STEWARD_SNAPSHOT_URL || undefined;

export function parseSourceMode(param: unknown): SourceMode | null {
  const v = Array.isArray(param) ? param[0] : param;
  return v === 'demo' || v === 'live' ? v : null;
}

/** Explicit mode wins; otherwise live when configured, else the labelled demo. */
export function defaultSourceMode(explicit: SourceMode | null): SourceMode {
  return explicit ?? (LIVE_SNAPSHOT_URL ? 'live' : 'demo');
}

// Shared between the overview and detail routes so navigating does not refetch.
const cache = new Map<SourceMode, SnapshotResult>();

export interface SnapshotState {
  result: SnapshotResult | null;
  loading: boolean;
  refresh: () => void;
}

export function useProjectSnapshot(mode: SourceMode): SnapshotState {
  const [result, setResult] = useState<SnapshotResult | null>(() => cache.get(mode) ?? null);
  const [loading, setLoading] = useState(!cache.has(mode));
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);

  useEffect(() => {
    const cached = cache.get(mode);
    if (cached && !forceRef.current) {
      setResult(cached);
      setLoading(false);
      return;
    }
    forceRef.current = false;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    const run = async () => {
      const r =
        mode === 'demo'
          ? loadDemoSnapshot()
          : await fetchSnapshot({ url: LIVE_SNAPSHOT_URL, signal: controller.signal });
      if (controller.signal.aborted) return;
      cache.set(mode, r);
      setResult(r);
      setLoading(false);
    };
    run().catch(() => {
      // Only reached when the request was aborted by unmount/mode change.
    });
    return () => controller.abort();
  }, [mode, nonce]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { result, loading, refresh };
}

/** Current time, re-rendered every minute so "3h ago" and STALE stay honest. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
