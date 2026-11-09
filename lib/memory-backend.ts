import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './auth';
import {
  MemoryBackendTracker, REFRESH_EVERY_MS, RETRY_FAILED_MS, isCurrentSupabase,
  type BackendState,
} from './memory-backend-core';

export type { BackendState } from './memory-backend-core';
export { backendNotice, MUTATION_BLOCKED_MESSAGE } from './memory-backend-core';

// One tracker for the app, so every screen sees the same answer and an
// account switch resets it everywhere. See memory-backend-core.ts.
const tracker = new MemoryBackendTracker({
  baseUrl: () => process.env.EXPO_PUBLIC_LUMEN_API_URL,
  session: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return { userId: data.session.user.id, token: data.session.access_token };
  },
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
});

let started = false;
function startLifecycle() {
  if (started) return;
  started = true;
  // Reconnection and app activation both re-check.
  AppState.addEventListener('change', status => { if (status === 'active') void tracker.refresh(); });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => { void tracker.refresh(); });
    window.addEventListener('focus', () => { void tracker.refresh(); });
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    void tracker.setActiveUser(session?.user.id ?? null);
  });
}

export function useMemoryBackend() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<BackendState>(tracker.state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    startLifecycle();
    return tracker.subscribe(next => { setState(next); setNow(Date.now()); });
  }, []);

  useEffect(() => { void tracker.setActiveUser(userId); }, [userId]);

  // Keep the answer fresh, retry failures, and let staleness take effect.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      const age = Date.now() - tracker.state.checkedAt;
      const wait = tracker.state.kind === 'unavailable' ? RETRY_FAILED_MS : REFRESH_EVERY_MS;
      if (tracker.user && age >= wait) void tracker.refresh();
    }, 5_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(() => tracker.refresh(), []);
  // Await this immediately before every Supabase memory write.
  const authorizeMutation = useCallback(() => tracker.authorizeSupabaseMutation(), []);

  return {
    state,
    // Only a fresh "supabase" answer for this same account allows Supabase
    // memory reads or writes. Checking, failed, stale and RMC all mean no.
    canEditSupabase: isCurrentSupabase(state, userId, now) && tracker.user === userId,
    refresh,
    authorizeMutation,
  };
}
