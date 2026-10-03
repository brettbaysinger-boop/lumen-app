import { Tabs } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { MessageCircle, Brain, User, Settings } from 'lucide-react-native';
import { Colors } from '@/lib/theme';

type TabBarIconProps = { color: string; size: number };

function makeIcon(Icon: LucideIcon) {
  return ({ color, size }: TabBarIconProps) => (
    <Icon color={color} size={size} strokeWidth={2} />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary[400],
        tabBarInactiveTintColor: Colors.neutral[400],
        tabBarStyle: {
          backgroundColor: Colors.neutral[950],
          borderTopColor: Colors.neutral[800],
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: makeIcon(MessageCircle),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: 'Memories',
          tabBarIcon: makeIcon(Brain),
        }}
      />
      <Tabs.Screen
        name="companion"
        options={{
          title: 'Companion',
          tabBarIcon: makeIcon(User),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: makeIcon(Settings),
        }}
      />
    </Tabs>
  );
}
