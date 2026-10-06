import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, AccessibilityInfo } from 'react-native';
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

export function useBreathing(mood: Mood, enabled = true) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || reduced) { progress.setValue(0); return; }
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
  }, [mood, progress, enabled, reduced]);

  const depth = DEPTH[mood];
  return {
    scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + depth] }),
    glowScale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + depth * 2.5] }),
    glow: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.4] }),
  };
}
