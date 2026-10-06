import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Companion, CompanionState, SelfModel } from '@/types/database';

export function useCompanion() {
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [state, setState] = useState<CompanionState | null>(null);
  const [selfModel, setSelfModel] = useState<SelfModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompanion = useCallback(async () => {
    try {
      setError(null);
      const { data: comp, error: compErr } = await supabase
        .from('companions')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (compErr) throw compErr;
      if (!comp) {
        setError('No companion found');
        setLoading(false);
        return;
      }

      setCompanion(comp as Companion);

      const { data: st, error: stErr } = await supabase
        .from('companion_state')
        .select('*')
        .eq('companion_id', comp.id)
        .maybeSingle();

      if (stErr) throw stErr;
      if (st) setState(st as CompanionState);

      const { data: sm, error: smErr } = await supabase
        .from('self_model')
        .select('*')
        .eq('companion_id', comp.id)
        .maybeSingle();

      if (smErr) throw smErr;
      if (sm) setSelfModel(sm as SelfModel);

      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load companion';
      setError(message);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadCompanion(); }, [loadCompanion]));

  const updateCompanion = useCallback(
    async (updates: Partial<Companion>) => {
      if (!companion) return;
      const { data, error: err } = await supabase
        .from('companions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', companion.id)
        .select()
        .single();
      if (err) throw err;
      setCompanion(data as Companion);
    },
    [companion]
  );

  const updateState = useCallback(
    async (updates: Partial<CompanionState>) => {
      if (!companion) return;
      const { data, error: err } = await supabase
        .from('companion_state')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('companion_id', companion.id)
        .select()
        .single();
      if (err) throw err;
      setState(data as CompanionState);
    },
    [companion]
  );

  const updateSelfModel = useCallback(
    async (updates: Partial<SelfModel>) => {
      if (!companion) return;
      const { data, error: err } = await supabase
        .from('self_model')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('companion_id', companion.id)
        .select()
        .single();
      if (err) throw err;
      setSelfModel(data as SelfModel);
    },
    [companion]
  );

  return {
    companion,
    state,
    selfModel,
    loading,
    error,
    reload: loadCompanion,
    updateCompanion,
    updateState,
    updateSelfModel,
  };
}
