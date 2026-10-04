import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Brain,
  Plus,
  Trash2,
  Search,
  Heart,
  BookOpen,
  Clock,
  User as UserIcon,
  Sparkles,
  Zap,
  X,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Radius, Typography } from '@/lib/theme';
import type { Companion, Memory, MemoryType, MemorySubject } from '@/types/database';

const MEMORY_TYPE_CONFIG: Record<
  MemoryType,
  { label: string; icon: typeof Brain; color: string }
> = {
  episodic: { label: 'Episodic', icon: Clock, color: Colors.primary[400] },
  semantic: { label: 'Semantic', icon: BookOpen, color: Colors.accent[400] },
  preference: { label: 'Preference', icon: Heart, color: Colors.secondary[400] },
  relationship: { label: 'Relationship', icon: UserIcon, color: Colors.success[400] },
  autobiographical: { label: 'Autobiographical', icon: Sparkles, color: Colors.warning[400] },
  procedural: { label: 'Procedural', icon: Zap, color: Colors.neutral[300] },
};

function subjectLabel(subject: MemorySubject, name?: string) {
  return { user: 'You', companion: name || 'Companion', shared: 'Both of you', unknown: 'Unassigned' }[subject] || 'Unassigned';
}

export default function MemoriesScreen() {
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemorySubject, setNewMemorySubject] = useState<MemorySubject>('user');
  const [newMemoryType, setNewMemoryType] = useState<MemoryType>('semantic');
  const [newMemoryImportance, setNewMemoryImportance] = useState('0.5');

  const loadCompanion = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('companions')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (data) setCompanion(data as Companion);
    setLoading(false);
  }, []);

  const loadMemories = useCallback(async () => {
    if (!companion) return;
    let query = supabase
      .from('memories')
      .select('*')
      .eq('companion_id', companion.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (filterType !== 'all') {
      query = query.eq('type', filterType);
    }

    if (searchQuery.trim()) {
      query = query.ilike('content', `%${searchQuery.trim()}%`);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      return;
    }
    setMemories((data as Memory[]) || []);
  }, [companion, filterType, searchQuery]);

  useEffect(() => {
    loadCompanion();
  }, [loadCompanion]);

  useEffect(() => {
    if (companion) loadMemories();
  }, [companion, loadMemories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMemories();
    setRefreshing(false);
  }, [loadMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('memories')
      .update({ is_active: false })
      .eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addMemory = useCallback(async () => {
    if (!companion || !newMemoryContent.trim()) return;
    const importance = parseFloat(newMemoryImportance) || 0.5;
    const { data, error: err } = await supabase
      .from('memories')
      .insert({
        companion_id: companion.id,
        type: newMemoryType,
        content: newMemoryContent.trim(),
        importance: Math.max(0, Math.min(1, importance)),
        source: 'manual',
        subject: newMemorySubject,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    setMemories((prev) => [data as Memory, ...prev]);
    setNewMemoryContent('');
    setNewMemoryImportance('0.5');
    setShowAddModal(false);
  }, [companion, newMemoryContent, newMemoryType, newMemoryImportance, newMemorySubject]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary[400]} />
      </SafeAreaView>
    );
  }

  const filteredMemories = memories;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Brain color={Colors.primary[400]} size={24} strokeWidth={2} />
          <Text style={styles.headerTitle}>Memories</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Plus color={Colors.primary[400]} size={22} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search color={Colors.neutral[500]} size={18} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search memories..."
          placeholderTextColor={Colors.neutral[500]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X color={Colors.neutral[500]} size={16} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          <FilterChip
            label="All"
            active={filterType === 'all'}
            onPress={() => setFilterType('all')}
          />
          {(Object.keys(MEMORY_TYPE_CONFIG) as MemoryType[]).map((type) => (
            <FilterChip
              key={type}
              label={MEMORY_TYPE_CONFIG[type].label}
              active={filterType === type}
              onPress={() => setFilterType(type)}
              color={MEMORY_TYPE_CONFIG[type].color}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          {filteredMemories.length} {filteredMemories.length === 1 ? 'memory' : 'memories'}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filteredMemories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary[400]} />}
        renderItem={({ item }) => {
          const config = MEMORY_TYPE_CONFIG[item.type];
          const Icon = config.icon;
          return (
            <View style={styles.memoryCard}>
              <View style={styles.memoryCardHeader}>
                <View style={styles.memoryTypeBadge}>
                  <Icon color={config.color} size={14} strokeWidth={2} />
                  <Text style={[styles.memoryTypeLabel, { color: config.color }]}>
                    {config.label}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteMemory(item.id)}
                  style={styles.deleteButton}
                >
                  <Trash2 color={Colors.neutral[600]} size={16} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Text style={styles.memoryDate}>About: {subjectLabel(item.subject, companion?.name)}</Text>
              <Text style={styles.memoryContent}>{item.content}</Text>
              <View style={styles.typeSelector}>
                {(['user', 'companion', 'shared', 'unknown'] as MemorySubject[]).map(subject => (
                  <TouchableOpacity key={subject} style={styles.typeChip} onPress={async () => {
                    const { data, error: err } = await supabase.from('memories').update({ subject }).eq('id', item.id).select().single();
                    if (err) setError(err.message);
                    else setMemories(previous => previous.map(memory => memory.id === item.id ? data as Memory : memory));
                  }} accessibilityLabel={`Set memory subject to ${subjectLabel(subject, companion?.name)}`}>
                    <Text style={[styles.typeChipText, { color: item.subject === subject ? Colors.primary[300] : Colors.neutral[400] }]}>{subjectLabel(subject, companion?.name)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.memoryFooter}>
                <View style={styles.importanceBar}>
                  <View
                    style={[
                      styles.importanceFill,
                      { width: `${item.importance * 100}%`, backgroundColor: config.color },
                    ]}
                  />
                </View>
                <Text style={styles.memoryDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Brain color={Colors.neutral[700]} size={48} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No memories yet</Text>
            <Text style={styles.emptySubtitle}>
              {companion?.name} will remember things that matter to you here. You can also add
              memories manually.
            </Text>
          </View>
        }
      />

      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Memory</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X color={Colors.neutral[400]} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              value={newMemoryContent}
              onChangeText={setNewMemoryContent}
              placeholder="What should your companion remember?"
              placeholderTextColor={Colors.neutral[500]}
              multiline
              autoFocus
            />
            <Text style={styles.modalLabel}>Who is this memory about?</Text>
            <View style={styles.typeSelector}>
              {(['user', 'companion', 'shared', 'unknown'] as MemorySubject[]).map(subject => (
                <TouchableOpacity key={subject} style={[styles.typeChip, newMemorySubject === subject && { backgroundColor: Colors.neutral[700] }]} onPress={() => setNewMemorySubject(subject)}>
                  <Text style={styles.typeChipText}>{subjectLabel(subject, companion?.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.typeSelector}>
              {(Object.keys(MEMORY_TYPE_CONFIG) as MemoryType[]).map((type) => {
                const config = MEMORY_TYPE_CONFIG[type];
                const Icon = config.icon;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      newMemoryType === type && { backgroundColor: Colors.neutral[700] },
                    ]}
                    onPress={() => setNewMemoryType(type)}
                  >
                    <Icon color={config.color} size={14} strokeWidth={2} />
                    <Text style={styles.typeChipText}>{config.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalLabel}>Importance: {Math.round(parseFloat(newMemoryImportance || '0.5') * 100)}%</Text>
            <View style={styles.importanceSlider}>
              {[0.1, 0.25, 0.5, 0.75, 1.0].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.importancePill,
                    parseFloat(newMemoryImportance) === val && { backgroundColor: Colors.primary[600] },
                  ]}
                  onPress={() => setNewMemoryImportance(val.toString())}
                >
                  <Text
                    style={[
                      styles.importancePillText,
                      parseFloat(newMemoryImportance) === val && { color: Colors.neutral[0] },
                    ]}
                  >
                    {Math.round(val * 100)}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.modalSaveButton, !newMemoryContent.trim() && styles.modalSaveButtonDisabled]}
              onPress={addMemory}
              disabled={!newMemoryContent.trim()}
            >
              <Text style={styles.modalSaveText}>Save Memory</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          active && { color: color || Colors.neutral[0] },
        ]}
      >
        {label}
      </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.heading,
    color: Colors.neutral[100],
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.neutral[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.neutral[100],
    padding: 0,
  },
  filterRow: {
    marginBottom: Spacing.sm,
  },
  filterContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.neutral[900],
  },
  filterChipActive: {
    backgroundColor: Colors.neutral[700],
  },
  filterChipText: {
    ...Typography.caption,
    fontFamily: 'Inter-Medium',
    color: Colors.neutral[400],
  },
  statsRow: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  statsText: {
    ...Typography.caption,
    color: Colors.neutral[500],
  },
  errorBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.error[900],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error[200],
  },
  list: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  memoryCard: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  memoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoryTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  memoryTypeLabel: {
    ...Typography.small,
    fontFamily: 'Inter-SemiBold',
  },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryContent: {
    ...Typography.body,
    color: Colors.neutral[100],
    lineHeight: 22,
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  importanceBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.neutral[800],
    overflow: 'hidden',
  },
  importanceFill: {
    height: '100%',
    borderRadius: 2,
  },
  memoryDate: {
    ...Typography.small,
    color: Colors.neutral[600],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.subheading,
    color: Colors.neutral[400],
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.neutral[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    ...Typography.subheading,
    color: Colors.neutral[100],
  },
  modalInput: {
    ...Typography.body,
    color: Colors.neutral[100],
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 80,
    maxHeight: 160,
  },
  modalLabel: {
    ...Typography.caption,
    color: Colors.neutral[400],
    fontFamily: 'Inter-SemiBold',
    marginTop: Spacing.sm,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.sm,
  },
  typeChipText: {
    ...Typography.small,
    color: Colors.neutral[300],
  },
  importanceSlider: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  importancePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.pill,
  },
  importancePillText: {
    ...Typography.small,
    color: Colors.neutral[400],
  },
  modalSaveButton: {
    backgroundColor: Colors.primary[600],
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  modalSaveButtonDisabled: {
    backgroundColor: Colors.neutral[700],
  },
  modalSaveText: {
    ...Typography.bodyMedium,
    color: Colors.neutral[0],
    fontFamily: 'Inter-SemiBold',
  },
});
