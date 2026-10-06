import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { dueReminders, dayRequest, type DayAlert } from '@/lib/my-day';
import { useTheme } from '@/lib/theme-context';

export function ReminderInbox() {
 const { session } = useAuth(); const { colors: c } = useTheme();
 const [alerts, setAlerts] = useState<DayAlert[]>([]), [companionId, setCompanionId] = useState(''), [error, setError] = useState('');
 const notified = useRef(new Set<string>());
 useEffect(() => {
  let alive = true, busy = false; const controller = new AbortController(); let id = '';
  const poll = async () => {
   if (busy || !alive) return; busy = true;
   try {
    if (!id) { const { data, error } = await supabase.from('companions').select('id').order('created_at').order('id').limit(1).maybeSingle(); if (error) throw error; if (!data) return; id = data.id; if (alive) setCompanionId(id); }
    const rows = await dueReminders(id, controller.signal); if (!alive) return;
    setAlerts(rows); setError('');
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
     let enabled = false; try { enabled = localStorage.getItem(`lumen-browser-alerts-${session?.user.id}`) === 'yes'; } catch {}
     if (enabled) for (const alert of rows) {
      const key = `lumen-alert-${session?.user.id}-${alert.id}`;
      let shown = notified.current.has(key); try { shown ||= localStorage.getItem(key) === 'yes'; } catch {}
      if (!shown) { const notification = new Notification('Lumen reminder', { body: alert.title, tag: key }); notification.onclick = () => { window.focus(); router.push('/my-day'); notification.close(); }; notified.current.add(key); try { localStorage.setItem(key, 'yes'); } catch {} }
     }
    }
   } catch { if (alive) setError('Reminders are temporarily unavailable. Open My Day to retry.'); }
   finally { busy = false; }
  };
  void poll(); const timer = setInterval(() => void poll(), 20000);
  if (Platform.OS === 'web') window.addEventListener('focus', poll);
  return () => { alive = false; controller.abort(); clearInterval(timer); if (Platform.OS === 'web') window.removeEventListener('focus', poll); };
 }, [session?.user.id]);
 if (!alerts.length && !error) return null;
 return <View style={{ backgroundColor: c.neutral[900], paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: c.neutral[700], gap: 8 }}>
  {!!error && <Pressable onPress={() => router.push('/my-day')}><Text style={{ color: c.neutral[300], fontSize: 12 }}>{error}</Text></Pressable>}
  {alerts.slice(0, 3).map(alert => <View key={alert.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
   <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/my-day', params: { item: alert.item_id } })} style={{ flex: 1 }}><Text style={{ color: c.primary[300], fontSize: 13 }}>Reminder · {alert.title}</Text></Pressable>
   <Pressable accessibilityLabel={`Dismiss reminder ${alert.title}`} onPress={async () => { try { await dayRequest(companionId, `/alerts/${alert.id}/seen`, 'POST', {}); setAlerts(old => old.filter(row => row.id !== alert.id)); } catch { setError('Could not dismiss this reminder. Try again.'); } }}><Text style={{ color: c.neutral[400], fontSize: 11 }}>Dismiss</Text></Pressable>
  </View>)}
  {alerts.length > 3 && <Pressable onPress={() => router.push('/my-day')}><Text style={{ color: c.neutral[400], fontSize: 11 }}>{alerts.length - 3} more reminders in My Day</Text></Pressable>}
 </View>;
}
