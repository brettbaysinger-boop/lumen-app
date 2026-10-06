import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import type { Mood } from '@/hooks/useCompanionState';

const HALF_BREATH_MS: Record<Mood, number> = {
  thinking: 700,
  curious: 1300,
  content: 1800,
  idle: 2000,
  resting: 2800,
};

const DEPTH: Record<Mood, number> = {
  thinking: 0.035,
  curious: 0.03,
  content: 0.025,
  idle: 0.022,
  resting: 0.012,
};

export function useBreathing(mood: Mood) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = HALF_BREATH_MS[mood];
    const ease = Easing.inOut(Easing.sin);
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration, easing: ease, useNativeDriver }),
        Animated.timing(progress, { toValue: 0, duration, easing: ease, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mood, progress]);

  const depth = DEPTH[mood];
  return {
    scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + depth] }),
    glowScale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + depth * 2.5] }),
    glow: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.4] }),
  };
}
