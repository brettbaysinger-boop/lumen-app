import { useEffect, useState } from 'react';
import { Text, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { supportRequest } from '@/lib/support';

export function SupportEntry() {
  const { session } = useAuth(); const { colors: c } = useTheme();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setEnabled(false);
    supportRequest('me','GET',controller.signal).then(result => { if (!controller.signal.aborted) setEnabled(result.enabled === true); }).catch(() => {});
    return () => controller.abort();
  }, [session?.user.id]);
  return <View style={{ gap: 10 }}>
    <Text selectable style={{ color: c.neutral[400], fontSize: 12 }}>Account ID: {session?.user.id}</Text>
    {enabled && <Pressable accessibilityRole="button" onPress={() => router.push('/support')}><Text style={{ color: c.primary[300] }}>Open account support</Text></Pressable>}
  </View>;
}
