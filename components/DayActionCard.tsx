import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { DocumentSources } from './DocumentSources';
import { updateDayItem, type DayItem } from '@/lib/my-day';

export function DayActionCard({ item }: { item: DayItem }) {
 const { colors: c } = useTheme(); const [undone, setUndone] = useState(item.status === 'archived'), [busy, setBusy] = useState(false), [error, setError] = useState('');
 return <View style={{ backgroundColor: c.neutral[900], borderColor: c.neutral[700], borderWidth: 1, borderRadius: 14, padding: 16, gap: 10, marginTop: 14 }}>
  <Text style={{ color: c.primary[300], fontSize: 11 }}>{item.kind.toUpperCase()} · {undone ? 'ARCHIVED' : 'SAVED'}</Text>
  <Text style={{ color: c.neutral[100], fontSize: 15 }}>{item.title}</Text>
  {!!item.due_at && <Text style={{ color: c.neutral[400], fontSize: 12 }}>{new Date(item.due_at).toLocaleString(undefined, { timeZone: item.timezone })} · {item.timezone}</Text>}
  {!!item.source_documents?.length && <DocumentSources value={item.source_documents} companionId={item.companion_id} />}
  {!!error && <Text style={{ color: c.error[300], fontSize: 12 }}>{error}</Text>}
  <View style={{ flexDirection: 'row', gap: 20 }}><Pressable onPress={() => router.push({ pathname: '/my-day', params: { item: item.id } })}><Text style={{ color: c.primary[300], fontSize: 12 }}>Open My Day</Text></Pressable>
   <Pressable disabled={busy} onPress={async () => { setBusy(true); setError(''); try { await updateDayItem(item.companion_id, item.id, { status: undone ? 'open' : 'archived' }); setUndone(!undone); } catch { setError('Could not change this item. Open My Day to retry.'); } finally { setBusy(false); } }}><Text style={{ color: c.neutral[400], fontSize: 12 }}>{busy ? 'Saving…' : undone ? 'Restore' : 'Undo'}</Text></Pressable>
  </View>
 </View>;
}
