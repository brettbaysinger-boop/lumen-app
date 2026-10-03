import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Settings as SettingsIcon,
  Server,
  Cpu,
  Mic,
  Camera,
  Database,
  Activity,
  Gauge,
  ChevronRight,
  Volume2,
  Eye,
  Zap,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Radius, Typography } from '@/lib/theme';
import type { Companion, ModelRun } from '@/types/database';

interface ModelRouting {
  conversation: { provider: string; model: string; gpu: string };
  reasoning: { provider: string; model: string; gpu: string };
  memory_extraction: { provider: string; model: string; gpu: string };
  reflection: { provider: string; model: string; gpu: string };
  vision: { provider: string; model: string; gpu: string };
  embeddings: { provider: string; model: string; gpu: string };
  stt: { provider: string; endpoint: string };
  tts: { provider: string; endpoint: string };
  image_generation: { provider: string; endpoint: string };
}

const DEFAULT_ROUTING: ModelRouting = {
  conversation: { provider: 'ollama', model: 'companion-main', gpu: 'RTX 5060 Ti 16GB' },
  reasoning: { provider: 'ollama', model: 'companion-reasoning', gpu: 'RTX 5060 Ti 16GB' },
  memory_extraction: { provider: 'ollama', model: 'companion-small', gpu: 'RTX 5060 Ti 16GB' },
  reflection: { provider: 'ollama', model: 'companion-reasoning', gpu: 'RTX 5060 Ti 16GB' },
  vision: { provider: 'ollama', model: 'companion-vlm', gpu: 'RTX 5060 Ti 16GB' },
  embeddings: { provider: 'ollama', model: 'embedding-model', gpu: 'RTX 5060 Ti 16GB' },
  stt: { provider: 'helios', endpoint: 'helios.local:8000' },
  tts: { provider: 'helios', endpoint: 'helios.local:8001' },
  image_generation: { provider: 'comfyui', endpoint: 'desktop.local:8188' },
};

const INFRA_NODES = [
  { name: 'Main Desktop', role: 'API + ComfyUI + General AI', gpu: 'RTX 3080 10GB', status: 'online' },
  { name: 'Cognition Node', role: 'Companion LLM + Reasoning', gpu: 'RTX 5060 Ti 16GB', status: 'pending' },
  { name: 'Helios', role: 'STT / TTS / Audio', gpu: 'GTX 1660 Ti', status: 'online' },
  { name: 'Raspberry Pi 5', role: 'Network + Watchdog', gpu: 'None', status: 'online' },
];

