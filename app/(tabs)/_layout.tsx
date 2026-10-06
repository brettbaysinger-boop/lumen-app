import { View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { Tabs, Redirect } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { MessageCircle, Brain, User, Settings, Image as ImageIcon } from 'lucide-react-native';

import { LumenNavigation } from '@/components/LumenNavigation';

type TabBarIconProps = { color: string; size: number };

function makeIcon(Icon: LucideIcon) {
  return ({ color, size }: TabBarIconProps) => (
    <Icon color={color} size={size} strokeWidth={2} />
  );
}

export default function TabLayout() {
  const { session, loading, error } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.neutral[950], justifyContent: 'center' }}><ActivityIndicator color={colors.primary[400]} /></View>;
  if (!session || error) return <Redirect href="/login" />;
  return (
    <Tabs key={session.user.id} tabBar={(props) => <LumenNavigation {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: width >= 1000 ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: colors.neutral[950] },
        tabBarActiveTintColor: colors.primary[400],
        tabBarInactiveTintColor: colors.neutral[500],
        tabBarStyle: {
          backgroundColor: colors.neutral[950],
          borderTopColor: colors.neutral[800],
          borderTopWidth: 1,
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          minHeight: 64 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Chat', tabBarIcon: makeIcon(MessageCircle) }}
      />
      <Tabs.Screen
        name="gallery"
        options={{ title: 'Gallery', tabBarIcon: makeIcon(ImageIcon) }}
      />
      <Tabs.Screen
        name="memories"
        options={{ title: 'Memories', tabBarIcon: makeIcon(Brain) }}
      />
      <Tabs.Screen
        name="companion"
        options={{ title: 'Companion', tabBarIcon: makeIcon(User) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: makeIcon(Settings) }}
      />
    </Tabs>
  );
}
