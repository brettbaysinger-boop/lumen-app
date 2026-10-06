import { useMemo } from 'react';
import { View, StyleSheet, Image, Animated } from 'react-native';
import { usePortraitSource } from '@/lib/portraits';
import { useBreathing } from '@/hooks/useBreathing';
import type { ExtendedThemeColors } from '@/lib/theme';
import type { Mood } from '@/hooks/useCompanionState';

interface CompanionPortraitProps {
  colors: ExtendedThemeColors;
  size: number;
  mood?: Mood;
  glowIntensity?: number;
  portraitUrl?: string | null;
}

export function CompanionPortrait({ colors: c, size, mood = 'idle', glowIntensity, portraitUrl }: CompanionPortraitProps) {
  const source = usePortraitSource(portraitUrl);
  const breath = useBreathing(mood);
  const intensity = useMemo(() => {
    if (glowIntensity !== undefined) return Math.max(0.15, Math.min(1, glowIntensity));
    const moodIntensities: Record<Mood, number> = {
      curious: 0.9, content: 0.7, thinking: 0.6, resting: 0.25, idle: 0.45,
    };
    return moodIntensities[mood];
  }, [mood, glowIntensity]);

  const glowColor = useMemo(() => {
    const moodColors: Record<Mood, string> = {
      curious: c.primary[400],
      content: c.primary[300],
      thinking: c.primary[500],
      resting: c.primary[700],
      idle: c.primary[400],
    };
    return moodColors[mood];
  }, [mood, c]);

  const frameBorderWidth = 1;
  const innerSize = size - frameBorderWidth * 2;
  const glow1Size = size + 16;
  const glow2Size = size + 8;

  return (
    <View style={[styles.container, { width: size + 20, height: size + 20 }]}>
      <Animated.View style={[styles.glowOuter, {
        width: glow1Size, height: glow1Size, borderRadius: glow1Size / 2,
        backgroundColor: glowColor,
        opacity: Animated.multiply(breath.glow, 0.12 * intensity),
        transform: [{ scale: breath.glowScale }],
      }]} />
      <Animated.View style={[styles.glowInner, {
        width: glow2Size, height: glow2Size, borderRadius: glow2Size / 2,
        backgroundColor: glowColor,
        opacity: Animated.multiply(breath.glow, 0.18 * intensity),
        transform: [{ scale: breath.glowScale }],
      }]} />
      <Animated.View style={[styles.frame, {
        width: size, height: size, borderRadius: size / 2,
        borderColor: c.primary[700], borderWidth: frameBorderWidth,
        transform: [{ scale: breath.scale }],
      }]}>
        <View style={[styles.innerFrame, {
          width: innerSize, height: innerSize, borderRadius: innerSize / 2,
          borderColor: c.neutral[700], borderWidth: 1,
        }]}>
          <Image
            source={source}
            style={[styles.image, {
              width: innerSize - 2, height: innerSize - 2,
              borderRadius: (innerSize - 2) / 2,
            }]}
            resizeMode="cover"
            accessibilityLabel="Companion portrait"
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  glowOuter: { position: 'absolute' },
  glowInner: { position: 'absolute' },
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  innerFrame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { overflow: 'hidden' },
});
