import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { Conversation } from '@/types/database';
import { useTheme } from '@/lib/theme-context';

export type ChatChange = { title: string } | { is_active: boolean } | 'delete';

export function ChatManagement({ chat, busy, error, onClose, onChange }: {
  chat: Conversation | null; busy: boolean; error: string | null;
  onClose: () => void; onChange: (chat: Conversation, change: ChatChange) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(chat?.title ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!chat) return null;
  const button = (label: string, action: () => void, danger = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={busy}
      onPress={action} style={{ minHeight: 48, padding: 12, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: danger ? '#ff8e8e' : colors.primary[300], fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: colors.neutral[900], padding: 20, borderRadius: 16, gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: colors.neutral[100], fontSize: 20 }}>
          {confirmDelete ? 'Delete this chat?' : 'Manage chat'}
        </Text>
        {confirmDelete ? <>
          <Text style={{ color: colors.neutral[200] }}>
            This permanently deletes “{chat.title}”, its messages and its saved draft on this device.
            Saved companion memories, Gallery items, documents and My Day items stay available.
            Other devices remove their cached copy when they next reconnect. This cannot be undone.
          </Text>
          {button('Delete permanently', () => { void onChange(chat, 'delete'); }, true)}
          {button('Back', () => setConfirmDelete(false))}
        </> : <>
          <Text style={{ color: colors.neutral[200] }}>Chat name</Text>
          <TextInput accessibilityLabel="Chat name" value={title} onChangeText={setTitle} maxLength={200}
            editable={!busy} style={{ color: colors.neutral[100], borderWidth: 1,
              borderColor: colors.neutral[600], borderRadius: 8, padding: 12, minHeight: 48 }} />
          {button('Save name', () => { void onChange(chat, { title }); })}
          {button(chat.is_active === false ? 'Restore chat' : 'Archive chat', () => {
            void onChange(chat, { is_active: chat.is_active === false });
          })}
          {button('Delete chat…', () => setConfirmDelete(true), true)}
        </>}
        {busy && <ActivityIndicator color={colors.primary[300]} />}
        {error && <Text accessibilityRole="alert" style={{ color: '#ff8e8e' }}>{error}</Text>}
        {button('Cancel', onClose)}
      </View>
    </View>
  </Modal>;
}
