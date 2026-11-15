import { createElement, useCallback } from 'react';
import { Platform, View } from 'react-native';
import type { AnimatedCompanionSession } from '@/lib/animated-companion';

// The live animated companion. Shown only on web while an avatar session is
// connected; everywhere else the existing CompanionPortrait is used unchanged.
export function AnimatedCompanion({ session, size, borderColor }: { session: AnimatedCompanionSession; size: number; borderColor: string }) {
  const bind = useCallback((element: HTMLVideoElement | null) => { session.attach(element); }, [session]);
  if (Platform.OS !== 'web') return null;
  return (
    <View accessibilityLabel="Animated companion" style={{ width: size, height: size, borderRadius: size * 0.12, overflow: 'hidden', borderWidth: 1, borderColor, backgroundColor: '#000' }}>
      {createElement('video', { ref: bind, autoPlay: true, playsInline: true, muted: true, style: { width: '100%', height: '100%', objectFit: 'cover' } })}
    </View>
  );
}
