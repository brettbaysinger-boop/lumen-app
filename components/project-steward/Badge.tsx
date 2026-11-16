import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import type { Tone } from '@/lib/project-steward/status';

export const TONE_COLORS: Record<Tone, { bg: string; fg: string; border: string }> = {
  good: { bg: Colors.success[900], fg: Colors.success[200], border: Colors.success[700] },
  info: { bg: Colors.primary[900], fg: Colors.primary[200], border: Colors.primary[700] },
  warn: { bg: Colors.warning[900], fg: Colors.warning[200], border: Colors.warning[700] },
  bad: { bg: Colors.error[900], fg: Colors.error[200], border: Colors.error[700] },
  muted: { bg: Colors.neutral[800], fg: Colors.neutral[300], border: Colors.neutral[700] },
};

interface BadgeProps {
  label: string;
  tone: Tone;
  /** Short prefix such as "Dev" or "Deploy" so the two axes are never confused. */
  prefix?: string;
  testID?: string;
}

export function Badge({ label, tone, prefix, testID }: BadgeProps) {
  const c = TONE_COLORS[tone];
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}
      accessibilityLabel={prefix ? `${prefix}: ${label}` : label}
    >
      {prefix ? <Text style={[styles.prefix, { color: c.fg }]}>{prefix}</Text> : null}
      <Text style={[styles.label, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function DemoBadge() {
  return (
    <View style={styles.demo} testID="ps-demo-badge" accessibilityLabel="Demo fixture data">
      <Text style={styles.demoText}>DEMO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  prefix: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    opacity: 0.75,
    textTransform: 'uppercase',
  },
  label: {
    ...Typography.caption,
    fontFamily: Typography.fontFamilyMedium,
  },
  demo: {
    backgroundColor: Colors.secondary[500],
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  demoText: {
    ...Typography.small,
    fontFamily: Typography.fontFamilyBold,
    color: Colors.neutral[950],
    letterSpacing: 1,
  },
});
