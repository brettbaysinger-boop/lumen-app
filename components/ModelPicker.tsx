import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { modelRequest, type ModelOptions } from '@/lib/models';

export function ModelPicker({ companionId, compact = false, disabled = false }: {
  companionId: string; compact?: boolean; disabled?: boolean;
}) {
  const { colors: c } = useTheme();
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setOptions(null); setError('');
    modelRequest(companionId).then(value => { if (active) setOptions(value); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [companionId]));
  const refresh = async () => {
    setBusy(true); setError('');
    try { setOptions(await modelRequest(companionId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load models.'); }
    finally { setBusy(false); }
  };
  const choose = async (model: string | null) => {
    setBusy(true); setError('');
    try {
      const saved = await modelRequest(companionId, model);
      setOptions(previous => previous ? { ...previous, ...saved } : previous);
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save model.'); }
    finally { setBusy(false); }
  };
  return <View style={{ maxWidth: '100%', paddingVertical: compact ? 0 : 8 }}>
    <TouchableOpacity disabled={disabled || busy} onPress={() => { setOpen(true); void refresh(); }}
      accessibilityRole="button" accessibilityLabel="Change conversation model">
      <Text numberOfLines={compact ? 1 : 2} style={{ color: c.primary[300], fontSize: compact ? 12 : 16 }}>
        {compact ? '' : 'Conversation model: '}{options?.effective || (error ? 'Model unavailable · tap to retry' : 'Loading model…')} ▾
      </Text>
    </TouchableOpacity>
    {!compact && <Text style={{ color: c.neutral[400], marginTop: 6 }}>Applies to the next reply. Memories and history stay with your companion.</Text>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: c.neutral[900], padding: 20, borderRadius: 16, maxHeight: '85%', width: '100%', maxWidth: 600, alignSelf: 'center' }}>
          <Text style={{ color: c.neutral[100], fontSize: 20, marginBottom: 12 }}>Conversation model</Text>
          <Text style={{ color: c.neutral[400], marginBottom: 12 }}>Memory extraction: {options?.memory_model || 'backend configuration'}</Text>
          {!!error && <Text accessibilityRole="alert" style={{ color: c.error[400], marginBottom: 12 }}>{error}</Text>}
          {busy && <ActivityIndicator color={c.primary[400]} />}
          <ScrollView>
            {options && <TouchableOpacity disabled={busy} onPress={() => void choose(null)} style={{ paddingVertical: 14 }}>
              <Text style={{ color: c.neutral[100] }}>{options.selected === null ? '✓ ' : ''}Use backend default ({options.default})</Text>
            </TouchableOpacity>}
            {options?.models.map(model => <TouchableOpacity key={model} disabled={busy} onPress={() => void choose(model)} style={{ paddingVertical: 14 }}>
              <Text style={{ color: options.selected === model ? c.primary[300] : c.neutral[100] }}>{options.selected === model ? '✓ ' : ''}{model}</Text>
            </TouchableOpacity>)}
            {options?.models.length === 0 && <Text style={{ color: c.neutral[400] }}>No installed models found on Lumen's Ollama server.</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
            <TouchableOpacity disabled={busy} onPress={() => void refresh()}><Text style={{ color: c.primary[300] }}>Refresh</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => setOpen(false)}><Text style={{ color: c.neutral[200] }}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}
