import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CircleCheck,
  CircleHelp,
  Flag,
  GitBranch,
  GitPullRequest,
  Hand,
  OctagonAlert,
} from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import {
  DEPLOYMENT_LABEL,
  DEPLOYMENT_TONE,
  DEV_STATE_LABEL,
  DEV_STATE_TONE,
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  PRIORITY_LABEL,
  PR_REVIEW_LABEL,
  PR_REVIEW_TONE,
  freshness,
  knownAndUnknown,
  refNumber,
  refUrl,
  relativeAge,
  shortDuration,
} from '@/lib/project-steward/status';
import type { Project } from '@/lib/project-steward/types';
import type { ProjectInsights } from '@/lib/project-steward/insights';
import { ActivityTab } from './ActivityTab';
import { Badge, DemoBadge } from './Badge';
import { CiPanel } from './CiPanel';
import { FreshnessLine } from './Freshness';
import { LinkChips } from './LinkChips';
import { Section } from './Section';
import { SourceList } from './SourceList';
import { useStaleAfterMs } from './StalePolicy';

interface Props {
  project: Project;
  insights: ProjectInsights | null;
  /** false when the data source cannot supply insights at all (live v1 snapshot). */
  insightsSupported: boolean;
  isDemo: boolean;
  now: number;
  wide: boolean;
}

type Tab = 'summary' | 'activity' | 'evidence';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'activity', label: 'Activity' },
  { key: 'evidence', label: 'Evidence' },
];
const PR_PREVIEW = 4;

const DEPLOY_EXPLAIN: Record<Project['deployment'], string> = {
  verified_current: 'A host check confirmed this is running now.',
  historically_verified: 'Verified in the past. Not a statement about today.',
  reported: 'Reported, but no host check has confirmed it.',
  not_deployed: 'Recorded as not deployed.',
  unknown: 'No deployment evidence. A PR is never treated as a deployment.',
};

