import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, FileText } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@/lib/theme';
import { SOURCE_KIND_LABEL, sourceUrl } from '@/lib/project-steward/status';
import type { Source } from '@/lib/project-steward/types';
import { FreshnessLine } from './Freshness';

interface Props {
  sources: Source[];
  now: number;
}

export function SourceList({ sources, now }: Props) {
  if (sources.length === 0) {
    return (
      <Text style={styles.none} testID="ps-no-sources">
        No sources cited. Every status on this project is unverified.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {sources.map((s, i) => {
        const url = sourceUrl(s);
        const content = (
          <>
            <View style={styles.row}>
              {url ? (
                <ExternalLink color={Colors.primary[300]} size={14} strokeWidth={2} />
              ) : (
                <FileText color={Colors.neutral[400]} size={14} strokeWidth={2} />
              )}
              <Text style={styles.kind}>{SOURCE_KIND_LABEL[s.kind]}</Text>
              {s.commit_sha ? <Text style={styles.sha}>@{s.commit_sha.slice(0, 7)}</Text> : null}
            </View>
            <Text style={[styles.ref, url ? styles.link : null]} selectable>
              {s.ref}
            </Text>
            <FreshnessLine observedAt={s.observed_at} now={now} verbose />
          </>
        );
        return url ? (
          <Pressable
            key={`${s.ref}-${i}`}
            onPress={() => Linking.openURL(url)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            accessibilityRole="link"
            accessibilityHint="Opens the source in a browser"
            testID={`ps-source-${i}`}
          >
            {content}
          </Pressable>
        ) : (
          <View key={`${s.ref}-${i}`} style={styles.item} testID={`ps-source-${i}`}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  item: {
    backgroundColor: Colors.neutral[950],
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 2,
    minHeight: 44,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  kind: { ...Typography.small, fontFamily: Typography.fontFamilySemiBold, color: Colors.neutral[300], textTransform: 'uppercase' },
  sha: { ...Typography.small, fontFamily: 'monospace', color: Colors.neutral[400] },
  ref: { ...Typography.caption, color: Colors.neutral[200] },
  link: { color: Colors.primary[200], textDecorationLine: 'underline' },
  none: { ...Typography.caption, color: Colors.warning[300] },
});
