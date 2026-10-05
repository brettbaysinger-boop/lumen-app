import { ModelPicker } from '@/components/ModelPicker';
import { useState, useCallback, useEffect, useMemo } from 'react';
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
  Palette,
  Moon,
  Sun,
} from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { SCHEMES, Spacing, Radius, Typography, type ThemeColors, type SchemeId } from '@/lib/theme';
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
  { name: 'Main Desktop', role: 'API + ComfyUI + General AI', gpu: 'PNY RTX 5070 OC 12GB GDDR7', status: 'online' },
  { name: 'Cognition Node', role: 'Companion LLM + Reasoning', gpu: 'RTX 5060 Ti 16GB', status: 'pending' },
  { name: 'Helios', role: 'STT / TTS / Audio', gpu: 'GTX 1660 Ti', status: 'online' },
  { name: 'Raspberry Pi 5', role: 'Network + Watchdog', gpu: 'None', status: 'online' },
];

export default function SettingsScreen() {
  const { colors: c, schemeId, setSchemeId, mode } = useTheme();
  const { session } = useAuth();
  const [accountError, setAccountError] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [modelRuns, setModelRuns] = useState<ModelRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routing] = useState<ModelRouting>(DEFAULT_ROUTING);
  const styles = useMemo(() => createStyles(c), [c]);

  const loadData = useCallback(async () => {
    const { data: comp } = await supabase
      .from('companions')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
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

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={c.primary[400]} />
      </SafeAreaView>
    );
  }

  const totalRuns = modelRuns.length;
  const successfulRuns = modelRuns.filter((r) => r.success).length;
  const avgLatency = totalRuns > 0
    ? Math.round(modelRuns.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / totalRuns)
    : 0;

  const uniqueColorNames = SCHEMES.filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i);
  const currentColorName = SCHEMES.find((s) => s.id === schemeId)?.name || 'Ocean';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[400]} />}
      >
        <View style={styles.header}>
          <SettingsIcon color={c.primary[400]} size={24} strokeWidth={2} />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Palette color={c.primary[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Choose your color scheme</Text>

          <View style={styles.colorRow}>
            {uniqueColorNames.map((scheme) => {
              const isActive = currentColorName === scheme.name;
              return (
                <TouchableOpacity
                  key={scheme.name}
                  style={[
                    styles.colorSwatch,
                    { borderColor: scheme.primary[500] },
                    isActive && { borderWidth: 3, borderColor: scheme.primary[400] },
                  ]}
                  onPress={() => setSchemeId(`${scheme.name.toLowerCase()}-${mode}` as SchemeId)}
                >
                  <View style={[styles.colorDot, { backgroundColor: scheme.primary[400] }]} />
                  <Text style={[styles.colorLabel, { color: isActive ? c.neutral[100] : c.neutral[400] }]}>
                    {scheme.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'dark' && { backgroundColor: c.primary[600] }]}
              onPress={() => setSchemeId(`${currentColorName.toLowerCase()}-dark` as SchemeId)}
            >
              <Moon color={mode === 'dark' ? c.neutral[0] : c.neutral[400]} size={18} strokeWidth={2} />
              <Text style={[styles.modeText, { color: mode === 'dark' ? c.neutral[0] : c.neutral[400] }]}>Dark</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'light' && { backgroundColor: c.primary[600] }]}
              onPress={() => setSchemeId(`${currentColorName.toLowerCase()}-light` as SchemeId)}
            >
              <Sun color={mode === 'light' ? c.neutral[0] : c.neutral[400]} size={18} strokeWidth={2} />
              <Text style={[styles.modeText, { color: mode === 'light' ? c.neutral[0] : c.neutral[400] }]}>Light</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.configLabel}>{session?.user.user_metadata?.display_name || 'User'}</Text>
          <Text style={styles.configSubtext}>{session?.user.email}</Text>
          <TouchableOpacity onPress={async () => {
            const { error } = await supabase.auth.signOut();
            setAccountError(error?.message || null);
          }}><Text style={{ color: c.primary[300], paddingVertical: 16, fontFamily: 'Inter-Regular' }}>Sign out</Text></TouchableOpacity>
          {!!accountError && <Text style={styles.configSubtext}>{accountError}</Text>}
          <Text style={styles.sectionTitle}>Companion Configuration</Text>
          {companion && <ModelPicker companionId={companion.id} />}
          <View style={styles.configRow}>
            <View style={styles.configLeft}><View>
              <Text style={styles.configLabel}>Automatic remembering</Text>
              <Text style={styles.configSubtext}>Save clear facts; review sensitive or uncertain details.</Text>
            </View></View>
            <ToggleSwitch colors={c} value={companion?.auto_memory_enabled ?? true} onToggle={async () => {
              if (!companion) return;
              const next = !(companion.auto_memory_enabled ?? true);
              const { data, error } = await supabase.from('companions').update({ auto_memory_enabled: next })
                .eq('id', companion.id).select('*').single();
              if (error) setAccountError('Could not change automatic remembering.');
              else { setCompanion(data as Companion); setAccountError(null); }
            }} />
          </View>
          <View style={styles.configRow}>
            <View style={styles.configLeft}>
              <Volume2 color={c.neutral[400]} size={20} strokeWidth={2} />
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
                await supabase.from('companions').update({ voice_enabled: newVal }).eq('id', companion.id);
              }}
              colors={c}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.configRow}>
            <View style={styles.configLeft}>
              <Eye color={c.neutral[400]} size={20} strokeWidth={2} />
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
                await supabase.from('companions').update({ vision_enabled: newVal }).eq('id', companion.id);
              }}
              colors={c}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Server color={c.accent[400]} size={18} strokeWidth={2} />
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
                        ? { backgroundColor: c.success[900] }
                        : { backgroundColor: c.warning[900] },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        node.status === 'online'
                          ? { backgroundColor: c.success[400] }
                          : { backgroundColor: c.warning[400] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        node.status === 'online'
                          ? { color: c.success[300] }
                          : { color: c.warning[300] },
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
            <Cpu color={c.primary[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Planned Model Routing</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Planning notes. Choose the actual conversation model above.</Text>
          {Object.entries(routing).map(([task, config]) => (
            <View key={task} style={styles.routingRow}>
              <View style={styles.routingLeft}>
                <View style={styles.routingIcon}>
                  {task === 'stt' || task === 'tts' ? (
                    <Mic color={c.secondary[400]} size={16} strokeWidth={2} />
                  ) : task === 'vision' ? (
                    <Camera color={c.accent[400]} size={16} strokeWidth={2} />
                  ) : task === 'image_generation' ? (
                    <Camera color={c.warning[400]} size={16} strokeWidth={2} />
                  ) : task === 'embeddings' ? (
                    <Database color={c.success[400]} size={16} strokeWidth={2} />
                  ) : (
                    <Zap color={c.primary[400]} size={16} strokeWidth={2} />
                  )}
                </View>
                <View>
                  <Text style={styles.routingTask}>
                    {task.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}
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
              <ChevronRight color={c.neutral[600]} size={18} strokeWidth={2} />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Activity color={c.success[400]} size={18} strokeWidth={2} />
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
                  <Gauge color={c.neutral[500]} size={14} strokeWidth={2} />
                  <Text style={styles.runTask}>{run.task}</Text>
                  <Text style={styles.runModel}>{run.selected_model}</Text>
                  <View
                    style={[
                      styles.runStatus,
                      run.success
                        ? { backgroundColor: c.success[900] }
                        : { backgroundColor: c.error[900] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.runStatusText,
                        run.success ? { color: c.success[300] } : { color: c.error[300] },
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

function ToggleSwitch({ value, onToggle, colors: c }: { value: boolean; onToggle: () => void; colors: ThemeColors }) {
  return (
    <TouchableOpacity
      style={[{ width: 44, height: 26, borderRadius: 13, backgroundColor: c.neutral[700], padding: 3, justifyContent: 'center' }, value && { backgroundColor: c.primary[600] }]}
      onPress={onToggle}
    >
      <View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.neutral[400] }, value && { backgroundColor: c.neutral[0], transform: [{ translateX: 18 }] }]} />
    </TouchableOpacity>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.neutral[950] },
    loadingContainer: { flex: 1, backgroundColor: c.neutral[950], alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    headerTitle: { ...Typography.heading, color: c.neutral[100] },
    section: { backgroundColor: c.neutral[900], borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.sm, gap: Spacing.sm },
    sectionTitle: { ...Typography.subheading, color: c.neutral[100] },
    sectionSubtitle: { ...Typography.caption, color: c.neutral[500], marginTop: -Spacing.xs },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    colorRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
    colorSwatch: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: c.neutral[800], borderWidth: 2 },
    colorDot: { width: 20, height: 20, borderRadius: 10 },
    colorLabel: { ...Typography.bodyMedium, fontFamily: 'Inter-SemiBold' },
    modeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    modeButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, backgroundColor: c.neutral[800] },
    modeText: { ...Typography.bodyMedium, fontFamily: 'Inter-Medium' },
    configRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
    configLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
    configLabel: { ...Typography.bodyMedium, color: c.neutral[200] },
    configSubtext: { ...Typography.caption, color: c.neutral[500] },
    divider: { height: 1, backgroundColor: c.neutral[800] },
    nodeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
    nodeInfo: { flex: 1, gap: Spacing.xs },
    nodeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nodeName: { ...Typography.bodyMedium, color: c.neutral[100], fontFamily: 'Inter-SemiBold' },
    nodeRole: { ...Typography.caption, color: c.neutral[400] },
    nodeGpu: { ...Typography.small, color: c.neutral[600] },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.pill },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { ...Typography.small, fontFamily: 'Inter-Medium' },
    routingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, gap: Spacing.sm },
    routingLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, flex: 1 },
    routingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.neutral[800], alignItems: 'center', justifyContent: 'center' },
    routingTask: { ...Typography.bodyMedium, color: c.neutral[200], fontFamily: 'Inter-SemiBold' },
    routingDetail: { ...Typography.caption, color: c.neutral[400] },
    routingProvider: { ...Typography.small, color: c.neutral[600] },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    statCard: { width: '48%', backgroundColor: c.neutral[800], borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
    statValue: { ...Typography.heading, color: c.neutral[100] },
    statLabel: { ...Typography.caption, color: c.neutral[500] },
    recentRuns: { marginTop: Spacing.sm, gap: Spacing.xs },
    recentRunsTitle: { ...Typography.bodyMedium, color: c.neutral[300], fontFamily: 'Inter-SemiBold' },
    runRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
    runTask: { ...Typography.caption, color: c.neutral[300], flex: 1 },
    runModel: { ...Typography.small, color: c.neutral[500] },
    runStatus: { paddingHorizontal: Spacing.xs + 2, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
    runStatusText: { ...Typography.small, fontFamily: 'Inter-SemiBold' },
    footer: { height: Spacing.xl },
  });
}
