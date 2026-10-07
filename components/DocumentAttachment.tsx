import { createElement, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { FilePlus } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { documentRequest, MAX_DOCUMENT_BYTES, type PrivateDocument } from '@/lib/documents';

export function DocumentAttachment({ companionId, disabled, onSelect, onBusy }: {
  companionId: string; disabled: boolean; onSelect: (document: PrivateDocument) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { colors: c } = useTheme();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const upload = async (file: File) => {
    setError('');
    if (file.size > MAX_DOCUMENT_BYTES) { setError('Choose a document up to 25 MB.'); return; }
    setBusy(true); onBusy(true);
    try {
      const body = new FormData(); body.append('file', file);
      const document = await documentRequest<PrivateDocument>(companionId, '/upload', 'POST', body);
      onSelect(document);
    } catch (e) { setError(e instanceof Error ? e.message : 'Document import failed.'); }
    finally { setBusy(false); onBusy(false); }
  };
  if (Platform.OS !== 'web') return null;
  return <View>
    {createElement('input', { ref: input, type: 'file', accept: '.pdf,.txt,.md,application/pdf,text/plain,text/markdown',
      style: { display: 'none' }, onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file);
      } })}
    <Pressable accessibilityRole="button" accessibilityLabel="Attach document" disabled={disabled || busy}
      onPress={() => input.current?.click()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
      {busy ? <ActivityIndicator color={c.primary[300]} /> : <FilePlus size={19} color={c.primary[300]} />}
      <Text style={{ color: c.primary[300] }}>{busy ? 'Importing document…' : 'Attach document'}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300], padding: 8 }}>{error}</Text>}
  </View>;
}
