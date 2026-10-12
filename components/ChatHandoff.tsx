import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import type { Conversation } from '@/types/database';
import { useTheme } from '@/lib/theme-context';
import { authHeaders } from '@/lib/auth';
import { requestKey } from '@/lib/my-day';
import { supabase } from '@/lib/supabase';
import { chatRead } from '@/lib/chat-read';

type Source = { id: string; title: string; included_messages: number; limited: boolean };
type Draft = { summary: string; sources: Source[]; notice: string };

export function ChatHandoff({
  visible, companionId, chats, collectionId, disabled, onBusy, onClose, onCreated,
}: {
  visible: boolean; companionId: string; chats: Conversation[];
  collectionId: string | null; disabled: boolean;
  onBusy: (busy: boolean) => void; onClose: () => void;
  onCreated: (chat: Conversation) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [summary, setSummary] = useState('');
  const [title, setTitle] = useState('Continued conversation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const alive = useRef(true);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{
    p_request_id: string; p_companion_id: string; p_title: string;
    p_summary: string; p_source_ids: string[]; p_collection_id: string | null;
  } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!visible && !locked.current) {
      setSelected([]); setDraft(null); setSummary('');
      setTitle('Continued conversation'); setError(null);
      pending.current = null; setSubmitted(false);
    }
  }, [visible, busy]);

  const generate = async () => {
    if (locked.current || disabled || !selected.length) return;
    locked.current = true; setBusy(true); onBusy(true); setError(null);
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 150000);
    try {
      const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
      if (!base) throw new Error('Lumen API address is unavailable.');
      const response = await fetch(`${base}/v0.2/chat-handoffs/draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ companion_id: companionId, conversation_ids: selected }),
        signal: abort.signal,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.detail === 'string'
        ? value.detail : 'Could not draft the handoff.');
      if (typeof value.summary !== 'string' || !value.summary.trim() ||
          value.summary.length > 6000 || !Array.isArray(value.sources) ||
          value.sources.length !== selected.length ||
          value.sources.some((source: Source, index: number) => source.id !== selected[index])) {
        throw new Error('The draft response was incomplete. Try again.');
      }
      if (!alive.current) return;
      setDraft(value); setSummary(value.summary);
    } catch (err) {
      if (alive.current) setError(abort.signal.aborted
        ? 'Draft generation timed out. No new chat was created.'
        : err instanceof Error ? err.message : 'Could not draft the handoff.');
    } finally {
      clearTimeout(timer); controller.current = null; locked.current = false;
      if (alive.current) { setBusy(false); onBusy(false); }
    }
  };

  const start = async () => {
    if (locked.current || disabled || !draft) return;
    if (!title.trim() || !summary.trim()) {
      setError('Give the chat a name and keep some handoff text.');
      return;
    }
    if (!pending.current) {
      pending.current = {
        p_request_id: requestKey(), p_companion_id: companionId,
        p_title: title.trim(), p_summary: summary.trim(),
        p_source_ids: draft.sources.map(source => source.id),
        p_collection_id: collectionId,
      };
    }
    setSubmitted(true);
    locked.current = true; setBusy(true); onBusy(true); setError(null);
    try {
      const result = await chatRead(signal =>
        supabase.rpc('start_handoff_chat', pending.current!).abortSignal(signal));
      if (!alive.current) return;
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || row.id !== pending.current.p_request_id || row.companion_id !== companionId) {
        throw new Error('The new chat could not be confirmed.');
      }
      onCreated(row as Conversation);
    } catch {
      if (alive.current) setError(
        'Creation could not be confirmed. Retry start uses the same request and will not create a duplicate. If you close, check your chat list before starting again.'
      );
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); onBusy(false); }
    }
  };

  const button = (label: string, action: () => void, blocked = false) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy || disabled || blocked}
      onPress={action} style={{ minHeight: 48, padding: 12, justifyContent: 'center',
        opacity: busy || disabled || blocked ? 0.5 : 1 }}>
      <Text style={{ color: colors.primary[300], fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>;
  const inputStyle = {
    color: colors.neutral[100], borderWidth: 1, borderColor: colors.neutral[600],
    borderRadius: 10, padding: 12, minHeight: 48,
  };

  return <Modal visible={visible} transparent animationType="fade"
    onRequestClose={() => { if (!locked.current) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 16 }}>
      <ScrollView keyboardShouldPersistTaps="handled"
        style={{ maxHeight: '92%', backgroundColor: colors.neutral[900], borderRadius: 18 }}
        contentContainerStyle={{ padding: 18, gap: 10 }}>
        <Text accessibilityRole="header" style={{ color: colors.neutral[100], fontSize: 22 }}>
          {draft ? 'Review your handoff' : 'Continue together'}
        </Text>
        {!draft ? <>
          <Text style={{ color: colors.neutral[200] }}>
            Choose up to five chats. Review a summary, then start fresh.
            Your original chats stay available.
          </Text>
          {chats.map(chat => <TouchableOpacity key={chat.id}
            accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(chat.id) }}
            disabled={busy || disabled || (!selected.includes(chat.id) && selected.length >= 5)}
            onPress={() => setSelected(ids => ids.includes(chat.id)
              ? ids.filter(id => id !== chat.id) : [...ids, chat.id])}
            style={{ minHeight: 52, justifyContent: 'center', padding: 12,
              borderRadius: 10, backgroundColor: colors.neutral[800] }}>
            <Text style={{ color: colors.neutral[100] }}>
              {selected.includes(chat.id) ? '✓ ' : ''}{chat.title}
              {chat.is_active === false ? ' · Archived' : ''}
            </Text>
          </TouchableOpacity>)}
          {!chats.length && <Text style={{ color: colors.neutral[300] }}>No chats in this view.</Text>}
          {button(`Generate handoff (${selected.length}/5)`, () => { void generate(); }, !selected.length)}
        </> : <>
          <Text style={{ color: colors.neutral[200] }}>{draft.notice}</Text>
          {draft.sources.map((source, index) => <Text key={source.id} style={{ color: colors.neutral[300] }}>
            [{index + 1}] {source.title} · {source.included_messages} text messages
            {source.limited ? ' · History limited' : ''}
          </Text>)}
          <TextInput accessibilityLabel="Fresh chat name" value={title} onChangeText={setTitle}
            editable={!busy && !submitted} maxLength={200} style={inputStyle} />
          <TextInput accessibilityLabel="Reviewed handoff" value={summary} onChangeText={setSummary}
            editable={!busy && !submitted} multiline maxLength={6000}
            textAlignVertical="top" style={[inputStyle, { minHeight: 220 }]} />
          {button(submitted ? 'Retry start' : 'Start fresh chat', () => { void start(); })}
          {!submitted && button('Change selected chats', () => { setDraft(null); setError(null); })}
        </>}
        {busy && <><ActivityIndicator color={colors.primary[300]} />
          <Text style={{ color: colors.neutral[300] }}>{draft ? 'Creating chat…' : 'Preparing your handoff…'}</Text></>}
        {!!error && <Text accessibilityRole="alert" style={{ color: '#ff8e8e' }}>{error}</Text>}
        {!busy && button(submitted ? 'Close and check chats' : 'Cancel', onClose)}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

export function HandoffCard({ chat, chats, disabled, onOpen }: {
  chat: Conversation; chats: Conversation[]; disabled: boolean;
  onOpen: (chat: Conversation) => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!chat.handoff) return null;
  return <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.neutral[900] }}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.primary[300] }}>Reviewed handoff · {expanded ? 'Hide' : 'View'}</Text>
    </TouchableOpacity>
    {expanded && <ScrollView style={{ maxHeight: 240 }}>
      <Text selectable style={{ color: colors.neutral[100], lineHeight: 22 }}>{chat.handoff.summary}</Text>
      <Text style={{ color: colors.neutral[400], marginTop: 12 }}>Original chats</Text>
      {chat.handoff.sources.map((source, index) => {
        const target = chats.find(item => item.id === source.id);
        return <TouchableOpacity key={source.id} accessibilityRole="button"
          disabled={disabled || !target} onPress={() => { if (target) onOpen(target); }}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: target ? colors.primary[300] : colors.neutral[400] }}>
            [{index + 1}] {source.title}{!target ? ' · Unavailable' : ''}
          </Text>
        </TouchableOpacity>;
      })}
      <Text style={{ color: colors.neutral[400] }}>
        This reviewed summary remains here if an original chat is later deleted.
      </Text>
    </ScrollView>}
  </View>;
}
