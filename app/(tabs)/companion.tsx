import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Sparkles,
  Target,
  Heart,
  BookOpen,
  AlertCircle,
  Zap,
  Eye,
  Pencil,
  X,
  TrendingUp,
} from 'lucide-react-native';
import { useCompanion } from '@/hooks/useCompanion';
import { useTheme } from '@/lib/theme-context';
import { Spacing, Radius, Typography, type ThemeColors } from '@/lib/theme';
import type { CompanionState } from '@/types/database';

const STATE_VARIABLES: Array<{
  key: keyof CompanionState;
  label: string;
  icon: typeof Sparkles;
}> = [
  { key: 'attention', label: 'Attention', icon: Eye },
  { key: 'energy', label: 'Energy', icon: Zap },
  { key: 'curiosity', label: 'Curiosity', icon: Sparkles },
  { key: 'confidence', label: 'Confidence', icon: TrendingUp },
  { key: 'uncertainty', label: 'Uncertainty', icon: AlertCircle },
  { key: 'social_engagement', label: 'Social', icon: Heart },
  { key: 'task_focus', label: 'Task Focus', icon: Target },
  { key: 'novelty', label: 'Novelty', icon: BookOpen },
];

export default function CompanionScreen() {
  const { colors: c } = useTheme();
  const {
    companion,
    state,
    selfModel,
    loading,
    error,
    updateCompanion,
  } = useCompanion();

  const [editingPersona, setEditingPersona] = useState(false);
  const [personaText, setPersonaText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameText, setNameText] = useState('');

  const styles = useMemo(() => createStyles(c), [c]);

  const savePersona = useCallback(async () => {
    try {
      await updateCompanion({ persona: personaText.trim() });
      setEditingPersona(false);
    } catch (err) {
      // error is surfaced via the hook's error state
    }
  }, [personaText, updateCompanion]);

  const saveName = useCallback(async () => {
    if (!nameText.trim()) return;
    try {
      await updateCompanion({ name: nameText.trim() });
      setEditingName(false);
    } catch (err) {
      // error is surfaced via the hook's error state
    }
  }, [nameText, updateCompanion]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={c.primary[400]} />
      </SafeAreaView>
    );
  }

  if (error && !companion) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  const beliefs = selfModel?.beliefs || [];
  const goals = selfModel?.goals || [];
  const values = selfModel?.values || [];
  const capabilities = selfModel?.capabilities || [];
  const limitations = selfModel?.limitations || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.avatarCircle}>
            <Sparkles color={c.primary[400]} size={36} strokeWidth={1.5} />
          </View>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameText}
                onChangeText={setNameText}
                autoFocus
                placeholder="Companion name"
                placeholderTextColor={c.neutral[500]}
              />
              <TouchableOpacity style={styles.saveSmallButton} onPress={saveName}>
                <Text style={styles.saveSmallText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)}>
                <X color={c.neutral[400]} size={20} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => {
                setNameText(companion?.name || '');
                setEditingName(true);
              }}
            >
              <Text style={styles.companionName}>{companion?.name || 'Companion'}</Text>
              <Pencil color={c.neutral[500]} size={16} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <Text style={styles.companionDescription}>
            {companion?.description || 'Your personal AI companion'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Persona</Text>
            <TouchableOpacity
              onPress={() => {
                setPersonaText(companion?.persona || '');
                setEditingPersona(true);
              }}
            >
              <Text style={styles.sectionAction}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.personaText}>{companion?.persona}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Internal State</Text>
          <Text style={styles.sectionSubtitle}>
            Computational variables that influence behavior — not literal emotions
          </Text>
          <View style={styles.stateGrid}>
            {state &&
              STATE_VARIABLES.map((sv) => {
                const Icon = sv.icon;
                const value = state[sv.key] as number;
                return (
                  <View key={sv.key} style={styles.stateCard}>
                    <View style={styles.stateCardHeader}>
                      <Icon color={c.primary[300]} size={16} strokeWidth={2} />
                      <Text style={styles.stateLabel}>{sv.label}</Text>
                    </View>
                    <Text style={styles.stateValue}>{Math.round(value * 100)}%</Text>
                    <View style={styles.stateBar}>
                      <View
                        style={[
                          styles.stateBarFill,
                          {
                            width: `${value * 100}%`,
                            backgroundColor:
                              value > 0.7
                                ? c.success[400]
                                : value > 0.4
                                ? c.primary[400]
                                : c.warning[400],
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Target color={c.accent[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Goals</Text>
          </View>
          {goals.length > 0 ? (
            goals.map((goal, i) => (
              <View key={i} style={styles.listItem}>
                <View style={styles.listItemDot} />
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemText}>{goal.text}</Text>
                  <View style={styles.listItemMeta}>
                    <Text style={styles.listItemMetaText}>{goal.priority}</Text>
                    <Text style={styles.listItemMetaSeparator}>·</Text>
                    <Text style={styles.listItemMetaText}>{goal.status}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No goals defined yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Heart color={c.secondary[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Values</Text>
          </View>
          {values.length > 0 ? (
            values.map((value, i) => (
              <View key={i} style={styles.listItem}>
                <View style={styles.listItemDot} />
                <Text style={styles.listItemText}>{value.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No values defined yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Sparkles color={c.warning[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Beliefs</Text>
          </View>
          {beliefs.length > 0 ? (
            beliefs.map((belief, i) => (
              <View key={i} style={styles.listItem}>
                <View style={styles.listItemDot} />
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemText}>{belief.text}</Text>
                  <Text style={styles.listItemMetaText}>
                    Confidence: {Math.round(belief.confidence * 100)}%
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No beliefs formed yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Zap color={c.success[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Capabilities</Text>
          </View>
          {capabilities.length > 0 ? (
            <View style={styles.tagWrap}>
              {capabilities.map((cap, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{cap}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No capabilities registered</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <AlertCircle color={c.error[400]} size={18} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Limitations</Text>
          </View>
          {limitations.length > 0 ? (
            <View style={styles.tagWrap}>
              {limitations.map((lim, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: c.error[900] }]}>
                  <Text style={[styles.tagText, { color: c.error[300] }]}>{lim}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No limitations recorded</Text>
          )}
        </View>

        <View style={styles.footer} />
      </ScrollView>

      <Modal visible={editingPersona} transparent animationType="fade" onRequestClose={() => setEditingPersona(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditingPersona(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Persona</Text>
              <TouchableOpacity onPress={() => setEditingPersona(false)}>
                <X color={c.neutral[400]} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              value={personaText}
              onChangeText={setPersonaText}
              placeholder="Describe your companion's personality..."
              placeholderTextColor={c.neutral[500]}
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.modalSaveButton} onPress={savePersona}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.neutral[950] },
    loadingContainer: { flex: 1, backgroundColor: c.neutral[950], alignItems: 'center', justifyContent: 'center' },
    errorText: { ...Typography.body, color: c.error[400], textAlign: 'center', padding: Spacing.lg },
    scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
    heroSection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
    avatarCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.neutral[900], alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.sm, borderWidth: 1, borderColor: c.neutral[800],
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    companionName: { ...Typography.heading, color: c.neutral[100] },
    nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    nameInput: {
      ...Typography.heading, color: c.neutral[100], backgroundColor: c.neutral[800],
      borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, minWidth: 150,
    },
    saveSmallButton: { backgroundColor: c.primary[600], borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2 },
    saveSmallText: { ...Typography.caption, color: c.neutral[0], fontFamily: 'Inter-SemiBold' },
    companionDescription: { ...Typography.body, color: c.neutral[400], textAlign: 'center' },
    section: {
      backgroundColor: c.neutral[900], borderRadius: Radius.lg,
      padding: Spacing.md, marginTop: Spacing.sm, gap: Spacing.sm,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    sectionTitle: { ...Typography.subheading, color: c.neutral[100] },
    sectionSubtitle: { ...Typography.caption, color: c.neutral[500] },
    sectionAction: { ...Typography.caption, color: c.primary[400], fontFamily: 'Inter-SemiBold' },
    personaText: { ...Typography.body, color: c.neutral[300], lineHeight: 22 },
    stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    stateCard: { width: '48%', backgroundColor: c.neutral[800], borderRadius: Radius.md, padding: Spacing.sm + 2, gap: Spacing.xs },
    stateCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    stateLabel: { ...Typography.caption, color: c.neutral[300], fontFamily: 'Inter-Medium' },
    stateValue: { ...Typography.subheading, color: c.neutral[100] },
    stateBar: { height: 4, borderRadius: 2, backgroundColor: c.neutral[800], overflow: 'hidden' },
    stateBarFill: { height: '100%', borderRadius: 2 },
    listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    listItemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary[500], marginTop: 7 },
    listItemContent: { flex: 1, gap: Spacing.xs },
    listItemText: { ...Typography.body, color: c.neutral[200], flexShrink: 1 },
    listItemMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    listItemMetaText: { ...Typography.small, color: c.neutral[500] },
    listItemMetaSeparator: { ...Typography.small, color: c.neutral[700] },
    emptyText: { ...Typography.caption, color: c.neutral[600] },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    tag: { backgroundColor: c.neutral[800], borderRadius: Radius.pill, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2 },
    tagText: { ...Typography.small, color: c.neutral[300], fontFamily: 'Inter-Medium' },
    footer: { height: Spacing.xl },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.lg },
    modalContent: { backgroundColor: c.neutral[900], borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    modalTitle: { ...Typography.subheading, color: c.neutral[100] },
    modalInput: {
      ...Typography.body, color: c.neutral[100], backgroundColor: c.neutral[800],
      borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, minHeight: 120, maxHeight: 240,
    },
    modalSaveButton: { backgroundColor: c.primary[600], borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
    modalSaveText: { ...Typography.bodyMedium, color: c.neutral[0], fontFamily: 'Inter-SemiBold' },
  });
}

