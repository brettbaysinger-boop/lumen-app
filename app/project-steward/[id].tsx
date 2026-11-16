import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import {
  defaultSourceMode,
  parseSourceMode,
  useNow,
  useProjectSnapshot,
} from '@/lib/project-steward/useProjectSnapshot';
import { DataOriginBanner } from '@/components/project-steward/DataOriginBanner';
import { ProjectDetailView } from '@/components/project-steward/ProjectDetailView';
import { StalePolicyProvider } from '@/components/project-steward/StalePolicy';
import { STALE_AFTER_MS } from '@/lib/project-steward/status';
import { LoadingNotice, SourceStateNotice } from '@/components/project-steward/SourceStateNotice';

export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id: string; source?: string }>();
  const router = useRouter();
  const mode = defaultSourceMode(parseSourceMode(params.source));
  const { result, loading, refresh } = useProjectSnapshot(mode);
  const now = useNow();
  const { width } = useWindowDimensions();

  const ok = result?.status === 'ok' ? result : null;
  const project = ok?.snapshot.projects.find((p) => p.id === params.id) ?? null;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/project-steward', params: { source: mode } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} testID="ps-detail">
        <View style={styles.inner}>
          <Pressable
            onPress={back}
            style={styles.back}
            accessibilityRole="link"
            accessibilityLabel="Back to all projects"
            testID="ps-back"
          >
            <ArrowLeft color={Colors.primary[300]} size={18} strokeWidth={2} />
            <Text style={styles.backText}>All projects</Text>
          </Pressable>

          {loading || !result ? <LoadingNotice /> : null}
          {result && result.status !== 'ok' ? (
            <SourceStateNotice
              result={result}
              onRetry={refresh}
              onOpenDemo={() => router.setParams({ source: 'demo' })}
            />
          ) : null}

          {ok ? (
            <StalePolicyProvider value={ok.staleAfterMs ?? STALE_AFTER_MS}>
              <DataOriginBanner
                origin={ok.origin}
                snapshot={ok.snapshot}
                receivedAt={ok.receivedAt}
                now={now}
              />
              {project ? (
                <ProjectDetailView
                  project={project}
                  insights={ok.insights?.[project.id] ?? null}
                  insightsSupported={ok.insights !== null}
                  isDemo={ok.origin === 'demo-fixture'}
                  now={now}
                  wide={width >= 900}
                />
              ) : (
                <View style={styles.missing} testID="ps-detail-not-found">
                  <Text style={styles.missingTitle}>Project not in this snapshot</Text>
                  <Text style={styles.missingBody}>
                    No project with id "{String(params.id)}" exists in the{' '}
                    {ok.origin === 'demo-fixture' ? 'demo fixture' : 'live snapshot'}.
                  </Text>
                </View>
              )}
            </StalePolicyProvider>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[950] },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  inner: { width: '100%', maxWidth: 1100, alignSelf: 'center', gap: Spacing.md },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  backText: { ...Typography.bodyMedium, color: Colors.primary[300] },
  missing: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  missingTitle: { ...Typography.subheading, fontSize: 18, color: Colors.neutral[100] },
  missingBody: { ...Typography.body, fontSize: 15, color: Colors.neutral[400] },
});
