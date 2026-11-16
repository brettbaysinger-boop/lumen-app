// The 🔒 Private / 👥 Public chip (Issue #39), shown in ordinary Chat, Video Chat and Theater.
// It only changes a remembered word (lib/privacy-mode.ts). It never connects, closes or reloads
// anything, so the conversation and live video keep running while it is flipped.
// Owner, 2026-11-16: small and discreet. One tap switches; no banner, no confirmation.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExtendedThemeColors } from '@/lib/theme';
import { choosePrivacyMode, usePrivacyMode, type PrivacyMode } from '@/lib/privacy-mode';

const LABEL: Record<PrivacyMode, string> = { private: '🔒 Private', public: '👥 Public' };
/** What the mode covers. Read out with the chip, and shown by the ⓘ button next to it in Chat. */
export const PRIVACY_SCOPE =
  'Public mode covers Chat and Live Room only: Lumen keeps personal things to herself and earlier private messages are left out. Other tabs are not covered.';

/** One chip: tap to switch. `overlay` is the style used over the live video, readable on any frame. */
export function PrivacyToggle({ c, overlay = false, onInfo }: { c: ExtendedThemeColors; overlay?: boolean; onInfo?: () => void }) {
  const { mode } = usePrivacyMode();
  const isPublic = mode === 'public';
  const chip = <Pressable accessibilityRole="switch" accessibilityLabel="Public mode"
    accessibilityHint={PRIVACY_SCOPE} accessibilityState={{ checked: isPublic }} aria-checked={isPublic}
    onPress={() => choosePrivacyMode(isPublic ? 'private' : 'public')} hitSlop={8}
    style={({ pressed }) => [styles.chip, overlay
      ? { backgroundColor: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.25)' }
      : { backgroundColor: 'transparent', borderColor: c.neutral[700] }, { opacity: pressed ? 0.7 : 1 }]}>
    <Text numberOfLines={1} style={[styles.label, { color: overlay ? '#ffffff' : c.neutral[300] }]}>{LABEL[mode]}</Text>
  </Pressable>;
  if (!onInfo) return <View accessibilityLabel="Who might be nearby" style={styles.row}>{chip}</View>;
  return <View accessibilityLabel="Who might be nearby" style={styles.row}>
    {chip}
    <Pressable accessibilityRole="button" accessibilityLabel="What Public mode covers" onPress={onInfo} hitSlop={8}
      style={({ pressed }) => [styles.info, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: c.neutral[500], fontSize: 13 }}>ⓘ</Text>
    </Pressable>
  </View>;
}

/** Video Chat before the video is on: the chip on its own small row, at the right. */
export function PrivacyBar({ c }: { c: ExtendedThemeColors }) {
  return <View style={styles.bar}><PrivacyToggle c={c} /></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4, width: '100%', maxWidth: 800, alignSelf: 'center' },
  // About 28 px to look at; hitSlop makes the touch target at least 44 px.
  chip: { minHeight: 28, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontFamily: 'Inter-Medium' },
  info: { minHeight: 28, minWidth: 24, alignItems: 'center', justifyContent: 'center' },
});
