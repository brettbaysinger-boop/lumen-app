import { View, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { ReminderInbox } from '@/components/ReminderInbox';
import { LumenNavigation } from '@/components/LumenNavigation';
import { isLiveRoom, useRoomMode } from '@/lib/live-room';

export default function TabLayout() {
  const { session, loading, error, setupCompanionId } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // The Live Room (the web layout the phone app shows) has no tab bar of its own: the phone app is
  // already around it. In Theater the reminder banner steps aside too.
  const room = Platform.OS === 'web' && isLiveRoom();
  const theater = useRoomMode() === 'theater';
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.neutral[950], justifyContent: 'center' }}><ActivityIndicator color={colors.primary[400]} /></View>;
  if (!session || error) return <Redirect href="/login" />;
  if (setupCompanionId) return <Redirect href="/companion-setup" />;
  return <View style={{ flex: 1 }}>{!(room && theater) && <ReminderInbox />}<Tabs key={session.user.id} tabBar={props => room ? null : <LumenNavigation {...props} />} screenOptions={{
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
