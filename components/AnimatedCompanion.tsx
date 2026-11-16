import { createElement, useCallback, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import type { AnimatedCompanionSession } from '@/lib/animated-companion';
import { liveRoomBox, type RoomMode } from '@/lib/live-room';
import { ANIMATED_SIZE_LABELS, animatedDisplayBox, defaultAnimatedSize, isAnimatedSize, stepAnimatedSize, type AnimatedSize } from '@/lib/animated-companion-core';

const SIZE_KEY = 'lumen.animated.size';
// The chosen size is remembered in this browser only. Storage may be unavailable; then the default is used.
function rememberedSize(): AnimatedSize | null {
  try { const value = globalThis.localStorage?.getItem(SIZE_KEY); return isAnimatedSize(value) ? value : null; } catch { return null; }
}
function rememberSize(size: AnimatedSize) { try { globalThis.localStorage?.setItem(SIZE_KEY, size); } catch {} }

// The live animated companion. Shown only on web while an avatar session is
// connected; everywhere else the existing CompanionPortrait is used unchanged.
// Changing the size only changes the box around the one video element and how
// the picture fills it: the element, its stream and the avatar session stay
// exactly as they are. The square sizes have rounded corners; the uncropped size
// has square corners, because a rounded corner would cut off pixels of the frame.
//
// In the Live Room (`room` given) there are no size choices: Video Chat shows a compact whole 3:2
// frame and Theater shows the largest whole 3:2 frame that fits the space. Going from one to the
// other is again only a different box around the same element.
export function AnimatedCompanion({ session, borderColor, controlColor, room }: { session: AnimatedCompanionSession; borderColor: string; controlColor: string; room?: RoomMode }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const bind = useCallback((element: HTMLVideoElement | null) => { video.current = element; session.attach(element); }, [session]);
  // The browser's own full screen, for a phone held sideways. It shows the same element, so the
  // stream and the avatar session are untouched. Offered for the uncropped size only, and only
  // where the browser can do it.
  const fullScreen = useCallback(() => { try { void video.current?.requestFullscreen?.()?.catch?.(() => {}); } catch {} }, []);
  const canFullScreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const { width: windowWidth, height } = useWindowDimensions();
  const [chosen, setChosen] = useState<AnimatedSize | null>(rememberedSize);
  // The width of the column this sits in: narrower than the window while the sidebar is open.
  const [column, setColumn] = useState<number | null>(null);
  // In Theater the height of the space matters too: the frame is fitted inside it.
  const [space, setSpace] = useState<number | null>(null);
  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width), tall = Math.floor(event.nativeEvent.layout.height ?? 0);
    setColumn(now => now === next ? now : next); setSpace(now => now === tall ? now : tall);
  }, []);
  if (Platform.OS !== 'web') return null;
  const size = chosen ?? defaultAnimatedSize(windowWidth);
  const available = Math.min(windowWidth, column && column > 0 ? column : windowWidth);
  const box = room ? { ...liveRoomBox(room, available, room === 'theater' ? (space && space > 0 ? space : height * 0.6) : height), contain: true }
    : animatedDisplayBox(size, available, height);
  const smaller = stepAnimatedSize(size, -1), larger = stepAnimatedSize(size, 1);
  const choose = (next: AnimatedSize | null) => { if (next) { setChosen(next); rememberSize(next); } };
  const control = (label: string, next: AnimatedSize | null) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} animated companion`} accessibilityState={{ disabled: !next }} disabled={!next} onPress={() => choose(next)} hitSlop={8}>
      <Text style={{ color: controlColor, fontSize: 12, opacity: next ? 1 : 0.35 }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View onLayout={measure} style={[{ alignSelf: 'stretch', alignItems: 'center', maxWidth: '100%' }, room === 'theater' && { flex: 1, minHeight: 0, justifyContent: 'center' }]}>
      <View accessibilityLabel="Animated companion" style={{ width: box.width, height: box.height, maxWidth: '100%', borderRadius: box.contain ? 0 : box.height * 0.12, overflow: 'hidden', borderWidth: room ? 0 : 1, borderColor, backgroundColor: '#000' }}>
        {createElement('video', { ref: bind, autoPlay: true, playsInline: true, muted: true, style: { width: '100%', height: '100%', objectFit: box.contain ? 'contain' : 'cover' } })}
      </View>
      {!room && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
        {control('Shrink', smaller)}
        <Text accessibilityLabel={`Animated companion size: ${ANIMATED_SIZE_LABELS[size]}`} style={{ color: controlColor, fontSize: 12, opacity: 0.6 }}>{ANIMATED_SIZE_LABELS[size]}</Text>
        {control('Expand', larger)}
        {box.contain && canFullScreen && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show animated companion full screen" onPress={fullScreen} hitSlop={8}>
          <Text style={{ color: controlColor, fontSize: 12 }}>Full screen</Text>
        </TouchableOpacity>}
      </View>}
    </View>
  );
}
