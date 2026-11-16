import { Linking, StyleSheet, Text, View } from 'react-native';
import { Workflow } from 'lucide-react-native';
import { Colors, Spacing, Typography } from '@/lib/theme';
import { CI_LABEL, CI_TONE, refUrl } from '@/lib/project-steward/status';
import type { CiEvidence, CiState } from '@/lib/project-steward/insights';
import { Badge } from './Badge';
import { FreshnessLine } from './Freshness';
import { Section } from './Section';

const EXPLAIN: Record<CiState, string> = {
  passing: 'Automated checks pass on this branch. That is about the code, not about any deployment.',
  failing: 'Automated checks fail on this branch.',
  pending: 'Checks were still running when this was read.',
  none: 'No CI runs exist for this branch, so CI says nothing either way.',
  unknown: 'CI state could not be determined.',
};

/** Default-branch CI as its own evidence source, with its own checked time. */
export function CiPanel({ ci, now }: { ci: CiEvidence | null; now: number }) {
  const url = ci ? refUrl(ci.run_ref, 'unknown') : null;
  return (
    <Section title="Default-branch CI" icon={Workflow} testID="ps-detail-ci">
      {ci ? (
        <>
          <View style={styles.row}>
            <Badge label={CI_LABEL[ci.state]} tone={CI_TONE[ci.state]} />
            <Text style={styles.mono}>
              {ci.branch}
              {ci.commit_sha ? ` @${ci.commit_sha.slice(0, 7)}` : ''}
            </Text>
          </View>
          <Text style={styles.muted}>{EXPLAIN[ci.state]}</Text>
          {url ? (
            <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(url)}>
              Open run
            </Text>
          ) : null}
          <FreshnessLine observedAt={ci.observed_at} now={now} verbose />
        </>
      ) : (
        <Text style={styles.muted} testID="ps-ci-missing">
          Not collected. CI status is unknown.
        </Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  mono: { ...Typography.caption, fontFamily: 'monospace', color: Colors.neutral[300] },
  muted: { ...Typography.caption, color: Colors.neutral[400] },
  link: { ...Typography.caption, fontSize: 14, color: Colors.primary[200], textDecorationLine: 'underline' },
});