export default function SettingsScreen() {
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [modelRuns, setModelRuns] = useState<ModelRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routing] = useState<ModelRouting>(DEFAULT_ROUTING);

  const loadData = useCallback(async () => {
    const { data: comp } = await supabase
      .from('companions')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (comp) setCompanion(comp as Companion);

    if (comp) {
      const { data: runs } = await supabase
        .from('model_runs')
        .select('*')
        .eq('companion_id', comp.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (runs) setModelRuns(runs as ModelRun[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary[400]} />
      </SafeAreaView>
    );
  }

  const totalRuns = modelRuns.length;
  const successfulRuns = modelRuns.filter((r) => r.success).length;
  const avgLatency = totalRuns > 0
    ? Math.round(modelRuns.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / totalRuns)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary[400]} />}
      >
        <View style={styles.header}>
          <SettingsIcon color={Colors.primary[400]} size={24} strokeWidth={2} />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Companion Configuration</Text>
          <View style={styles.configRow}>
            <View style={styles.configLeft}>
              <Volume2 color={Colors.neutral[400]} size={20} strokeWidth={2} />
              <View>
                <Text style={styles.configLabel}>Voice</Text>
                <Text style={styles.configSubtext}>STT / TTS via Helios</Text>
              </View>
            </View>
            <ToggleSwitch
              value={companion?.voice_enabled || false}
              onToggle={async () => {
                if (!companion) return;
                const newVal = !companion.voice_enabled;
                setCompanion({ ...companion, voice_enabled: newVal });
                await supabase
                  .from('companions')
                  .update({ voice_enabled: newVal })
                  .eq('id', companion.id);
              }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.configRow}>
            <View style={styles.configLeft}>
              <Eye color={Colors.neutral[400]} size={20} strokeWidth={2} />
              <View>
                <Text style={styles.configLabel}>Vision</Text>
                <Text style={styles.configSubtext}>Camera and image understanding</Text>
              </View>
            </View>
            <ToggleSwitch
              value={companion?.vision_enabled || false}
              onToggle={async () => {
                if (!companion) return;
                const newVal = !companion.vision_enabled;
                setCompanion({ ...companion, vision_enabled: newVal });
                await supabase
                  .from('companions')
                  .update({ vision_enabled: newVal })
                  .eq('id', companion.id);
              }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Server color={Colors.accent[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Infrastructure Nodes</Text>
          </View>
          {INFRA_NODES.map((node, i) => (
            <View key={i} style={styles.nodeRow}>
              <View style={styles.nodeInfo}>
                <View style={styles.nodeHeader}>
                  <Text style={styles.nodeName}>{node.name}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      node.status === 'online'
                        ? { backgroundColor: Colors.success[900] }
                        : { backgroundColor: Colors.warning[900] },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        node.status === 'online'
                          ? { backgroundColor: Colors.success[400] }
                          : { backgroundColor: Colors.warning[400] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        node.status === 'online'
                          ? { color: Colors.success[300] }
                          : { color: Colors.warning[300] },
                      ]}
                    >
                      {node.status === 'online' ? 'Online' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.nodeRole}>{node.role}</Text>
                <Text style={styles.nodeGpu}>{node.gpu}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Cpu color={Colors.primary[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Model Routing</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Task-based routing across your LAN GPUs
          </Text>
          {Object.entries(routing).map(([task, config]) => (
            <View key={task} style={styles.routingRow}>
              <View style={styles.routingLeft}>
                <View style={styles.routingIcon}>
                  {task === 'stt' || task === 'tts' ? (
                    <Mic color={Colors.secondary[400]} size={16} strokeWidth={2} />
                  ) : task === 'vision' ? (
                    <Camera color={Colors.accent[400]} size={16} strokeWidth={2} />
                  ) : task === 'image_generation' ? (
                    <Camera color={Colors.warning[400]} size={16} strokeWidth={2} />
                  ) : task === 'embeddings' ? (
                    <Database color={Colors.success[400]} size={16} strokeWidth={2} />
                  ) : (
                    <Zap color={Colors.primary[400]} size={16} strokeWidth={2} />
                  )}
                </View>
                <View>
                  <Text style={styles.routingTask}>
                    {task.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                  <Text style={styles.routingDetail}>
                    {'model' in config ? config.model : config.endpoint}
                  </Text>
                  <Text style={styles.routingProvider}>
                    {config.provider}
                    {'gpu' in config ? ` · ${config.gpu}` : ''}
                  </Text>
                </View>
              </View>
              <ChevronRight color={Colors.neutral[600]} size={18} strokeWidth={2} />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Activity color={Colors.success[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Model Performance</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalRuns}</Text>
              <Text style={styles.statLabel}>Total Runs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{successfulRuns}</Text>
              <Text style={styles.statLabel}>Successful</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{avgLatency}ms</Text>
              <Text style={styles.statLabel}>Avg Latency</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0}%
              </Text>
              <Text style={styles.statLabel}>Success Rate</Text>
            </View>
          </View>

          {modelRuns.length > 0 && (
            <View style={styles.recentRuns}>
              <Text style={styles.recentRunsTitle}>Recent Activity</Text>
              {modelRuns.slice(0, 5).map((run) => (
                <View key={run.id} style={styles.runRow}>
                  <Gauge color={Colors.neutral[500]} size={14} strokeWidth={2} />
                  <Text style={styles.runTask}>{run.task}</Text>
                  <Text style={styles.runModel}>{run.selected_model}</Text>
                  <View
                    style={[
                      styles.runStatus,
                      run.success
                        ? { backgroundColor: Colors.success[900] }
                        : { backgroundColor: Colors.error[900] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.runStatusText,
                        run.success
                          ? { color: Colors.success[300] }
                          : { color: Colors.error[300] },
                      ]}
                    >
                      {run.success ? 'OK' : 'ERR'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleSwitch({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.toggle, value && styles.toggleActive]}
      onPress={onToggle}
    >
      <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[950],
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.neutral[950],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    ...Typography.heading,
    color: Colors.neutral[100],
  },
  section: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.subheading,
    color: Colors.neutral[100],
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.neutral[500],
    marginTop: -Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  configLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  configLabel: {
    ...Typography.bodyMedium,
    color: Colors.neutral[200],
  },
  configSubtext: {
    ...Typography.caption,
    color: Colors.neutral[500],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.neutral[800],
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.neutral[700],
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.primary[600],
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.neutral[400],
  },
  toggleKnobActive: {
    backgroundColor: Colors.neutral[0],
    transform: [{ translateX: 18 }],
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  nodeInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nodeName: {
    ...Typography.bodyMedium,
    color: Colors.neutral[100],
    fontFamily: 'Inter-SemiBold',
  },
  nodeRole: {
    ...Typography.caption,
    color: Colors.neutral[400],
  },
  nodeGpu: {
    ...Typography.small,
    color: Colors.neutral[600],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...Typography.small,
    fontFamily: 'Inter-Medium',
  },
  routingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  routingLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
  },
  routingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.neutral[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  routingTask: {
    ...Typography.bodyMedium,
    color: Colors.neutral[200],
    fontFamily: 'Inter-SemiBold',
  },
  routingDetail: {
    ...Typography.caption,
    color: Colors.neutral[400],
  },
  routingProvider: {
    ...Typography.small,
    color: Colors.neutral[600],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.heading,
    color: Colors.neutral[100],
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.neutral[500],
  },
  recentRuns: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  recentRunsTitle: {
    ...Typography.bodyMedium,
    color: Colors.neutral[300],
    fontFamily: 'Inter-SemiBold',
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
  },
  runTask: {
    ...Typography.caption,
    color: Colors.neutral[300],
    flex: 1,
  },
  runModel: {
    ...Typography.small,
    color: Colors.neutral[500],
  },
  runStatus: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  runStatusText: {
    ...Typography.small,
    fontFamily: 'Inter-SemiBold',
  },
  footer: {
    height: Spacing.xl,
  },
});
