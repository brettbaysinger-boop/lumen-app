// The 🔒 Private | 👥 Public switch (Issue #39), shown in ordinary Chat, Video Chat and Theater.
// It only changes a remembered word (lib/privacy-mode.ts). It never connects, closes or reloads
// anything, so the conversation and live video keep running while it is flipped.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExtendedThemeColors } from '@/lib/theme';
import { choosePrivacyMode, usePrivacyMode, type PrivacyMode } from '@/lib/privacy-mode';

// Fixed colours, the same in every theme, so the two states never look alike: calm teal for
// "just us", amber for "people may be nearby".
const FILL: Record<PrivacyMode, string> = { private: '#3ac7be', public: '#f5a524' };
const LABEL: Record<PrivacyMode, string> = { private: '🔒 Private', public: '👥 Public' };
const HINT: Record<PrivacyMode, string> = {
  private: 'Private mode: just you. In Chat and Live Room, Lumen can use your memories, documents and earlier chats.',
  public: 'Public mode for Chat and Live Room: people may be nearby. Lumen keeps personal things to herself here. Other tabs are not covered.',
};

/** Two-segment switch. `overlay` is the style used over the live video, readable on any frame. */
export function PrivacyToggle({ c, overlay = false }: { c: ExtendedThemeColors; overlay?: boolean }) {
  const { mode } = usePrivacyMode();
  const segment = (value: PrivacyMode) => {
    const selected = mode === value;
    return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={HINT[value]}
      accessibilityState={{ selected, checked: selected }} aria-checked={selected}
      onPress={() => choosePrivacyMode(value)} hitSlop={4}
      style={({ pressed }) => [styles.segment, overlay && styles.overlaySegment, {
        backgroundColor: selected ? FILL[value] : 'transparent', opacity: pressed ? 0.75 : 1 }]}>
      <Text numberOfLines={1} style={[styles.label, overlay && styles.overlayLabel, {
        color: selected ? '#10141c' : overlay ? '#ffffff' : c.neutral[200] }]}>{LABEL[value]}</Text>
    </Pressable>;
  };
  return <View accessibilityRole="radiogroup" accessibilityLabel="Who might be nearby"
    style={[styles.group, overlay
      ? { backgroundColor: 'rgba(0,0,0,0.62)', borderColor: 'rgba(255,255,255,0.28)' }
      : { backgroundColor: c.neutral[900], borderColor: mode === 'public' ? FILL.public : c.neutral[700] }]}>
    {segment('private')}{segment('public')}
  </View>;
}

/** The switch with a one-line note under it while Public is on. Used above the conversation. */
export function PrivacyBar({ c }: { c: ExtendedThemeColors }) {
  const { mode, restored } = usePrivacyMode();
  return <View style={styles.bar}>
    <PrivacyToggle c={c} />
    {mode === 'public' && <Text accessibilityLiveRegion="polite" numberOfLines={2}
      style={{ color: c.isDark ? '#f7c76b' : '#8a5300', fontSize: 12, textAlign: 'center' }}>
      {restored ? 'Still in Public mode from before. ' : ''}Chat and Live Room only: personal things stay private here and earlier private messages are hidden. Other tabs are not covered.
    </Text>}
  </View>;
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, width: '100%', maxWidth: 800, alignSelf: 'center' },
  group: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, padding: 3, gap: 2 },
  segment: { minHeight: 38, minWidth: 104, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  overlaySegment: { minHeight: 36, minWidth: 0, paddingHorizontal: 11 },
  overlayLabel: { fontSize: 14 },
});
