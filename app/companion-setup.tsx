import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { chatRead } from '@/lib/chat-read';
import { chatCache } from '@/lib/chat-cache-storage';
import { companionDraft, validateCompanionDraft, PERSONALITIES, type CompanionDraft } from '@/lib/companion-creation';
import { BUILT_IN_PORTRAITS, pickAndUploadPortrait, deleteUploadedPortrait } from '@/lib/portraits';
import { getVoiceOptions, type VoiceOption } from '@/lib/voice';
import { signOutThisBrowser } from '@/lib/sign-out';
import type { Companion } from '@/types/database';

export default function CompanionSetup() {
  const { session, loading: authLoading, error: authError, setupCompanionId, retry } = useAuth();
  const { colors: c } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1' && !setupCompanionId;
  const userId = session?.user.id;
  const owner = useRef(userId); owner.current = userId;
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [draft, setDraft] = useState<CompanionDraft | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceError, setVoiceError] = useState('');
  const [voiceAttempt, setVoiceAttempt] = useState(0);
  const provisional = useRef<string | null>(null);
  const saveAttempted = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (provisional.current && !saveAttempted.current) void deleteUploadedPortrait(provisional.current); };
  }, []);
  useEffect(() => {
    if (!userId || authLoading || authError) return;
    let active = true;
    setError(''); setDraft(null); setCompanion(null);
    void (async () => {
      try {
        let query = supabase.from('companions').select('*').eq('owner_user_id', userId);
        if (setupCompanionId) query = query.eq('id', setupCompanionId);
        const { data, error: err } = await chatRead(signal => query.order('created_at').order('id').limit(1).abortSignal(signal).single());
        if (!active) return;
        if (err || !data) throw err ?? new Error('Companion unavailable.');
        setCompanion(data as Companion); setDraft(companionDraft(data as Companion));
      } catch (err) { if (active) setError((err as { message?: string }).message ?? 'Could not load your companion.'); }
    })();
    return () => { active = false; };
  }, [userId, authLoading, authError, setupCompanionId, attempt]);
  useEffect(() => {
    if (!companion) return;
    const controller = new AbortController();
    setVoiceError('');
    void getVoiceOptions(companion.id, controller.signal).then(catalog => {
      if (!controller.signal.aborted) setVoices(catalog.voices);
    }).catch(() => { if (!controller.signal.aborted) setVoiceError('Voices are unavailable right now. Keep the default or try again.'); });
    return () => controller.abort();
  }, [companion?.id, voiceAttempt]);

  const change = <K extends keyof CompanionDraft>(key: K, value: CompanionDraft[K]) => {
    setDraft(previous => previous ? { ...previous, [key]: value } : previous); setError('');
  };
  const upload = async () => {
    if (!userId || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const path = await pickAndUploadPortrait(userId);
      if (!path) return;
      if (!alive.current || owner.current !== userId) { await deleteUploadedPortrait(path); return; }
      const old = provisional.current; provisional.current = path;
      change('portrait_url', path);
      if (old && old !== path) await deleteUploadedPortrait(old);
    } catch (err) { if (alive.current && owner.current === userId) setError((err as Error).message || 'Could not upload portrait.'); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (!draft || !companion || !userId || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const details = validateCompanionDraft(draft);
      saveAttempted.current = true;
      const { data, error: err } = await supabase.rpc('save_companion_creation', {
        p_companion: companion.id, p_details: details,
      });
      if (err) throw err;
      const saved = data as Companion;
      if (!saved?.id || saved.owner_user_id !== userId || !saved.setup_completed_at)
        throw new Error('Could not confirm the saved companion. Retry when connected.');
      // A saved portrait must survive navigation/unmount, even if cache storage fails.
      const unused = provisional.current && provisional.current !== saved.portrait_url ? provisional.current : null;
      provisional.current = null;
      if (!alive.current || owner.current !== userId) return;
      if (unused) void deleteUploadedPortrait(unused);
      if (companion.portrait_url !== saved.portrait_url) void deleteUploadedPortrait(companion.portrait_url);
      const cached = await chatCache.read(userId);
      if (owner.current !== userId || !alive.current) return;
      try {
        await chatCache.write(userId, cached?.companion.id === saved.id
          ? { ...cached, companion: saved }
          : { companion: saved, conversations: [], messages: {}, drafts: {}, savedAt: '' });
      } catch { setError('Companion saved, but device storage is unavailable. Retry to continue.'); return; }
      retry(); router.replace(editing ? '/companion' : '/');
    } catch (err) {
      if (alive.current && owner.current === userId) setError((err as { message?: string }).message ?? 'Could not save. Check your connection and retry.');
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const button = (label: string, action: () => void, selected = false) => <Pressable key={label}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: busy }} disabled={busy}
    onPress={action} style={{ minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1,
      borderColor: selected ? c.primary[400] : c.neutral[700], backgroundColor: selected ? c.neutral[800] : 'transparent' }}>
    <Text style={{ color: selected ? c.primary[300] : c.neutral[100], fontSize: 15 }}>{label}</Text>
  </Pressable>;
  const field = (label: string, key: 'name' | 'pronouns' | 'description' | 'persona' | 'visual_identity', max: number, multiline = false) => <View style={{ gap: 8 }}>
    <Text style={{ color: c.neutral[200] }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={draft?.[key] ?? ''} editable={!busy} onChangeText={text => change(key, text)}
      maxLength={max} multiline={multiline} autoCapitalize={key === 'pronouns' ? 'none' : 'sentences'}
      style={{ color: c.neutral[100], borderWidth: 1, borderColor: c.neutral[600], borderRadius: 12, padding: 14,
        minHeight: multiline ? 110 : 52, textAlignVertical: multiline ? 'top' : 'center' }} />
  </View>;
  if (!session && !authLoading) return <Redirect href="/login" />;
  const titles = ['Meet your companion', 'Find their personality', 'Choose their look', 'Find their voice', 'Make it yours'];
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.neutral[950] }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 48 }}>
        <Text style={{ color: c.primary[300] }}>{editing ? 'Customize your companion' : 'Create your companion'} · {step + 1} of 5</Text>
        <Text accessibilityRole="header" style={{ color: c.neutral[100], fontSize: 30, fontWeight: '600' }}>{titles[step]}</Text>
        {(!draft || authLoading) && !error && !authError && <ActivityIndicator color={c.primary[300]} />}
        {!!authError && <Text accessibilityRole="alert" style={{ color: c.error[300] }}>{authError}</Text>}
        {draft && !authLoading && <>
          {step === 0 && <>
            <Text style={{ color: c.neutral[300] }}>Give them a name that feels right to you. You can change everything here later.</Text>
            {field('Companion name', 'name', 100)}
            {field('Pronouns', 'pronouns', 40)}
            <Text style={{ color: c.neutral[300] }}>Gender identity</Text>
            <View style={{ gap: 8 }}>{(['female','male','nonbinary','unspecified'] as const).map(gender => button(gender === 'unspecified' ? 'Unspecified' : gender === 'nonbinary' ? 'Nonbinary' : gender === 'female' ? 'Female' : 'Male', () => change('gender', gender), draft.gender === gender))}</View>
          </>}
          {step === 1 && <>
            <Text style={{ color: c.neutral[300] }}>Start with a style, then make it your own.</Text>
            {PERSONALITIES.map(style => button(style.name, () => change('persona', style.text), draft.persona === style.text))}
            {field('Personality', 'persona', 4000, true)}
            {field('Short description', 'description', 500, true)}
          </>}
          {step === 2 && <>
            <Text style={{ color: c.neutral[300] }}>Choose a starter portrait or upload your own. Describe their appearance separately to guide generated images.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{BUILT_IN_PORTRAITS.map(portrait => <Pressable key={portrait.path}
              disabled={busy} accessibilityRole="button" accessibilityLabel={`Portrait ${portrait.label}`} accessibilityState={{ selected: draft.portrait_url === portrait.path }}
              onPress={() => change('portrait_url', portrait.path)} style={{ padding: 8, borderRadius: 12, borderWidth: 2, borderColor: draft.portrait_url === portrait.path ? c.primary[400] : c.neutral[700] }}>
              <Image source={portrait.source} style={{ width: 72, height: 72, borderRadius: 36 }} />
              <Text style={{ color: c.neutral[200], textAlign: 'center', marginTop: 8 }}>{portrait.label}</Text>
            </Pressable>)}</View>
            {button('Upload your own portrait', () => { void upload(); })}
            {!draft.portrait_url.startsWith('/') && <Text style={{ color: c.primary[300] }}>Your uploaded portrait is selected.</Text>}
            {field('Appearance description', 'visual_identity', 3000, true)}
          </>}
          {step === 3 && <>
            <Text style={{ color: c.neutral[300] }}>Choose from voices available on your server. You can change this later.</Text>
            {Platform.OS !== 'web' && <Text style={{ color: c.neutral[400] }}>Your voice choice is saved. Spoken replies and voice previews are coming to the native app.</Text>}
            {button('Use server default', () => change('speech_voice', null), draft.speech_voice === null)}
            {voices.map(voice => button(voice.name, () => change('speech_voice', voice.id), draft.speech_voice === voice.id))}
            {!!voiceError && <Text style={{ color: c.neutral[300] }}>{voiceError}</Text>}
            {button('Refresh available voices', () => setVoiceAttempt(value => value + 1))}
          </>}
          {step === 4 && <>
            <Text style={{ color: c.neutral[100], fontSize: 24 }}>{draft.name || 'Your companion'} · {draft.pronouns}</Text>
            <Text style={{ color: c.neutral[300] }}>{draft.description}</Text>
            <Text style={{ color: c.neutral[300] }}>{draft.persona}</Text>
            <Text style={{ color: c.neutral[300] }}>Appearance: {draft.visual_identity || 'You can add details later.'}</Text>
            <Text style={{ color: c.neutral[300] }}>Voice: {voices.find(voice => voice.id === draft.speech_voice)?.name ?? draft.speech_voice ?? 'Server default'}</Text>
            <Text style={{ color: c.neutral[400] }}>These choices guide your companion’s identity and replies. Your chats and memories stay with the same companion.</Text>
          </>}
        </>}
        {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300] }}>{error}</Text>}
        {busy && <ActivityIndicator color={c.primary[300]} />}
        {draft && !authLoading && <View style={{ gap: 10 }}>
          {step > 0 && button('Back', () => setStep(value => value - 1))}
          {step < 4 ? button('Continue', () => {
            if (step === 0 && (!draft.name.trim() || !draft.pronouns.trim())) { setError('Enter a name and pronouns to continue.'); return; }
            if (step === 1 && !draft.persona.trim()) { setError('Describe their personality to continue.'); return; }
            setError(''); setStep(value => value + 1);
          }) : button(editing ? 'Save companion' : 'Meet my companion', () => { void save(); })}
          {editing && button('Cancel customization', () => router.replace('/companion'))}
        </View>}
        {!draft && (error || authError) && button('Retry setup', () => { retry(); setAttempt(value => value + 1); })}
        {!editing && button('Sign out', () => { void signOutThisBrowser().catch(err => setError(err.message)); })}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
