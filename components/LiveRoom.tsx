// The Live Room's own chrome: one header row, one row of real buttons, and the two small controls
// that sit over the video in Theater. Layout only. The avatar session, the conversation and the
// message box belong to the chat screen and are not touched here.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExtendedThemeColors } from '@/lib/theme';
import type { AnimatedState } from '@/lib/animated-companion';

type Colors = ExtendedThemeColors;

/** A real button: outline, 40+ px tall. Also used for the phone app's chat header actions. */
export function Pill({ c, label, hint, onPress, disabled, filled, role = 'button', checked, busy }: {
  c: Colors; label: string; hint: string; onPress: () => void; disabled?: boolean; filled?: boolean;
  role?: 'button' | 'switch'; checked?: boolean; busy?: boolean;
}) {
  return <Pressable accessibilityRole={role} accessibilityLabel={hint} disabled={disabled} onPress={onPress} hitSlop={4}
    accessibilityState={{ disabled: !!disabled, ...(role === 'switch' ? { checked: !!checked, busy: !!busy } : {}) }}
    {...(role === 'switch' ? { 'aria-checked': !!checked, 'aria-busy': !!busy } : {})}
    style={({ pressed }) => [styles.pill, { borderColor: filled ? c.primary[400] : c.neutral[700], backgroundColor: filled ? c.primary[400] : c.neutral[900], opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text numberOfLines={1} style={[styles.pillText, { color: filled ? c.neutral[950] : c.neutral[100] }]}>{label}</Text>
  </Pressable>;
}

/** Video Chat header: back (in the phone app), the companion's name and a short status, Theater, and a menu. */
export function LiveRoomHeader({ c, name, live, thinking, onBack, onTheater, menu }: {
  c: Colors; name: string; live: AnimatedState; thinking: boolean;
  onBack?: () => void; onTheater: () => void;
  /** Less-used actions. Each closes the menu when chosen. `extra` is shown under them (the model choice). */
  menu: { items: { label: string; onPress: () => void }[]; extra?: ReactNode };
}) {
  const [open, setOpen] = useState(false);
  const status = thinking ? 'Thinking…' : live === 'ready' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Video off';
  return <View style={[styles.header, { borderBottomColor: c.neutral[800] }]}>
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Close live video and return to the chat" onPress={onBack} hitSlop={6} style={styles.plain}>
      <Text style={{ color: c.primary[300], fontSize: 15 }}>‹ Chat</Text>
    </Pressable>}
    <View style={styles.title}>
      <Text accessibilityRole="header" numberOfLines={1} style={{ color: c.neutral[100], fontSize: 16, fontFamily: 'Inter-SemiBold', flexShrink: 1 }}>{name}</Text>
      <View accessibilityLiveRegion="polite" accessibilityLabel={`Live video: ${status}`} style={styles.status}>
        <View style={[styles.dot, { backgroundColor: live === 'ready' ? c.success[400] : live === 'connecting' ? c.warning[400] : c.neutral[500] }]} />
        <Text numberOfLines={1} style={{ color: c.neutral[400], fontSize: 12 }}>{status}</Text>
      </View>
    </View>
    <Pill c={c} label="Theater" hint={live === 'ready' ? 'Switch to Companion Theater' : 'Companion Theater opens once live video is on'} disabled={live !== 'ready'} onPress={onTheater} />
    <Pressable accessibilityRole="button" accessibilityLabel="More actions" accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => setOpen(true)} hitSlop={6} style={styles.plain}>
      <Text style={{ color: c.neutral[200], fontSize: 20, lineHeight: 22 }}>⋯</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.menuShell}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close more actions" onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={[styles.menu, { backgroundColor: c.neutral[950], borderColor: c.neutral[700] }]}>
          {menu.items.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => { setOpen(false); item.onPress(); }}
            style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.65 : 1 }]}>
            <Text style={{ color: c.neutral[100], fontSize: 16 }}>{item.label}</Text>
          </Pressable>)}
          {!!menu.extra && <View style={[styles.menuExtra, { borderTopColor: c.neutral[800] }]}>{menu.extra}</View>}
        </View>
      </View>
    </Modal>
  </View>;
}

