import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FolderKanban, RefreshCw } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import type { SourceMode } from '@/lib/project-steward/useProjectSnapshot';

interface Props {
  mode: SourceMode;
  liveConfigured: boolean;
  onModeChange: (m: SourceMode) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function StewardHeader({ mode, liveConfigured, onModeChange, onRefresh, loading }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <FolderKanban color={Colors.primary[400]} size={26} strokeWidth={2} />
        <View style={styles.titleText}>
          <Text style={styles.title} accessibilityRole="header">
            Projects
          </Text>
          <Text style={styles.subtitle}>Read-only project steward · preview route</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <View style={styles.segment} accessibilityRole="tablist">
          {(['demo', 'live'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => onModeChange(m)}
              style={[styles.segBtn, mode === m && styles.segActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              testID={`ps-mode-${m}`}
            >
              <Text style={[styles.segText, mode === m && styles.segTextActive]}>
                {m === 'demo' ? 'Demo fixture' : liveConfigured ? 'Live API' : 'Live API (not set)'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={loading}
          style={({ pressed }) => [styles.refresh, (pressed || loading) && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Check source again"
          testID="ps-refresh"
        >
          <RefreshCw color={Colors.neutral[200]} size={18} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 },
  titleText: { flexShrink: 1 },
  title: { ...Typography.heading, color: Colors.neutral[50] },
  subtitle: { ...Typography.caption, color: Colors.neutral[400] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: 2,
  },
  segBtn: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    justifyContent: 'center',
  },
  segActive: { backgroundColor: Colors.neutral[700] },
  segText: { ...Typography.caption, fontFamily: Typography.fontFamilyMedium, color: Colors.neutral[400] },
  segTextActive: { color: Colors.neutral[50] },
  refresh: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[900],
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
