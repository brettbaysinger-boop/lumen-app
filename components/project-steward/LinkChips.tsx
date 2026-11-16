import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, CircleDot, GitBranch, Globe } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import { isSafeUrl, type LinkKind, type ProjectLink } from '@/lib/project-steward/insights';

const ICON: Record<LinkKind, LucideIcon> = {
  repo: GitBranch,
  live: Globe,
  issues: CircleDot,
  docs: BookOpen,
};

/** One row of link-out chips: repo, live URL, issues, docs. https only. */
export function LinkChips({ links }: { links: ProjectLink[] }) {
  const safe = links.filter((l) => isSafeUrl(l.url));
  if (safe.length === 0) return null;
  return (
    <View style={styles.row} testID="ps-detail-links">
      {safe.map((l) => {
        const Icon = ICON[l.kind];
        return (
          <Pressable
            key={l.url}
            onPress={() => Linking.openURL(l.url)}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            accessibilityRole="link"
            accessibilityHint="Opens in a browser"
            testID={`ps-link-${l.kind}`}
          >
            <Icon color={Colors.primary[200]} size={16} strokeWidth={2} />
            <Text style={styles.text}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary[700],
    backgroundColor: Colors.primary[900],
  },
  text: { ...Typography.caption, fontFamily: Typography.fontFamilyMedium, color: Colors.primary[100] },
});
