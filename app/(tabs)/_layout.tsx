import { View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { ReminderInbox } from '@/components/ReminderInbox';
import { LumenNavigation } from '@/components/LumenNavigation';

export default function TabLayout() {
  const { session, loading, error } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.neutral[950], justifyContent: 'center' }}><ActivityIndicator color={colors.primary[400]} /></View>;
  if (!session || error) return <Redirect href="/login" />;
  return <View style={{ flex: 1 }}><ReminderInbox /><Tabs key={session.user.id} tabBar={props => <LumenNavigation {...props} />} screenOptions={{
    headerShown: false, tabBarPosition: width >= 1000 ? 'left' : 'bottom', sceneStyle: { backgroundColor: colors.neutral[950] },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Conversation' }} />
    <Tabs.Screen name="my-day" options={{ title: 'My Day' }} />
    <Tabs.Screen name="gallery" options={{ title: 'Gallery' }} />
    <Tabs.Screen name="memories" options={{ title: 'Memories' }} />
    <Tabs.Screen name="companion" options={{ title: 'Companion' }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
  </Tabs></View>;
}
