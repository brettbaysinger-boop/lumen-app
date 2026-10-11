import { useEffect, useState } from 'react';
import { View, Text, Button, Platform, Linking } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { pushEnabled, enablePush, disablePush, testPush } from '@/lib/push-client';
export function NotificationControls() {
  const { session } = useAuth(); const { colors:c } = useTheme();
  const owner = session?.user.id;
  const [enabled,setEnabled]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  useEffect(() => { let live=true; setEnabled(false); setMessage('');
    if (owner) void pushEnabled(owner).then(value => { if (live) setEnabled(value); }).catch(() => {});
    return () => { live=false; };
  }, [owner]);
  if (Platform.OS !== 'android' || !owner) return null;
  async function act(kind: 'enable'|'disable'|'test') {
    if (!owner || busy) return; setBusy(true); setMessage('');
    try {
      await (kind==='enable' ? enablePush(owner) : kind==='disable' ? disablePush(owner) : testPush(owner));
      setEnabled(await pushEnabled(owner));
      setMessage(kind==='test' ? 'Test queued. It should arrive shortly; delivery needs an internet connection.' : kind==='enable' ? 'Notifications enabled.' : 'Notifications disabled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update notifications.'); }
    finally { setBusy(false); }
  }
  return <View style={{gap:12,padding:16,marginBottom:20,borderRadius:12,backgroundColor:c.neutral[900]}}>
    <Text style={{fontSize:18,color:c.neutral[100]}}>Notifications</Text>
    <Text style={{color:c.neutral[300]}}>My Day reminders on this Android device. Lock-screen alerts keep reminder details private.</Text>
    <Button title={enabled?'Disable notifications':'Enable notifications'} disabled={busy} onPress={() => void act(enabled?'disable':'enable')} />
    {enabled && <Button title="Send test notification" disabled={busy} onPress={() => void act('test')} />}
    <Button title="Android notification settings" onPress={() => void Linking.openSettings()} />
    {!!message && <Text accessibilityLiveRegion="polite" style={{color:c.neutral[200]}}>{message}</Text>}
  </View>;
}
