import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import type { ChatCollection } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { chatRead } from '@/lib/chat-read';

export function CollectionManager({
  visible, companionId, collections, disabled, onClose, onBusy, onRefresh,
}: {
  visible: boolean; companionId: string; collections: ChatCollection[];
  disabled: boolean; onClose: () => void; onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!visible) {
      setName(''); setEditing(null); setDeleting(null); setError(null);
    }
  }, [visible]);

  const save = async (remove = false) => {
    if (locked.current || disabled) return;
    const trimmed = name.trim();
    if (!remove && (!trimmed || trimmed.length > 100)) {
      setError('Use a collection name between 1 and 100 characters.');
      return;
    }
    locked.current = true; setBusy(true); onBusy(true); setError(null);
    try {
      const result = await chatRead(signal => remove
        ? supabase.from('chat_collections').delete()
            .eq('id', deleting!.id).eq('companion_id', companionId)
            .select('id').abortSignal(signal).single()
        : editing
          ? supabase.from('chat_collections').update({ name: trimmed })
              .eq('id', editing).eq('companion_id', companionId)
              .select('id').abortSignal(signal).single()
          : supabase.from('chat_collections').insert({
              companion_id: companionId, name: trimmed,
            }).select('id').abortSignal(signal).single());
      if (!alive.current) return;
      if (result.error) throw result.error;
      setName(''); setEditing(null); setDeleting(null);
      await onRefresh();
    } catch (err) {
      if (alive.current) {
        const code = (err as { code?: string })?.code;
        setError(code === '23505' ? 'That collection name is already in use.'
          : 'Could not complete or refresh this change. Reconnect and check the list before retrying.');
      }
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); onBusy(false); }
    }
  };
  const button = (label: string, action: () => void, danger = false) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy || disabled}
      onPress={action} style={{ minHeight: 48, justifyContent: 'center', padding: 12 }}>
      <Text style={{ color: danger ? '#ff8e8e' : colors.primary[300], fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>;

  return <Modal visible={visible} transparent animationType="fade"
    onRequestClose={() => { if (!locked.current) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 }}>
      <ScrollView keyboardShouldPersistTaps="handled"
        style={{ maxHeight: '90%', backgroundColor: colors.neutral[900], borderRadius: 18 }}
        contentContainerStyle={{ padding: 20, gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: colors.neutral[100], fontSize: 22 }}>
          {deleting ? 'Delete collection?' : 'Collections'}
        </Text>
        {deleting ? <>
          <Text style={{ color: colors.neutral[200] }}>
            Delete “{deleting.name}”? Its chats become Unfiled.
            Messages, saved drafts and memories remain available.
          </Text>
          {button('Delete collection', () => { void save(true); }, true)}
          {button('Keep collection', () => setDeleting(null))}
        </> : <>
          <Text style={{ color: colors.neutral[200] }}>
            Group related chats. Choose a collection from Manage chat to move a conversation.
          </Text>
          <TextInput accessibilityLabel={editing ? 'Rename collection' : 'New collection name'}
            placeholder={editing ? 'Collection name' : 'New collection name'}
            placeholderTextColor={colors.neutral[400]} value={name} onChangeText={setName}
            maxLength={100} editable={!busy && !disabled}
            style={{ minHeight: 48, borderWidth: 1, borderColor: colors.neutral[600],
              padding: 12, borderRadius: 10, color: colors.neutral[100] }} />
          {button(editing ? 'Save collection name' : 'Create collection', () => { void save(); })}
          {editing && button('Cancel rename', () => { setEditing(null); setName(''); })}
          {collections.map(collection => <View key={collection.id}
            style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: colors.neutral[700] }}>
            <Text style={{ color: colors.neutral[100], fontSize: 17 }}>{collection.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {button('Rename', () => { setEditing(collection.id); setName(collection.name); setError(null); })}
              {button('Delete…', () => { setDeleting(collection); setError(null); }, true)}
            </View>
          </View>)}
          {!collections.length && <Text style={{ color: colors.neutral[400] }}>No collections yet.</Text>}
        </>}
        {busy && <ActivityIndicator color={colors.primary[300]} />}
        {error && <Text accessibilityRole="alert" style={{ color: '#ff8e8e' }}>{error}</Text>}
        {!busy && button('Close', onClose)}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
