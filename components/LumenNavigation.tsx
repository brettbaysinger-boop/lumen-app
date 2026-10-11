import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Modal, ScrollView } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MessageCircle, Brain, User, Settings, Images, CalendarCheck, MoreHorizontal, X } from 'lucide-react-native';
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
  const keyboardVisible = useKeyboardVisible();
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryNames = ['index', 'my-day', 'gallery'];
  const secondaryRoutes = state.routes.filter(route =>
    !!items[route.name as keyof typeof items] && !primaryNames.includes(route.name));
  const moreSelected = secondaryRoutes.some(route => route.key === state.routes[state.index]?.key);
  useEffect(() => {
    setMoreOpen(false);
  }, [desktop, keyboardVisible, state.index]);

  const openRoute = (route: (typeof state.routes)[number]) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    setMoreOpen(false);
    if (route.key !== state.routes[state.index]?.key) navigation.navigate(route.name, route.params);
  };
  if (!desktop && keyboardVisible) return null;
  return <View style={[styles.shell, { backgroundColor: c.neutral[950], borderColor: c.neutral[700] }, desktop ? styles.desktop : [styles.mobile, { paddingBottom: Math.max(insets.bottom, 10) }]]}>
    {desktop && <View style={styles.brand}>
      <RaialumeLogo width={105} height={66} />
      <Text style={[styles.wordmark, { color: c.neutral[50] }]}>raialume</Text>
      <Text style={[styles.tagline, { color: c.neutral[400] }]}>A little more light in your life.</Text>
    </View>}
    <View style={desktop ? styles.links : styles.mobileLinks}>
      {state.routes.map((route, index) => {
        const item = items[route.name as keyof typeof items];
        if (!item || (!desktop && !primaryNames.includes(route.name))) return null;
        const selected = state.index === index;
        const Icon = item.icon;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label}
          onPress={() => openRoute(route)}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={({ pressed }) => [styles.link, desktop ? styles.desktopLink : styles.mobileLink, { backgroundColor: selected ? c.neutral[800] : 'transparent', opacity: pressed ? 0.65 : 1 }]}>
          <Icon size={20} strokeWidth={selected ? 2 : 1.6} color={selected ? c.primary[400] : c.neutral[400]} />
          <Text numberOfLines={1} style={[desktop ? styles.label : styles.mobileLabel, { color: selected ? c.neutral[50] : c.neutral[400] }]}>{!desktop && route.name === 'index' ? 'Chat' : item.label}</Text>
          {selected && desktop && <View style={[styles.dot, { backgroundColor: c.primary[400] }]} />}
        </Pressable>;
      })}
      {!desktop && <Pressable
        accessibilityRole="button"
        accessibilityLabel="More destinations"
        accessibilityState={{ expanded: moreOpen }}
        onPress={() => setMoreOpen(true)}
        style={({ pressed }) => [styles.link, styles.mobileLink, {
          backgroundColor: moreSelected ? c.neutral[800] : 'transparent',
          opacity: pressed ? 0.65 : 1,
        }]}>
        <MoreHorizontal size={22} color={moreSelected ? c.primary[400] : c.neutral[400]} />
        <Text style={[styles.mobileLabel, {
          color: moreSelected ? c.neutral[50] : c.neutral[400],
        }]}>More</Text>
      </Pressable>}
    </View>
    <Modal visible={!desktop && !keyboardVisible && moreOpen} transparent
      animationType="slide" onRequestClose={() => setMoreOpen(false)}>
      <View style={styles.modalShell}>
        <Pressable style={StyleSheet.absoluteFill}
          accessibilityRole="button" accessibilityLabel="Close more destinations"
          onPress={() => setMoreOpen(false)} />
        <View accessibilityViewIsModal
          style={[styles.sheet, {
            backgroundColor: c.neutral[950], borderColor: c.neutral[700],
            paddingBottom: Math.max(insets.bottom, 16),
          }]}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header"
              style={[styles.sheetTitle, { color: c.neutral[50] }]}>More</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close more destinations"
              onPress={() => setMoreOpen(false)} style={styles.closeButton}>
              <X size={24} color={c.neutral[300]} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {secondaryRoutes.map(route => {
              const item = items[route.name as keyof typeof items];
              const Icon = item.icon;
              const selected = route.key === state.routes[state.index]?.key;
              return <Pressable key={route.key} accessibilityRole="button"
                accessibilityLabel={item.label} accessibilityState={{ selected }}
                onPress={() => openRoute(route)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.sheetLink, {
                  backgroundColor: selected ? c.neutral[800] : 'transparent',
                  opacity: pressed ? 0.65 : 1,
                }]}>
                <Icon size={24} color={selected ? c.primary[400] : c.neutral[300]} />
                <Text style={[styles.sheetLabel, { color: c.neutral[50] }]}>{item.label}</Text>
                {selected && <Text style={{ color: c.primary[300] }}>Current</Text>}
              </Pressable>;
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
    {desktop && <View style={[styles.footer, { borderColor: c.neutral[700] }]}>
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
  mobileLink: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 56, padding: 6 },
  label: { fontSize: 13, fontFamily: 'Inter-Medium' }, mobileLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },
  modalShell: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 22, fontFamily: 'Inter-SemiBold' },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sheetLink: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, padding: 16, borderRadius: 14, marginBottom: 6 },
  sheetLabel: { flex: 1, fontSize: 17, fontFamily: 'Inter-Medium' },
  dot: { width: 5, height: 5, borderRadius: 3, marginLeft: 'auto' },
  footer: { borderTopWidth: 1, paddingTop: 20, paddingBottom: 6, gap: 7 }, footerTitle: { fontSize: 11, fontFamily: 'Inter-Medium' }, footerText: { fontSize: 10, lineHeight: 17, fontFamily: 'Inter-Regular' },
});
