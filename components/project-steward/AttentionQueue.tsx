import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BellRing } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import { ATTENTION_LABEL, PRIORITY_LABEL, type AttentionItem } from '@/lib/project-steward/status';

interface Props {
  items: AttentionItem[];
  onOpen: (id: string) => void;
}

/** "Needs attention" queue: blockers first, then stale/unchecked/unverified items. */
export function AttentionQueue({ items, onOpen }: Props) {
  return (
    <View style={styles.box} testID="ps-attention">
      <View style={styles.header}>
        <BellRing color={Colors.secondary[300]} size={18} strokeWidth={2} />
        <Text style={styles.title}>Needs attention</Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing blocked, stale or unchecked.</Text>
      ) : (
        items.map(({ project, reasons }) => (
          <Pressable
            key={project.id}
            onPress={() => onOpen(project.id)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            accessibilityRole="link"
            testID={`ps-attention-${project.id}`}
          >
            <View style={styles.itemTop}>
              <Text style={styles.priority}>{PRIORITY_LABEL[project.priority]}</Text>
              <Text style={styles.name}>{project.name}</Text>
            </View>
            <Text style={styles.reasons}>{reasons.map((r) => ATTENTION_LABEL[r]).join(' · ')}</Text>
            {project.blocked_by.map((b) => (
              <Text key={b} style={styles.blocker}>
                • {b}
              </Text>
            ))}
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { ...Typography.subheading, fontSize: 18, color: Colors.neutral[100], flex: 1 },
  count: {
    ...Typography.caption,
    fontFamily: Typography.fontFamilyBold,
    color: Colors.secondary[200],
    backgroundColor: Colors.secondary[900],
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    overflow: 'hidden',
  },
  empty: { ...Typography.caption, color: Colors.neutral[400] },
  item: {
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[800],
    paddingTop: Spacing.sm,
    gap: 2,
    minHeight: 44,
  },
  itemTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  priority: { ...Typography.small, fontFamily: Typography.fontFamilyBold, color: Colors.primary[300] },
  name: { ...Typography.bodyMedium, color: Colors.neutral[100], flexShrink: 1 },
  reasons: { ...Typography.caption, color: Colors.warning[300] },
  blocker: { ...Typography.caption, color: Colors.error[200] },
});
