import { AppState, Platform } from 'react-native';
import { chatRead } from './chat-read';
import { chatCache } from './chat-cache-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string | null; retry: () => void; setupCompanionId: string | null }>({
  session: null, loading: true, error: null, retry: () => {}, setupCompanionId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ userId: string; companionId: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (next && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) chatCache.activate(next.user.id);
      if (event === 'SIGNED_OUT') void chatCache.clearAll().catch(() => {});
      if (active) { setSession(next); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (active) { setSession(data.session); setError(err?.message || null); setLoading(false); }
    }).catch(() => { if (active) { setError('Could not load your session. Try signing in again.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const refresh = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', refresh);
    return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setReadyUserId(null);
    setSetup(null);
    setError(null);
    if (!userId) return;
    void (async () => {
      const cached = await chatCache.read(userId);
      if (!active) return;
      if (cached) {
        setReadyUserId(userId);
        if (cached.companion.setup_completed_at === null) setSetup({ userId, companionId: cached.companion.id });
      }
      try {
        const { data: companionId, error: err } = await supabase.rpc('ensure_my_companion', { display_name: session?.user.user_metadata?.display_name || session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || 'User' });
        if (!active) return;
        if (err) { if (!cached) setError(err.message); return; }
        const { data: companion, error: lookupError } = await chatRead(signal => supabase.from('companions')
          .select('id,setup_completed_at').eq('id', companionId).eq('owner_user_id', userId).abortSignal(signal).single());
        if (!active) return;
        if (lookupError || !companion) { if (!cached) setError(lookupError?.message || 'Companion unavailable.'); return; }
        setSetup(companion.setup_completed_at === null ? { userId, companionId: companion.id } : null);
        setReadyUserId(userId);
      } catch {
        if (active && !cached) setError('Could not set up your companion. Retry when the connection is restored.');
      }
    })();
    return () => { active = false; };
  }, [userId, attempt]);
  return <AuthContext.Provider value={{ session, loading: loading || (!!session && readyUserId !== userId && !error), error, setupCompanionId: setup && setup.userId === userId ? setup.companionId : null, retry: () => setAttempt(v => v + 1) }}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sign in to Lumen first.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}
