import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ExtendedThemeColors } from '@/lib/theme';
import type { CompanionState } from '@/types/database';
import { getMoodFromState, getMoodLabel } from '@/hooks/useCompanionState';

interface StateGlowProps {
  colors: ExtendedThemeColors;
  state: CompanionState | null;
  size?: number;
  showLabel?: boolean;
}

export function StateGlow({ colors: c, state, size = 12, showLabel = false }: StateGlowProps) {
  const mood = useMemo(() => getMoodFromState(state), [state]);
  const label = useMemo(() => getMoodLabel(mood), [mood]);

  const { intensity, color } = useMemo(() => {
    const moodIntensities: Record<string, number> = {
      curious: 0.9, content: 0.7, thinking: 0.6, resting: 0.25, idle: 0.45,
    };
    const moodColors: Record<string, string> = {
      curious: c.primary[400], content: c.primary[300], thinking: c.primary[500],
      resting: c.primary[700], idle: c.primary[400],
    };
    return { intensity: moodIntensities[mood], color: moodColors[mood] };
  }, [mood, c]);

  const glowSize = size + 12;

  return (
    <View style={styles.container}>
      <View style={[styles.glow, {
        width: glowSize, height: glowSize, borderRadius: glowSize / 2,
        backgroundColor: color, opacity: 0.25 * intensity,
      }]} />
      <View style={[styles.dot, {
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: 0.4 + intensity * 0.6,
      }]} />
      {showLabel && (
        <Text style={[styles.label, { color: c.primary[300] }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
  glow: { position: 'absolute', left: 0 },
  dot: {},
  label: { fontSize: 11, fontFamily: 'Inter-Medium', marginLeft: 6 },
});
