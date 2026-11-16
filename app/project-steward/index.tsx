import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/lib/theme';
import {
  EMPTY_QUERY,
  attentionQueue,
  filterProjects,
  type ProjectQuery,
  type QuickFilter,
} from '@/lib/project-steward/status';
import {
  LIVE_SNAPSHOT_URL,
  defaultSourceMode,
  parseSourceMode,
  useNow,
  useProjectSnapshot,
  type SourceMode,
} from '@/lib/project-steward/useProjectSnapshot';
import { AttentionQueue } from '@/components/project-steward/AttentionQueue';
import { DataOriginBanner } from '@/components/project-steward/DataOriginBanner';
import { FilterBar } from '@/components/project-steward/FilterBar';
import { ProjectCard } from '@/components/project-steward/ProjectCard';
import { LoadingNotice, SourceStateNotice } from '@/components/project-steward/SourceStateNotice';
import { StewardHeader } from '@/components/project-steward/StewardHeader';

const WIDE = 900;
const QUICKS: QuickFilter[] = ['all', 'attention', 'blocked', 'stale', 'deployed_evidence'];

export default function ProjectsOverviewScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const router = useRouter();
  const mode = defaultSourceMode(parseSourceMode(params.source));
  const { result, loading, refresh } = useProjectSnapshot(mode);
  const now = useNow();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [query, setQuery] = useState<ProjectQuery>(EMPTY_QUERY);

  const setMode = (m: SourceMode) => router.setParams({ source: m });
  const ok = result?.status === 'ok' ? result : null;
  const projects = ok?.snapshot.projects ?? [];

  const filtered = useMemo(() => filterProjects(projects, query, now), [projects, query, now]);
  const attention = useMemo(() => attentionQueue(projects, now), [projects, now]);
  const counts = useMemo(() => {
    const c: Partial<Record<QuickFilter, number>> = {};
    for (const q of QUICKS) c[q] = filterProjects(projects, { ...EMPTY_QUERY, quick: q }, now).length;
    return c;
  }, [projects, now]);

  const open = (id: string) =>
    router.push({ pathname: '/project-steward/[id]', params: { id, source: mode } });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} testID="ps-overview">
        <View style={styles.inner}>
          <StewardHeader
            mode={mode}
            liveConfigured={!!LIVE_SNAPSHOT_URL}
            onModeChange={setMode}
            onRefresh={refresh}
            loading={loading}
          />

          {loading || !result ? <LoadingNotice /> : null}
          {result && result.status !== 'ok' ? (
            <SourceStateNotice result={result} onRetry={refresh} onOpenDemo={() => setMode('demo')} />
          ) : null}

          {ok ? (
            <>
              <DataOriginBanner
                origin={ok.origin}
                snapshot={ok.snapshot}
                receivedAt={ok.receivedAt}
                now={now}
              />
              <View style={[styles.layout, wide && styles.layoutWide]}>
                <View style={[styles.main, wide && styles.mainWide]}>
                  <FilterBar query={query} onChange={setQuery} counts={counts} />
                  <Text style={styles.resultCount} testID="ps-result-count">
                    {filtered.length} of {projects.length} projects
                  </Text>
                  {filtered.length === 0 ? (
                    <Text style={styles.empty} testID="ps-empty">
                      {projects.length === 0
                        ? 'The snapshot contains no projects.'
                        : 'No projects match this search.'}
                    </Text>
                  ) : (
                    <View style={[styles.grid, wide && styles.gridWide]}>
                      {filtered.map((p) => (
                        <View key={p.id} style={[styles.cell, wide && styles.cellWide]}>
                          <ProjectCard
                            project={p}
                            isDemo={ok.origin === 'demo-fixture'}
                            now={now}
                            onPress={() => open(p.id)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={[styles.side, wide && styles.sideWide]}>
                  <AttentionQueue items={attention} onOpen={open} />
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[950] },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  inner: { width: '100%', maxWidth: 1280, alignSelf: 'center', gap: Spacing.md },
  layout: { gap: Spacing.md },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { gap: Spacing.md },
  mainWide: { flex: 1 },
  side: {},
  sideWide: { width: 340 },
  resultCount: { ...Typography.caption, color: Colors.neutral[400] },
  empty: { ...Typography.body, color: Colors.neutral[400], paddingVertical: Spacing.lg },
  grid: { gap: Spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {},
  cellWide: { width: '48.5%', flexGrow: 1 },
});