export function ProjectDetailView({ project: p, insights, insightsSupported, isDemo, now, wide }: Props) {
  const [tab, setTab] = useState<Tab>('summary');
  const [allPrs, setAllPrs] = useState(false);
  const staleAfterMs = useStaleAfterMs();
  const f = freshness(p.observed_at, now, staleAfterMs);
  const facts = knownAndUnknown(p, now, staleAfterMs);
  const prs = insights?.open_prs?.items ?? null;
  const shownPrs = prs ? (allPrs ? prs : prs.slice(0, PR_PREVIEW)) : [];

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

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            testID={`ps-tab-${t.key}`}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'summary' ? (
        <View style={styles.stack} testID="ps-panel-summary">
          {insights && insights.next.length > 0 ? (
            <View style={styles.next} testID="ps-detail-next">
              {insights.next.map((n) => {
                const decision = n.kind === 'owner_decision';
                const url = refUrl(n.ref, 'unknown');
                const Icon = decision ? Hand : Flag;
                return (
                  <View key={n.text} style={[styles.nextItem, decision && styles.nextDecision]}>
                    <Icon
                      color={decision ? Colors.warning[300] : Colors.primary[300]}
                      size={18}
                      strokeWidth={2}
                    />
                    <View style={styles.flex}>
                      <Text style={[styles.nextKind, decision && { color: Colors.warning[300] }]}>
                        {decision ? 'Waiting on your decision' : 'Next milestone'}
                      </Text>
                      <Text style={styles.nextText}>{n.text}</Text>
                      {url ? (
                        <Text
                          style={styles.link}
                          accessibilityRole="link"
                          onPress={() => Linking.openURL(url)}
                        >
                          {n.ref}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.axes, wide && styles.axesWide]}>
            <View style={[styles.axis, wide && styles.flex]} testID="ps-detail-development">
              <Text style={styles.axisLabel}>Development</Text>
              <Badge label={DEV_STATE_LABEL[p.state]} tone={DEV_STATE_TONE[p.state]} />
              <Text style={styles.explain}>Where the work is, not whether it runs anywhere.</Text>
            </View>
            <View style={[styles.axis, wide && styles.flex]} testID="ps-detail-deployment">
              <Text style={styles.axisLabel}>Deployment</Text>
              <Badge label={DEPLOYMENT_LABEL[p.deployment]} tone={DEPLOYMENT_TONE[p.deployment]} />
              <Text style={styles.explain}>{DEPLOY_EXPLAIN[p.deployment]}</Text>
            </View>
            <View style={[styles.axis, wide && styles.flex]}>
              <Text style={styles.axisLabel}>Evidence</Text>
              <Badge label={EVIDENCE_LABEL[p.evidence_level]} tone={EVIDENCE_TONE[p.evidence_level]} />
              <Text style={styles.explain}>
                {p.sources.length} source{p.sources.length === 1 ? '' : 's'} cited. See Evidence.
              </Text>
            </View>
          </View>

          {p.blocked_by.length > 0 || p.state === 'blocked' ? (
            <Section title="Open blockers" icon={OctagonAlert} testID="ps-detail-blockers">
              {p.blocked_by.length === 0 ? (
                <Text style={styles.muted}>Marked blocked, but no blocker text was recorded.</Text>
              ) : (
                p.blocked_by.map((b) => (
                  <Text key={b} style={styles.blocker}>
                    • {b}
                  </Text>
                ))
              )}
            </Section>
          ) : null}

          {prs ? (
            <Section
              title={`Open pull requests (${prs.length})`}
              icon={GitPullRequest}
              testID="ps-detail-prs"
              aside={
                <FreshnessLine observedAt={insights?.open_prs?.observed_at ?? null} now={now} />
              }
            >
              {prs.length === 0 ? <Text style={styles.muted}>None open.</Text> : null}
              {shownPrs.map((pr) => {
                const url = refUrl(pr.ref, 'pr');
                return (
                  <Pressable
                    key={pr.ref}
                    onPress={url ? () => Linking.openURL(url) : undefined}
                    style={({ pressed }) => [styles.pr, pressed && { opacity: 0.7 }]}
                    accessibilityRole="link"
                    testID="ps-pr-row"
                  >
                    <Text style={styles.prTitle} numberOfLines={2}>
                      <Text style={styles.prNum}>{refNumber(pr.ref)} </Text>
                      {pr.title}
                    </Text>
                    <View style={styles.prMeta}>
                      <Badge label={PR_REVIEW_LABEL[pr.review]} tone={PR_REVIEW_TONE[pr.review]} />
                      <Text style={styles.muted}>
                        open {shortDuration(now - Date.parse(pr.opened_at))} · updated{' '}
                        {relativeAge(pr.updated_at, now)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {prs.length > PR_PREVIEW ? (
                <Pressable
                  onPress={() => setAllPrs((v) => !v)}
                  style={styles.more}
                  accessibilityRole="button"
                  testID="ps-prs-toggle"
                >
                  <Text style={styles.link}>
                    {allPrs ? 'Show fewer' : `Show all ${prs.length}`}
                  </Text>
                </Pressable>
              ) : null}
            </Section>
          ) : null}

          {insights && insights.links.length > 0 ? <LinkChips links={insights.links} /> : null}

          {!insights ? (
            <Text style={styles.notCollected} testID="ps-insights-missing">
              {insightsSupported
                ? 'Pull requests, CI, activity and links have not been collected for this project.'
                : 'Pull requests, CI, activity and links are not available from this source yet (it serves the v1.0 contract, which has no such fields).'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {tab === 'activity' ? (
        <ActivityTab insights={insights} insightsSupported={insightsSupported} now={now} wide={wide} />
      ) : null}

      {tab === 'evidence' ? (
        <View style={[styles.columns, wide && styles.columnsWide]} testID="ps-panel-evidence">
          <View style={[styles.stack, wide && styles.flex]}>
            <CiPanel ci={insights?.ci ?? null} now={now} />
            <Section title="Verification sources" icon={CircleCheck} testID="ps-detail-sources">
              <SourceList sources={p.sources} now={now} />
            </Section>
          </View>
          <View style={[styles.stack, wide && styles.flex]}>
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
                    style={styles.more}
                  >
                    <Text style={styles.link}>{r}</Text>
                  </Pressable>
                ))
              )}
              <Text style={styles.id}>project id: {p.id}</Text>
            </Section>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  stack: { gap: Spacing.md },
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[800],
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: Colors.primary[400] },
  tabText: { ...Typography.bodyMedium, color: Colors.neutral[400] },
  tabTextActive: { color: Colors.neutral[50] },
  next: { gap: Spacing.sm },
  nextItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
  },
  nextDecision: { borderColor: Colors.warning[600], backgroundColor: Colors.warning[900] },
  nextKind: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.primary[300],
    textTransform: 'uppercase',
  },
  nextText: { ...Typography.bodyMedium, color: Colors.neutral[50] },
  axes: { gap: Spacing.sm },
  axesWide: { flexDirection: 'row' },
  axis: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  axisLabel: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
  },
  explain: { ...Typography.caption, color: Colors.neutral[400] },
  columns: { gap: Spacing.md },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  muted: { ...Typography.caption, color: Colors.neutral[400], flexShrink: 1 },
  blocker: { ...Typography.caption, fontSize: 14, color: Colors.error[200] },
  pr: {
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[800],
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
    minHeight: 44,
  },
  prTitle: { ...Typography.caption, fontSize: 14, lineHeight: 20, color: Colors.neutral[100] },
  prNum: { fontFamily: Typography.fontFamilySemiBold, color: Colors.primary[300] },
  prMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  more: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { ...Typography.caption, fontSize: 14, color: Colors.primary[200], textDecorationLine: 'underline' },
  notCollected: { ...Typography.caption, color: Colors.neutral[400] },
  factHead: {
    ...Typography.small,
    fontFamily: Typography.fontFamilySemiBold,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
  },
  fact: { ...Typography.caption, fontSize: 14, color: Colors.success[200] },
  unknown: { ...Typography.caption, fontSize: 14, color: Colors.warning[200] },
});
