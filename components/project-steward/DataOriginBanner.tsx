import { StyleSheet, Text, View } from 'react-native';
import { FlaskConical, Radio, TriangleAlert } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import { absoluteUtc, freshness, relativeAge } from '@/lib/project-steward/status';
import type { DataOrigin, ProjectSnapshot } from '@/lib/project-steward/types';
import { DemoBadge } from './Badge';
import { useStaleAfterMs } from './StalePolicy';

interface Props {
  origin: DataOrigin;
  snapshot: ProjectSnapshot;
  receivedAt: string;
  now: number;
}

/** Always-visible statement of where the data came from and how old it is. */
export function DataOriginBanner({ origin, snapshot, receivedAt, now }: Props) {
  const staleAfterMs = useStaleAfterMs();
  const stale = freshness(snapshot.generated_at, now, staleAfterMs) !== 'fresh';
  if (origin === 'demo-fixture') {
    return (
      <View style={[styles.banner, styles.demo]} testID="ps-origin-demo" accessibilityRole="alert">
        <View style={styles.row}>
          <FlaskConical color={Colors.secondary[300]} size={18} strokeWidth={2} />
          <DemoBadge />
          <Text style={styles.demoTitle}>Demo fixture, offline sample data</Text>
        </View>
        <Text style={styles.body}>
          Nothing on this screen is live. Statuses are illustrative and are not a production
          health check. Fixture written {absoluteUtc(snapshot.generated_at)}.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.banner, stale ? styles.stale : styles.live]}
      testID={stale ? 'ps-origin-live-stale' : 'ps-origin-live'}
    >
      <View style={styles.row}>
        {stale ? (
          <TriangleAlert color={Colors.warning[300]} size={18} strokeWidth={2} />
        ) : (
          <Radio color={Colors.primary[300]} size={18} strokeWidth={2} />
        )}
        <Text style={stale ? styles.staleTitle : styles.liveTitle}>
          {stale ? 'Live API, snapshot is STALE' : 'Live API snapshot'}
        </Text>
      </View>
      <Text style={styles.body}>
        Generated {absoluteUtc(snapshot.generated_at)} ({relativeAge(snapshot.generated_at, now)}).
        Received {relativeAge(receivedAt, now)}. Read-only, contract v{snapshot.version}. Stale after{' '}
        {Math.round(staleAfterMs / 3_600_000)}h.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  demo: { backgroundColor: Colors.secondary[900], borderColor: Colors.secondary[600] },
  live: { backgroundColor: Colors.primary[900], borderColor: Colors.primary[700] },
  stale: { backgroundColor: Colors.warning[900], borderColor: Colors.warning[600] },
  demoTitle: {
    ...Typography.bodyMedium,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.secondary[100],
    flexShrink: 1,
  },
  liveTitle: {
    ...Typography.bodyMedium,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.primary[100],
  },
  staleTitle: {
    ...Typography.bodyMedium,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.warning[100],
  },
  body: { ...Typography.caption, color: Colors.neutral[200] },
});
