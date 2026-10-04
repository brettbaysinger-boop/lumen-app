import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string | null; retry: () => void }>({
  session: null, loading: true, error: null, retry: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (active) { setSession(data.session); setError(err?.message || null); setLoading(false); }
    }).catch(() => { if (active) { setError('Could not load your session. Try signing in again.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setReadyUserId(null);
    setError(null);
    if (!userId) return;
    Promise.resolve(supabase.rpc('ensure_my_companion', { display_name: session?.user.user_metadata?.display_name || 'User' }))
      .then(({ error: err }) => { if (active) { setError(err?.message || null); setReadyUserId(err ? null : userId); } })
      .catch(() => { if (active) setError('Could not set up your companion. Retry when the connection is restored.'); });
    return () => { active = false; };
  }, [userId, attempt]);
  return <AuthContext.Provider value={{ session, loading: loading || (!!session && readyUserId !== userId && !error), error, retry: () => setAttempt(v => v + 1) }}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sign in to Lumen first.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}
