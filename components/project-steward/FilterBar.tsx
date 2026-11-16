import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import {
  PRIORITY_LABEL,
  QUICK_FILTER_LABEL,
  type ProjectQuery,
  type QuickFilter,
} from '@/lib/project-steward/status';
import { PRIORITIES, type Priority } from '@/lib/project-steward/types';

interface Props {
  query: ProjectQuery;
  onChange: (q: ProjectQuery) => void;
  counts: Partial<Record<QuickFilter, number>>;
}

const QUICK: QuickFilter[] = ['all', 'attention', 'blocked', 'stale', 'deployed_evidence'];

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function FilterBar({ query, onChange, counts }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <Search color={Colors.neutral[500]} size={18} strokeWidth={2} />
        <TextInput
          style={styles.input}
          value={query.text}
          onChangeText={(text) => onChange({ ...query, text })}
          placeholder="Search projects, repos, blockers, sources…"
          placeholderTextColor={Colors.neutral[500]}
          accessibilityLabel="Search projects"
          autoCorrect={false}
          autoCapitalize="none"
          testID="ps-search"
        />
        {query.text.length > 0 ? (
          <Pressable
            onPress={() => onChange({ ...query, text: '' })}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clear}
          >
            <X color={Colors.neutral[400]} size={16} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chips}>
        {QUICK.map((q) => (
          <Chip
            key={q}
            label={`${QUICK_FILTER_LABEL[q]}${counts[q] !== undefined ? ` ${counts[q]}` : ''}`}
            active={query.quick === q}
            onPress={() => onChange({ ...query, quick: q })}
            testID={`ps-filter-${q}`}
          />
        ))}
      </View>
      <View style={styles.chips}>
        <Chip
          label="Any priority"
          active={query.priority === 'any'}
          onPress={() => onChange({ ...query, priority: 'any' })}
          testID="ps-priority-any"
        />
        {PRIORITIES.map((p: Priority) => (
          <Chip
            key={p}
            label={PRIORITY_LABEL[p]}
            active={query.priority === p}
            onPress={() => onChange({ ...query, priority: p })}
            testID={`ps-priority-${p}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: Colors.neutral[100],
    paddingVertical: Spacing.sm,
    minWidth: 0,
  },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.neutral[700],
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: Colors.primary[600], borderColor: Colors.primary[400] },
  chipText: { ...Typography.caption, fontFamily: Typography.fontFamilyMedium, color: Colors.neutral[300] },
  chipTextActive: { color: Colors.neutral[0] },
});