/** Video Chat: Live, Documents and Practice as buttons that look like buttons. */
export function LiveRoomActions({ c, live, offered, onLive, onDocuments, onPractice, busy, privacy }: {
  c: Colors; live: AnimatedState; offered: boolean; busy: boolean;
  onLive: () => void; onDocuments: () => void; onPractice: () => void;
  /** The 🔒 Private | 👥 Public switch: in this row, never over the companion's picture. */
  privacy?: ReactNode;
}) {
  const label = live === 'ready' ? 'Live · On' : live === 'connecting' ? 'Connecting…' : offered ? 'Live · Off' : 'Live unavailable';
  return <View style={styles.actions}>
    <Pill c={c} role="switch" label={label} hint="Live video" checked={live !== 'off'} busy={live === 'connecting'} filled={live === 'ready'}
      disabled={live === 'connecting' || (!offered && live === 'off')} onPress={onLive} />
    <Pill c={c} label="Documents" hint="Open your documents" disabled={busy} onPress={onDocuments} />
    <Pill c={c} label="Practice" hint="Open goals and practice" disabled={busy} onPress={onPractice} />
    {privacy}
  </View>;
}

/**
 * Theater: the only controls over the video. Back to Video Chat, the messages panel, and full screen
 * (given only where the browser can do it; inside the phone app it also allows turning the phone).
 */
export function LiveRoomTheaterBar({ messagesOpen, onChat, onMessages, fullScreen, onFullScreen, privacy }: {
  messagesOpen: boolean; onChat: () => void; onMessages: () => void; fullScreen?: boolean; onFullScreen?: () => void;
  /** The 🔒 Private | 👥 Public switch (Issue #39), kept reachable over the video. */
  privacy?: ReactNode;
}) {
  const control = (label: string, hint: string, onPress: () => void, expanded?: boolean) =>
    <Pressable accessibilityRole="button" accessibilityLabel={hint} accessibilityState={expanded === undefined ? {} : { expanded }} {...(expanded === undefined ? {} : { 'aria-expanded': expanded })} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.overlay, { opacity: pressed ? 0.7 : 1 }]}>
      <Text numberOfLines={1} style={styles.overlayText}>{label}</Text>
    </Pressable>;
  // The controls sit over the top of the picture, where the companion's face is. They show when
  // Theater opens and after a tap, and step aside after a few quiet seconds; a tap on the picture
  // brings them back. With a screen reader on (phone app only) they stay.
  const [shown, setShown] = useState(true);
  const [reader, setReader] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = useCallback(() => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), THEATER_CONTROLS_MS);
  }, []);
  useEffect(() => { poke(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [poke]);
  useEffect(() => {
    // In a browser (the room is always one) this cannot be known: react-native-web answers "on" for
    // everyone. There the hidden controls stay one labelled button away ("Show video controls").
    if (Platform.OS === 'web') return;
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled?.().then(on => { if (live) setReader(!!on); }).catch(() => {});
    const watch = AccessibilityInfo.addEventListener?.('screenReaderChanged', on => setReader(!!on));
    return () => { live = false; watch?.remove?.(); };
  }, []);
  const visible = shown || reader;
  const tapped = (action: () => void) => () => { poke(); action(); };
  return <>
    <Pressable testID="theater-picture" accessibilityRole="button" accessibilityLabel={visible ? 'Hide video controls' : 'Show video controls'}
      onPress={() => { if (visible && !reader) { if (timer.current) clearTimeout(timer.current); setShown(false); } else poke(); }}
      style={StyleSheet.absoluteFill} />
    {visible && <View pointerEvents="box-none" style={styles.theaterBar} onTouchStart={poke}>
      {control('‹ Video Chat', 'Leave Companion Theater and return to Video Chat', tapped(onChat))}
      <View pointerEvents="box-none" style={styles.theaterGroup}>
        {privacy}
        {control(messagesOpen ? 'Hide messages' : 'Messages', messagesOpen ? 'Hide the conversation' : 'Show the conversation', tapped(onMessages), messagesOpen)}
        {onFullScreen && control(fullScreen ? 'Exit full screen' : 'Full screen', fullScreen ? 'Leave full screen' : 'Show the video full screen', tapped(onFullScreen))}
      </View>
    </View>}
  </>;
}
/** How long Theater's controls stay over the picture after the last tap. */
export const THEATER_CONTROLS_MS = 4000;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 52, borderBottomWidth: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  plain: { minHeight: 44, minWidth: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  pillText: { fontSize: 14, fontFamily: 'Inter-Medium' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingVertical: 8, width: '100%', maxWidth: 800, alignSelf: 'center' },
  menuShell: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'flex-end' },
  menu: { marginTop: 56, marginRight: 8, minWidth: 230, maxWidth: '92%', borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  menuItem: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  menuExtra: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  theaterBar: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  theaterGroup: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flexShrink: 1 },
  // Over the picture, so fixed colours that stay readable on any frame.
  overlay: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  overlayText: { color: '#ffffff', fontSize: 14, fontFamily: 'Inter-Medium' },
});
