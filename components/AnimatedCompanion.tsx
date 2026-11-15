import { createElement, useCallback, useState } from 'react';
import { Platform, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { AnimatedCompanionSession } from '@/lib/animated-companion';
import { ANIMATED_SIZE_LABELS, animatedDisplayEdge, defaultAnimatedSize, isAnimatedSize, stepAnimatedSize, type AnimatedSize } from '@/lib/animated-companion-core';

const SIZE_KEY = 'lumen.animated.size';
// The chosen size is remembered in this browser only. Storage may be unavailable; then the default is used.
function rememberedSize(): AnimatedSize | null {
  try { const value = globalThis.localStorage?.getItem(SIZE_KEY); return isAnimatedSize(value) ? value : null; } catch { return null; }
}
function rememberSize(size: AnimatedSize) { try { globalThis.localStorage?.setItem(SIZE_KEY, size); } catch {} }

// The live animated companion. Shown only on web while an avatar session is
// connected; everywhere else the existing CompanionPortrait is used unchanged.
// Changing the size only changes the box around the one video element: the
// element, its stream and the avatar session stay exactly as they are.
export function AnimatedCompanion({ session, borderColor, controlColor }: { session: AnimatedCompanionSession; borderColor: string; controlColor: string }) {
  const bind = useCallback((element: HTMLVideoElement | null) => { session.attach(element); }, [session]);
  const { width, height } = useWindowDimensions();
  const [chosen, setChosen] = useState<AnimatedSize | null>(rememberedSize);
  if (Platform.OS !== 'web') return null;
  const size = chosen ?? defaultAnimatedSize(width);
  const edge = animatedDisplayEdge(size, width, height);
  const smaller = stepAnimatedSize(size, -1), larger = stepAnimatedSize(size, 1);
  const choose = (next: AnimatedSize | null) => { if (next) { setChosen(next); rememberSize(next); } };
  const control = (label: string, next: AnimatedSize | null) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} animated companion`} accessibilityState={{ disabled: !next }} disabled={!next} onPress={() => choose(next)} hitSlop={8}>
      <Text style={{ color: controlColor, fontSize: 12, opacity: next ? 1 : 0.35 }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ alignItems: 'center', maxWidth: '100%' }}>
      <View accessibilityLabel="Animated companion" style={{ width: edge, height: edge, maxWidth: '100%', borderRadius: edge * 0.12, overflow: 'hidden', borderWidth: 1, borderColor, backgroundColor: '#000' }}>
        {createElement('video', { ref: bind, autoPlay: true, playsInline: true, muted: true, style: { width: '100%', height: '100%', objectFit: 'cover' } })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
        {control('Shrink', smaller)}
        <Text accessibilityLabel={`Animated companion size: ${ANIMATED_SIZE_LABELS[size]}`} style={{ color: controlColor, fontSize: 12, opacity: 0.6 }}>{ANIMATED_SIZE_LABELS[size]}</Text>
        {control('Expand', larger)}
      </View>
    </View>
  );
}
