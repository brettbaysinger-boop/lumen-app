import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { supportRequest, type SupportAccount } from '@/lib/support';

export default function Support() {
  const { session, loading } = useAuth(); const { colors: c } = useTheme();
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [accounts, setAccounts] = useState<SupportAccount[]>([]), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [audit, setAudit] = useState<Array<{ id: string; actor_user_id: string; target_user_id: string; action: string; status: string; created_at: string }>>([]);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController(); setBusy(true); setError('');
    void (async () => {
      try {
        const me = await supportRequest('me','GET',controller.signal);
        if (!controller.signal.aborted) setEnabled(me.enabled === true);
        if (!me.enabled) throw new Error('This account is not authorized for account support.');
        const [rows, events] = await Promise.all([supportRequest(`accounts?page=${page}`,'GET',controller.signal),supportRequest('audit','GET',controller.signal)]);
        if (!controller.signal.aborted) { setAccounts(rows.accounts); setAudit(events); }
      } catch (err) { if (!controller.signal.aborted) { setAccounts([]); setAudit([]); setError(err instanceof Error ? err.message : 'Could not load account support.'); } }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [session?.user.id,page,refresh]);
  if (loading) return <ActivityIndicator />;
  if (!session) return <Redirect href="/login" />;
  const act = async (id: string, action: 'unlock' | 'recovery') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await supportRequest(`accounts/${id}/${action}`,'POST');
      setNotice(action === 'unlock' ? 'Account ban removed. This does not bypass login rate limits.' : 'Recovery email requested. Delivery depends on the configured mail service.');
      setRefresh(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'The account action failed.'); }
    finally { setBusy(false); }
  };
  const button = { color: c.primary[300], paddingVertical: 10 };
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.neutral[950] }}><ScrollView contentContainerStyle={{ padding: 24, gap: 18, maxWidth: 850, width: '100%', alignSelf: 'center' }}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/settings')}><Text style={button}>Back to Settings</Text></Pressable>
    <Text style={{ color: c.neutral[100], fontSize: 28 }}>Account support</Text>
    <Text style={{ color: c.neutral[300], lineHeight: 24 }}>Account details and recovery only. Conversations, memories, photos, and documents are unavailable here. Recovery links go directly to users.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300] }}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: c.primary[300] }}>{notice}</Text>}
    {busy && <ActivityIndicator color={c.primary[400]} />}
    {enabled && <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable disabled={busy || page === 1} onPress={() => setPage(value => value - 1)}><Text style={button}>Previous</Text></Pressable>
        <Text style={{ color: c.neutral[300] }}>Accounts · page {page}</Text>
        <Pressable disabled={busy || accounts.length < 25} onPress={() => setPage(value => value + 1)}><Text style={button}>Next</Text></Pressable>
      </View>
      {accounts.map(account => <View key={account.id} style={{ padding: 18, borderRadius: 16, backgroundColor: c.neutral[900], gap: 8 }}>
        <Text selectable style={{ color: c.neutral[100], fontSize: 17 }}>{account.email || 'No email'}</Text>
        <Text selectable style={{ color: c.neutral[400], fontSize: 12 }}>{account.id}</Text>
        <Text style={{ color: c.neutral[300] }}>Email: {account.email_confirmed_at ? 'confirmed' : 'unconfirmed'} · Ban: {account.banned_until && new Date(account.banned_until).getTime() > Date.now() ? 'active' : 'none'}</Text>
        <Text style={{ color: c.neutral[400] }}>Last sign-in: {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : 'Never'}</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(account.id,'recovery')}><Text style={button}>Send recovery email</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(account.id,'unlock')}><Text style={button}>Remove account ban</Text></Pressable>
      </View>)}
      <Text style={{ color: c.neutral[100], fontSize: 21 }}>Recent support actions</Text>
      {audit.map(event => <Text selectable key={event.id} style={{ color: c.neutral[300], lineHeight: 22 }}>{new Date(event.created_at).toLocaleString()} · {event.action} · {event.status}{'\n'}Actor: {event.actor_user_id}{'\n'}Account: {event.target_user_id}</Text>)}
    </>}
  </ScrollView></SafeAreaView>;
}
