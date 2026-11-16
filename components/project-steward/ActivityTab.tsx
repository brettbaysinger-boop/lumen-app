import { Linking, StyleSheet, Text, View } from 'react-native';
import { GitCommitHorizontal, History, Rocket } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import { absoluteUtc, refUrl, relativeAge } from '@/lib/project-steward/status';
import type { ActivityKind, ProjectInsights } from '@/lib/project-steward/insights';
import { Section } from './Section';

const KIND_LABEL: Record<ActivityKind, string> = {
  commit: 'Commit',
  pr: 'Pull request',
  issue: 'Issue',
  ci: 'CI',
  deploy: 'Deploy',
  decision: 'Decision',
  note: 'Note',
};

function Tile({
  icon: Icon,
  label,
  value,
  detail,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  testID: string;
}) {
  return (
    <View style={styles.tile} testID={testID}>
      <View style={styles.tileHead}>
        <Icon color={Colors.primary[300]} size={16} strokeWidth={2} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </View>
  );
}

interface Props {
  insights: ProjectInsights | null;
  insightsSupported: boolean;
  now: number;
  wide: boolean;
}

export function ActivityTab({ insights, insightsSupported, now, wide }: Props) {
  if (!insights) {
    return (
      <Text style={styles.muted} testID="ps-activity-missing">
        {insightsSupported
          ? 'No activity has been collected for this project.'
          : 'Activity is not available from this source yet (it serves the v1.0 contract, which has no such fields).'}
      </Text>
    );
  }
  const c = insights.last_commit;
  const d = insights.last_deploy;
  const events = [...insights.activity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <View style={styles.stack} testID="ps-panel-activity">
      <View style={[styles.tiles, wide && styles.tilesWide]}>
        <Tile
          icon={GitCommitHorizontal}
          label="Last commit"
          value={c ? relativeAge(c.at, now) : 'Not collected'}
          detail={
            c
              ? `${c.branch}${c.commit_sha ? ` @${c.commit_sha.slice(0, 7)}` : ''} · ${absoluteUtc(c.at)}`
              : 'Unknown, not "none".'
          }
          testID="ps-last-commit"
        />
        <Tile
          icon={Rocket}
          label="Last deploy"
          value={d ? relativeAge(d.at, now) : 'None recorded'}
          detail={
            d
              ? `${d.target}${d.commit_sha ? ` @${d.commit_sha.slice(0, 7)}` : ''} · ${absoluteUtc(d.at)}`
              : 'No dated deployment record. Commits and PRs are not deployments.'
          }
          testID="ps-last-deploy"
        />
      </View>

      <Section title="Recent activity" icon={History} testID="ps-detail-timeline">
        {events.length === 0 ? (
          <Text style={styles.muted}>Nothing recorded.</Text>
        ) : (
          events.map((e, i) => {
            const url = refUrl(e.ref, e.kind === 'pr' ? 'pr' : 'unknown');
            return (
              <View key={`${e.at}-${i}`} style={styles.event} testID="ps-timeline-event">
                <View style={styles.rail}>
                  <View style={styles.dot} />
                  {i < events.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventMeta}>
                    {KIND_LABEL[e.kind]} · {relativeAge(e.at, now)} · {absoluteUtc(e.at)}
                  </Text>
                  <Text
                    style={[styles.eventText, url ? styles.link : null]}
                    accessibilityRole={url ? 'link' : undefined}
                    onPress={url ? () => Linking.openURL(url) : undefined}
                  >
                    {e.text}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  tiles: { gap: Spacing.sm },
  tilesWide: { flexDirection: 'row' },
  tile: {
    flex: 1,
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: 2,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  tileLabel: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
  },
  tileValue: { ...Typography.subheading, color: Colors.neutral[50] },
  muted: { ...Typography.caption, color: Colors.neutral[400] },
  event: { flexDirection: 'row', gap: Spacing.sm },
  rail: { width: 12, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary[400],
    marginTop: 5,
  },
  line: { flex: 1, width: 1, backgroundColor: Colors.neutral[700], marginTop: 2 },
  eventBody: { flex: 1, paddingBottom: Spacing.md, gap: 2 },
  eventMeta: { ...Typography.small, color: Colors.neutral[400] },
  eventText: { ...Typography.caption, fontSize: 14, lineHeight: 20, color: Colors.neutral[100] },
  link: { color: Colors.primary[200] },
});
