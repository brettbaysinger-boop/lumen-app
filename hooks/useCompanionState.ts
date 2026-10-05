import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CompanionState } from '@/types/database';

export function useCompanionState(companionId: string | null | undefined) {
  const [state, setState] = useState<CompanionState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companionId) {
      setState(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from('companion_state')
      .select('*')
      .eq('companion_id', companionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          if (!error && data) setState(data as CompanionState);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [companionId]);

  return { state, loading };
}

export type Mood = 'curious' | 'content' | 'thinking' | 'resting' | 'idle';

export function getMoodFromState(state: CompanionState | null): Mood {
  if (!state) return 'idle';
  if (state.curiosity > 0.7) return 'curious';
  if (state.energy > 0.7 && state.attention > 0.5) return 'content';
  if (state.attention > 0.6) return 'thinking';
  if (state.energy < 0.3) return 'resting';
  return 'idle';
}

export function getMoodLabel(mood: Mood): string {
  return { curious: 'Curious', content: 'Engaged', thinking: 'Focused', resting: 'Resting', idle: 'Present' }[mood];
}
