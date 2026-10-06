import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { chooseVoice, getVoiceOptions, playReply, type VoiceOptions } from '@/lib/voice';

export function VoicePicker({ companionId, name }: { companionId: string; name: string }) {
  const { colors: c } = useTheme();
  const [catalog, setCatalog] = useState<VoiceOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const audio = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try { const value = await getVoiceOptions(companionId, controller.signal); if (!controller.signal.aborted) setCatalog(value); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load voices.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [companionId]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current?.abort(); audio.current?.abort(); setPreview(null); }; }, [load]));
  useEffect(() => () => { request.current?.abort(); audio.current?.abort(); }, []);
  const save = async (voice: string | null) => {
    audio.current?.abort(); setPreview(null); setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try { const value = await chooseVoice(companionId, voice, controller.signal); if (!controller.signal.aborted) { setCatalog(old => old ? { ...old, ...value } : old); setOpen(false); } }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not save voice.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const listen = async (voice: string) => {
    audio.current?.abort();
    if (preview === voice) { setPreview(null); return; }
    const controller = new AbortController(); audio.current = controller; setPreview(voice); setError('');
    try { await playReply(`Hello, I'm ${name}. It's good to be here with you.`, controller.signal, () => { if (audio.current === controller) setPreview(null); }, { companionId, voice }); }
    catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not preview voice.'); setPreview(null); } }
  };
  const close = () => { if (busy) return; audio.current?.abort(); setPreview(null); setOpen(false); };
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" onPress={() => { setOpen(true); void load(); }}><Text style={{ color: c.primary[300], fontSize: 15 }}>{catalog?.effective || 'Choose a voice'} ▾</Text></Pressable>
    <Text style={{ color: c.neutral[400], fontSize: 12, lineHeight: 20 }}>Voices from Helios. Your selection applies to the next spoken reply.</Text>
    {!!error && !open && <Text style={{ color: c.error[300], fontSize: 12 }}>{error}</Text>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.7)', padding: 24 }}>
        <View style={{ backgroundColor: c.neutral[900], borderRadius: 20, padding: 24, maxWidth: 600, width: '100%', maxHeight: '85%', alignSelf: 'center', borderWidth: 1, borderColor: c.neutral[700] }}>
          <Text style={{ color: c.neutral[100], fontSize: 24, marginBottom: 10 }}>Find their voice</Text>
          <Text style={{ color: c.neutral[400], fontSize: 11, marginBottom: 16 }}>{catalog?.model || 'Helios'}</Text>
          {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300], marginBottom: 12 }}>{error}</Text>}
          {busy && <ActivityIndicator color={c.primary[400]} />}
          <ScrollView>
            <Pressable disabled={busy} onPress={() => void save(null)} style={{ paddingVertical: 16 }}><Text style={{ color: c.neutral[100] }}>{catalog?.selected == null ? '✓ ' : ''}Use server default</Text></Pressable>
            {catalog?.voices.map(voice => <View key={voice.id} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: c.neutral[800], gap: 12 }}>
              <Pressable disabled={busy} onPress={() => void save(voice.id)} style={{ flex: 1, paddingVertical: 16 }}><Text style={{ color: catalog.selected === voice.id ? c.primary[300] : c.neutral[100] }}>{catalog.selected === voice.id ? '✓ ' : ''}{voice.name}</Text><Text style={{ color: c.neutral[400], fontSize: 11, marginTop: 6 }}>{[voice.language, voice.gender].filter(Boolean).join(' · ')}</Text></Pressable>
              <Pressable accessibilityLabel={`Preview ${voice.name}`} disabled={busy || Platform.OS !== 'web'} onPress={() => void listen(voice.id)} style={{ padding: 12 }}><Text style={{ color: c.primary[300] }}>{preview === voice.id ? 'Stop' : 'Preview'}</Text></Pressable>
            </View>)}
            {catalog?.voices.length === 0 && <Text style={{ color: c.neutral[400] }}>No voices available for this model on Helios.</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}><Pressable disabled={busy} onPress={() => void load()}><Text style={{ color: c.primary[300] }}>Refresh</Text></Pressable><Pressable disabled={busy} onPress={close}><Text style={{ color: c.neutral[100] }}>Close</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  </View>;
}
