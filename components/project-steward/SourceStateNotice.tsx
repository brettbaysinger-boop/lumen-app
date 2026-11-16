import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff, FileQuestion, Lock, ServerCrash, Timer, FileWarning } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import type { SnapshotResult } from '@/lib/project-steward/client';

type Failure = Exclude<SnapshotResult, { status: 'ok' }>;

function describe(r: Failure): { icon: LucideIcon; title: string; body: string } {
  switch (r.status) {
    case 'unauthorized':
      return {
        icon: Lock,
        title: r.httpStatus === 401 ? 'Sign-in required (401)' : 'Access denied (403)',
        body: 'The Projects API refused this request. Project status is not shown rather than guessed.',
      };
    case 'offline':
      return {
        icon: CloudOff,
        title: 'Projects API unreachable',
        body: `The device appears offline or the server did not answer (${r.detail}). No cached or demo data is substituted.`,
      };
    case 'timeout':
      return {
        icon: Timer,
        title: 'Request timed out',
        body: `No answer within ${Math.round(r.timeoutMs / 1000)}s. Status is unknown until a check succeeds.`,
      };
    case 'missing':
      return {
        icon: FileQuestion,
        title:
          r.reason === 'not_configured'
            ? 'Live source not configured'
            : r.reason === 'not_found'
              ? 'Snapshot not found (404)'
              : 'Snapshot was empty',
        body:
          r.reason === 'not_configured'
            ? 'No Projects API URL is set for this build (EXPO_PUBLIC_PROJECT_STEWARD_SNAPSHOT_URL). The backend lane has not shipped yet.'
            : 'The source exists but returned no snapshot. Nothing is displayed in its place.',
      };
    case 'invalid':
      return {
        icon: FileWarning,
        title: 'Snapshot failed contract validation',
        body: 'The response does not match project-snapshot v1, so none of it is shown.',
      };
    case 'http_error':
      return {
        icon: ServerCrash,
        title: `Server error (${r.httpStatus})`,
        body: 'The Projects API returned an error. Status is unknown.',
      };
  }
}

interface Props {
  result: Failure;
  onRetry: () => void;
  onOpenDemo: () => void;
}

export function SourceStateNotice({ result, onRetry, onOpenDemo }: Props) {
  const d = describe(result);
  const Icon = d.icon;
  return (
    <View style={styles.box} testID={`ps-state-${result.status}`} accessibilityRole="alert">
      <View style={styles.row}>
        <Icon color={Colors.error[300]} size={20} strokeWidth={2} />
        <Text style={styles.title}>{d.title}</Text>
      </View>
      <Text style={styles.body}>{d.body}</Text>
      {result.status === 'invalid' ? (
        <View style={styles.errors} testID="ps-invalid-errors">
          {result.errors.slice(0, 8).map((e) => (
            <Text key={e} style={styles.errorLine}>
              • {e}
            </Text>
          ))}
          {result.errors.length > 8 ? (
            <Text style={styles.errorLine}>…and {result.errors.length - 8} more</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
          accessibilityRole="button"
          testID="ps-retry"
        >
          <Text style={styles.btnPrimaryText}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={onOpenDemo}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
          accessibilityRole="button"
          testID="ps-open-demo"
        >
          <Text style={styles.btnGhostText}>View labelled demo instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LoadingNotice() {
  return (
    <View style={[styles.box, styles.loading]} testID="ps-state-loading">
      <ActivityIndicator color={Colors.primary[400]} />
      <Text style={styles.body}>Checking the Projects source…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.neutral[900],
    borderColor: Colors.error[800],
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  loading: { borderColor: Colors.neutral[800], flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { ...Typography.subheading, fontSize: 18, color: Colors.neutral[100], flexShrink: 1 },
  body: { ...Typography.body, fontSize: 15, color: Colors.neutral[300] },
  errors: {
    backgroundColor: Colors.neutral[950],
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 2,
  },
  errorLine: { ...Typography.caption, color: Colors.error[200], fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  btn: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: Colors.primary[500] },
  btnPrimaryText: { ...Typography.bodyMedium, color: Colors.neutral[0] },
  btnGhost: { borderWidth: 1, borderColor: Colors.secondary[600] },
  btnGhostText: { ...Typography.bodyMedium, color: Colors.secondary[200] },
  pressed: { opacity: 0.7 },
});
