import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, GitBranch, OctagonAlert } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import {
  DEPLOYMENT_LABEL,
  DEPLOYMENT_TONE,
  DEV_STATE_LABEL,
  DEV_STATE_TONE,
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  PRIORITY_LABEL,
  cardSignals,
} from '@/lib/project-steward/status';
import type { Project } from '@/lib/project-steward/types';
import type { ProjectInsights } from '@/lib/project-steward/insights';
import { TONE_COLORS } from './Badge';
import { Badge, DemoBadge } from './Badge';
import { FreshnessLine } from './Freshness';

interface Props {
  project: Project;
  insights?: ProjectInsights | null;
  isDemo: boolean;
  now: number;
  onPress: () => void;
}

export function ProjectCard({ project: p, insights, isDemo, now, onPress }: Props) {
  const blocked = p.blocked_by.length;
  const signals = cardSignals(insights, now);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        hovered && styles.hovered,
        pressed && styles.pressed,
      ]}
      accessibilityRole="link"
      accessibilityLabel={`${p.name}${isDemo ? ', demo data' : ''}. Development ${DEV_STATE_LABEL[p.state]}. Deployment ${DEPLOYMENT_LABEL[p.deployment]}.`}
      testID={`ps-card-${p.id}`}
    >
      <View style={styles.top}>
        <View style={styles.titleWrap}>
          <Text style={styles.priority}>{PRIORITY_LABEL[p.priority]}</Text>
          <Text style={styles.name}>{p.name}</Text>
        </View>
        {isDemo ? <DemoBadge /> : null}
        <ChevronRight color={Colors.neutral[500]} size={18} strokeWidth={2} />
      </View>

      <View style={styles.badges}>
        <Badge prefix="Dev" label={DEV_STATE_LABEL[p.state]} tone={DEV_STATE_TONE[p.state]} />
        <Badge
          prefix="Deploy"
          label={DEPLOYMENT_LABEL[p.deployment]}
          tone={DEPLOYMENT_TONE[p.deployment]}
        />
        <Badge
          prefix="Evidence"
          label={EVIDENCE_LABEL[p.evidence_level]}
          tone={EVIDENCE_TONE[p.evidence_level]}
        />
      </View>

      {p.summary ? (
        <Text style={styles.summary} numberOfLines={2}>
          {p.summary}
        </Text>
      ) : null}

      {blocked > 0 ? (
        <View style={styles.blocker}>
          <OctagonAlert color={Colors.error[300]} size={14} strokeWidth={2} />
          <Text style={styles.blockerText} numberOfLines={2}>
            {p.blocked_by[0]}
            {blocked > 1 ? ` (+${blocked - 1} more)` : ''}
          </Text>
        </View>
      ) : null}

      {signals.length > 0 ? (
        <View style={styles.signals} testID={`ps-signals-${p.id}`}>
          {signals.map((s) => (
            <View key={s.key} style={styles.signal}>
              <View style={[styles.dot, { backgroundColor: TONE_COLORS[s.tone].fg }]} />
              <Text style={[styles.signalText, { color: TONE_COLORS[s.tone].fg }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.meta}>
        <FreshnessLine observedAt={p.observed_at} now={now} />
        <View style={styles.metaItem}>
          <GitBranch color={Colors.neutral[500]} size={13} strokeWidth={2} />
          <Text style={styles.metaText}>
            {p.repositories.length === 0
              ? 'No repo linked'
              : `${p.repositories.length} repo${p.repositories.length > 1 ? 's' : ''}`}
            {' · '}
            {p.sources.length} source{p.sources.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.sm,
    flexGrow: 1,
  },
  hovered: { borderColor: Colors.primary[600] },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  priority: {
    ...Typography.small,
    fontFamily: Typography.fontFamilyBold,
    color: Colors.primary[300],
  },
  name: { ...Typography.subheading, fontSize: 18, color: Colors.neutral[50], flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  summary: { ...Typography.caption, fontSize: 14, lineHeight: 20, color: Colors.neutral[300] },
  blocker: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'flex-start',
    backgroundColor: Colors.error[900],
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  blockerText: { ...Typography.caption, color: Colors.error[100], flex: 1 },
  signals: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: 2 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3 },
  signalText: { ...Typography.caption, fontFamily: Typography.fontFamilyMedium },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { ...Typography.caption, color: Colors.neutral[400] },
});
