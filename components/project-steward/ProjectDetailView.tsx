import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleCheck, CircleHelp, GitBranch, OctagonAlert, Rocket, Wrench } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import {
  DEPLOYMENT_LABEL,
  DEPLOYMENT_TONE,
  DEV_STATE_LABEL,
  DEV_STATE_TONE,
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  PRIORITY_LABEL,
  freshness,
  knownAndUnknown,
  latestSourceAt,
  relativeAge,
} from '@/lib/project-steward/status';
import type { Project } from '@/lib/project-steward/types';
import { Badge, DemoBadge } from './Badge';
import { FreshnessLine } from './Freshness';
import { SourceList } from './SourceList';

interface Props {
  project: Project;
  isDemo: boolean;
  now: number;
  wide: boolean;
}

function Section({
  title,
  icon: Icon,
  children,
  testID,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.sectionHeader}>
        <Icon color={Colors.primary[300]} size={18} strokeWidth={2} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const DEPLOY_EXPLAIN: Record<Project['deployment'], string> = {
  verified_current: 'A host check confirmed this deployment is running now.',
  historically_verified:
    'A deployment was verified in the past. That is not a statement about today.',
  reported: 'Someone reported a deployment, but no host check has confirmed it.',
  not_deployed: 'Recorded as not deployed.',
  unknown: 'No deployment evidence. A merged or draft PR is never treated as a deployment.',
};

export function ProjectDetailView({ project: p, isDemo, now, wide }: Props) {
  const facts = knownAndUnknown(p, now);
  const f = freshness(p.observed_at, now);
  const newestSource = latestSourceAt(p);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.priority}>{PRIORITY_LABEL[p.priority]}</Text>
          {isDemo ? <DemoBadge /> : null}
        </View>
        <Text style={styles.name} accessibilityRole="header" testID="ps-detail-name">
          {p.name}
        </Text>
        <Text style={styles.id}>id: {p.id}</Text>
        {p.summary ? <Text style={styles.summary}>{p.summary}</Text> : null}
        <FreshnessLine observedAt={p.observed_at} now={now} verbose testID="ps-detail-freshness" />
      </View>

      {f !== 'fresh' ? (
        <View style={styles.staleNotice} testID="ps-detail-stale" accessibilityRole="alert">
          <Text style={styles.staleText}>
            {f === 'stale'
              ? `This project's status is stale: last checked ${relativeAge(p.observed_at, now)}. Treat every fact below as possibly out of date.`
              : 'This project has never been checked. Every fact below is unverified.'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.axes, wide && styles.axesWide]}>
        <View style={[styles.axis, wide && styles.axisWide]} testID="ps-detail-development">
          <View style={styles.sectionHeader}>
            <Wrench color={Colors.primary[300]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Development</Text>
          </View>
          <Badge label={DEV_STATE_LABEL[p.state]} tone={DEV_STATE_TONE[p.state]} />
          <Text style={styles.explain}>
            Where the work is. Says nothing about whether it is running anywhere.
          </Text>
        </View>
        <View style={[styles.axis, wide && styles.axisWide]} testID="ps-detail-deployment">
          <View style={styles.sectionHeader}>
            <Rocket color={Colors.primary[300]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Deployment</Text>
          </View>
          <Badge label={DEPLOYMENT_LABEL[p.deployment]} tone={DEPLOYMENT_TONE[p.deployment]} />
          <Text style={styles.explain}>{DEPLOY_EXPLAIN[p.deployment]}</Text>
        </View>
        <View style={[styles.axis, wide && styles.axisWide]}>
          <View style={styles.sectionHeader}>
            <CircleCheck color={Colors.primary[300]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Evidence</Text>
          </View>
          <Badge label={EVIDENCE_LABEL[p.evidence_level]} tone={EVIDENCE_TONE[p.evidence_level]} />
          <Text style={styles.explain}>
            {newestSource
              ? `Newest source observed ${relativeAge(newestSource, now)}.`
              : 'No source timestamps.'}
          </Text>
        </View>
      </View>

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={[styles.col, wide && styles.colWide]}>
          <Section title="Open blockers" icon={OctagonAlert} testID="ps-detail-blockers">
            {p.blocked_by.length === 0 ? (
              <Text style={styles.muted}>
                {p.state === 'blocked'
                  ? 'Marked blocked, but no blocker text was recorded.'
                  : 'None recorded.'}
              </Text>
            ) : (
              p.blocked_by.map((b) => (
                <Text key={b} style={styles.blocker}>
                  • {b}
                </Text>
              ))
            )}
          </Section>

          <Section title="Known vs unknown" icon={CircleHelp} testID="ps-detail-facts">
            <Text style={styles.factHead}>Known (from cited sources)</Text>
            {facts.known.length === 0 ? (
              <Text style={styles.muted}>Nothing established yet.</Text>
            ) : (
              facts.known.map((k) => (
                <Text key={k} style={styles.fact}>
                  ✓ {k}
                </Text>
              ))
            )}
            <Text style={[styles.factHead, { marginTop: Spacing.sm }]}>Unknown</Text>
            {facts.unknown.length === 0 ? (
              <Text style={styles.muted}>No open unknowns.</Text>
            ) : (
              facts.unknown.map((u) => (
                <Text key={u} style={styles.unknown}>
                  ? {u}
                </Text>
              ))
            )}
          </Section>
        </View>

        <View style={[styles.col, wide && styles.colWide]}>
          <Section title="Repositories" icon={GitBranch} testID="ps-detail-repos">
            {p.repositories.length === 0 ? (
              <Text style={styles.muted}>
                None linked. That is allowed: a project can exist without its own repo.
              </Text>
            ) : (
              p.repositories.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => Linking.openURL(`https://github.com/${r}`)}
                  accessibilityRole="link"
                  style={styles.repo}
                >
                  <Text style={styles.repoText}>{r}</Text>
                </Pressable>
              ))
            )}
          </Section>

          <Section title="Verification sources" icon={CircleCheck} testID="ps-detail-sources">
            <SourceList sources={p.sources} now={now} />
          </Section>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  titleBlock: { gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priority: { ...Typography.caption, fontFamily: Typography.fontFamilyBold, color: Colors.primary[300] },
  name: { ...Typography.heading, color: Colors.neutral[50] },
  id: { ...Typography.small, fontFamily: 'monospace', color: Colors.neutral[500] },
  summary: { ...Typography.body, fontSize: 15, color: Colors.neutral[300] },
  staleNotice: {
    backgroundColor: Colors.warning[900],
    borderColor: Colors.warning[600],
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  staleText: { ...Typography.caption, fontSize: 14, color: Colors.warning[100] },
  axes: { gap: Spacing.sm },
  axesWide: { flexDirection: 'row' },
  axis: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  axisWide: { flex: 1 },
  explain: { ...Typography.caption, color: Colors.neutral[400] },
  columns: { gap: Spacing.md },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { gap: Spacing.md },
  colWide: { flex: 1 },
  section: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { ...Typography.subheading, fontSize: 17, color: Colors.neutral[100] },
  muted: { ...Typography.caption, color: Colors.neutral[400] },
  blocker: { ...Typography.caption, fontSize: 14, color: Colors.error[200] },
  factHead: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
  },
  fact: { ...Typography.caption, fontSize: 14, color: Colors.success[200] },
  unknown: { ...Typography.caption, fontSize: 14, color: Colors.warning[200] },
  repo: { minHeight: 44, justifyContent: 'center' },
  repoText: { ...Typography.bodyMedium, color: Colors.primary[200], textDecorationLine: 'underline' },
});
