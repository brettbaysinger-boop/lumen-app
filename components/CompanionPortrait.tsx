import { useTheme } from '@/lib/theme-context';
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
  speaking?: boolean;
}

export function CompanionPortrait({ colors: c, size, mood = 'idle', glowIntensity, portraitUrl, speaking = false }: CompanionPortraitProps) {
  const source = usePortraitSource(portraitUrl);
  const { appearance } = useTheme();
  const breath = useBreathing(speaking ? 'thinking' : mood, appearance.motion);
  const height = appearance.frame === 'oval' ? size * 1.2 : size;
  const radius = appearance.frame === 'rounded' ? size * .22 : appearance.frame === 'none' ? size * .15 : size / 2;
  const border = appearance.finish === 'gold' ? c.gold[400] : appearance.finish === 'silver' ? '#b8bec7' : c.primary[400];
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
    <View style={[styles.container, { width: size + 12, height: height + 12 }]}>
      <Animated.View style={[styles.glowOuter, {
        width: glow1Size, height: height + 16, borderRadius: radius + 8,
        backgroundColor: glowColor,
        opacity: Animated.multiply(breath.glow, (speaking ? .26 : .12) * intensity),
        transform: [{ scale: breath.glowScale }],
      }]} />
      <Animated.View style={[styles.glowInner, {
        width: glow2Size, height: height + 8, borderRadius: radius + 4,
        backgroundColor: glowColor,
        opacity: Animated.multiply(breath.glow, (speaking ? .3 : .18) * intensity),
        transform: [{ scale: breath.glowScale }],
      }]} />
      <Animated.View style={[styles.frame, {
        width: size, height, borderRadius: radius,
        borderColor: border, borderWidth: appearance.frame === 'none' ? 0 : frameBorderWidth,
        transform: [{ scale: breath.scale }],
      }]}>
        <View style={[styles.innerFrame, {
          width: innerSize, height: height - frameBorderWidth * 2, borderRadius: radius - 1,
          borderColor: c.neutral[700], borderWidth: 0,
        }]}>
          <Image
            source={source}
            style={[styles.image, {
              width: innerSize - 2, height: height - frameBorderWidth * 2 - 2,
              borderRadius: radius - 2, opacity: appearance.portraitOpacity,
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
