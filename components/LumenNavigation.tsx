import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MessageCircle, Brain, User, Settings, Images, CalendarCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { RaialumeLogo } from '@/components/RaialumeLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const items = {
  index: { label: 'Conversation', icon: MessageCircle },
  'my-day': { label: 'My Day', icon: CalendarCheck },
  gallery: { label: 'Gallery', icon: Images },
  memories: { label: 'Memories', icon: Brain },
  companion: { label: 'Companion', icon: User },
  settings: { label: 'Settings', icon: Settings },
};

export function LumenNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 1000;
  return <View style={[styles.shell, { backgroundColor: c.neutral[950], borderColor: c.neutral[800] }, desktop ? styles.desktop : [styles.mobile, { paddingBottom: Math.max(insets.bottom, 10) }]]}>
    {desktop && <View style={styles.brand}>
      <RaialumeLogo width={105} height={66} />
      <Text style={[styles.wordmark, { color: '#F5E8C8' }]}>raialume</Text>
      <Text style={[styles.tagline, { color: c.neutral[400] }]}>A little more light in your life.</Text>
    </View>}
    <View style={desktop ? styles.links : styles.mobileLinks}>
      {state.routes.map((route, index) => {
        const item = items[route.name as keyof typeof items];
        if (!item) return null;
        const selected = state.index === index;
        const Icon = item.icon;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={({ pressed }) => [styles.link, desktop ? styles.desktopLink : styles.mobileLink, { backgroundColor: selected ? c.neutral[800] : 'transparent', opacity: pressed ? 0.65 : 1 }]}>
          <Icon size={20} strokeWidth={selected ? 2 : 1.6} color={selected ? c.primary[400] : c.neutral[400]} />
          <Text numberOfLines={1} style={[desktop ? styles.label : styles.mobileLabel, { color: selected ? c.neutral[50] : c.neutral[400] }]}>{!desktop && route.name === 'index' ? 'Chat' : item.label}</Text>
          {selected && desktop && <View style={[styles.dot, { backgroundColor: c.primary[400] }]} />}
        </Pressable>;
      })}
    </View>
    {desktop && <View style={[styles.footer, { borderColor: c.neutral[800] }]}>
      <Text style={[styles.footerTitle, { color: c.neutral[300] }]}>Your own little world</Text>
      <Text style={[styles.footerText, { color: c.neutral[400] }]}>Conversation. Connection. Continuity.</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  shell: { flexShrink: 0 }, desktop: { width: 216, borderRightWidth: 1, padding: 18, paddingTop: 40 },
  mobile: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 6 },
  brand: { marginBottom: 52, paddingHorizontal: 12 },
  wordmark: { fontSize: 28, fontFamily: 'Georgia', letterSpacing: -0.6 }, tagline: { fontSize: 12, marginTop: 6, fontFamily: 'Inter-Regular' },
  links: { gap: 8, flex: 1 }, mobileLinks: { flexDirection: 'row' }, link: { borderRadius: 12 },
  desktopLink: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12 },
  mobileLink: { flex: 1, alignItems: 'center', gap: 5, minHeight: 44, padding: 4 },
  label: { fontSize: 13, fontFamily: 'Inter-Medium' }, mobileLabel: { fontSize: 10, fontFamily: 'Inter-Medium' },
  dot: { width: 5, height: 5, borderRadius: 3, marginLeft: 'auto' },
  footer: { borderTopWidth: 1, paddingTop: 20, paddingBottom: 6, gap: 7 }, footerTitle: { fontSize: 11, fontFamily: 'Inter-Medium' }, footerText: { fontSize: 10, lineHeight: 17, fontFamily: 'Inter-Regular' },
});
