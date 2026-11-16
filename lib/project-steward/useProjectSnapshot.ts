import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { projectSnapshotUrl } from './snapshot-url';
import { fetchSnapshot, loadDemoSnapshot, type SnapshotResult } from './client';

export type SourceMode = 'demo' | 'live';

export const LIVE_SNAPSHOT_URL = projectSnapshotUrl(process.env.EXPO_PUBLIC_LUMEN_API_URL);

export function parseSourceMode(param: unknown): SourceMode | null {
  const v = Array.isArray(param) ? param[0] : param;
  return v === 'demo' || v === 'live' ? v : null;
}

export function defaultSourceMode(explicit: SourceMode | null): SourceMode {
  return explicit ?? (LIVE_SNAPSHOT_URL ? 'live' : 'demo');
}

// Only the public, explicitly marked demo can be cached across routes.
// Authenticated project data is NEVER cached across accounts.
let demoCache: SnapshotResult | null = null;

export interface SnapshotState {
  result: SnapshotResult | null;
  loading: boolean;
  refresh: () => void;
}

export function useProjectSnapshot(mode: SourceMode): SnapshotState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const userRef = useRef(userId);
  userRef.current = userId;
  const [result, setResult] = useState<SnapshotResult | null>(
    () => mode === 'demo' ? demoCache : null,
  );
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const forceGitRefresh = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setResult(null);

    const run = async () => {
      if (mode === 'demo') {
        const demo = demoCache ?? loadDemoSnapshot();
        demoCache = demo;
        if (active) { setResult(demo); setLoading(false); }
        return;
      }

      if (!LIVE_SNAPSHOT_URL || !userId) {
        if (active) {
          setResult(LIVE_SNAPSHOT_URL
            ? { status: 'unauthorized', httpStatus: 401 }
            : { status: 'missing', reason: 'not_configured' });
          setLoading(false);
        }
        return;
      }

      // Resolve a fresh session, not a cached bearer from a previous user.
      const auth = await supabase.auth.getSession();
      const token = auth.data.session?.access_token;
      if (auth.error || !token || auth.data.session?.user.id !== userId ||
          userRef.current !== userId) {
        if (active) { setResult({ status: 'unauthorized', httpStatus: 401 }); setLoading(false); }
        return;
      }

      const refresh = forceGitRefresh.current;
      forceGitRefresh.current = false;
      // Refresh triggers a bounded background Git GET job in the backend.
      // It does NOT block the HTTP snapshot response.
      const url = LIVE_SNAPSHOT_URL + (refresh ? '?refresh=true' : '');
      const response = await fetchSnapshot({
        url,
        signal: controller.signal,
        getAuthorization: async () => 'Bearer ' + token,
      });

      // Never display an authenticated response after sign-out or account switch.
      const latest = await supabase.auth.getSession();
      if (!active || controller.signal.aborted) return;
      if (latest.error || !latest.data.session ||
          latest.data.session.user.id !== userId ||
          latest.data.session.access_token !== token ||
          userRef.current !== userId) {
        setResult({ status: 'unauthorized', httpStatus: 401 });
      } else {
        setResult(response);
      }
      setLoading(false);
    };
    run().catch(() => {
      if (!active || controller.signal.aborted) return;
      setResult({ status: 'offline', detail: 'Project data is unavailable.' });
      setLoading(false);
    });

    return () => { active = false; controller.abort(); };
  }, [mode, nonce, userId]);

  // Re-read cached server snapshot on a bounded timer so an asynchronously
  // completed GitHub refresh becomes visible without repeated Git API calls.
  useEffect(() => {
    if (mode !== 'live' || !userId) return;
    const timer = setInterval(() => setNonce(v => v + 1), 60_000);
    return () => clearInterval(timer);
  }, [mode, userId]);

  const refresh = useCallback(() => {
    if (mode === 'live') forceGitRefresh.current = true;
    setNonce(v => v + 1);
  }, [mode]);

  return { result, loading, refresh };
}

/** Relative ages and STALE labels tick each minute. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
