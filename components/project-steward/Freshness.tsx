import { StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Colors, Spacing, Typography } from '@/lib/theme';
import { absoluteUtc, freshness, relativeAge } from '@/lib/project-steward/status';
import { useStaleAfterMs } from './StalePolicy';

interface Props {
  observedAt: string | null;
  now: number;
  verbose?: boolean;
  testID?: string;
}

/** "Checked 3h ago", "STALE · checked 8d ago" or "UNKNOWN · never checked". */
export function FreshnessLine({ observedAt, now, verbose, testID }: Props) {
  const f = freshness(observedAt, now, useStaleAfterMs());
  const color =
    f === 'fresh' ? Colors.neutral[400] : f === 'stale' ? Colors.warning[300] : Colors.error[300];
  const tag = f === 'stale' ? 'STALE · ' : f === 'unknown' ? 'UNKNOWN · ' : '';
  const text = observedAt ? `checked ${relativeAge(observedAt, now)}` : 'never checked';
  return (
    <View style={styles.row} testID={testID ?? `ps-freshness-${f}`}>
      <Clock color={color} size={13} strokeWidth={2} />
      <Text style={[styles.text, { color }]}>
        {tag}
        {tag ? text : text.charAt(0).toUpperCase() + text.slice(1)}
        {verbose && observedAt ? ` (${absoluteUtc(observedAt)})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexShrink: 1 },
  text: { ...Typography.caption, flexShrink: 1 },
});
