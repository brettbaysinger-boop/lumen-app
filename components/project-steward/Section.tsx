import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';

interface Props {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  /** Small right-aligned element, typically a checked-time line. */
  aside?: React.ReactNode;
  testID?: string;
}

export function Section({ title, icon: Icon, children, aside, testID }: Props) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.header}>
        <Icon color={Colors.primary[300]} size={18} strokeWidth={2} />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {aside}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.neutral[900],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  title: { ...Typography.subheading, fontSize: 17, color: Colors.neutral[100], flexGrow: 1 },
});
