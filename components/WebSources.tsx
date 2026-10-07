import { View, Text, Pressable, Linking } from 'react-native';
import { useTheme } from '@/lib/theme-context';

export function WebSources({ value }: { value: unknown }) {
  const { colors: c } = useTheme();
  if (!value || typeof value !== 'object') return null;
  const sources = (value as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return null;
  return <View style={{ gap: 10, marginTop: 16 }}>
    <Text style={{ color: c.primary[300], fontSize: 12 }}>Web sources · search snippets</Text>
    {sources.slice(0,6).map((source,index) => {
      if (!source || typeof source.url !== 'string' || typeof source.title !== 'string') return null;
      let url: URL;
      try { url = new URL(source.url); } catch { return null; }
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
      return <Pressable key={index} accessibilityRole="link" accessibilityLabel={`Open source ${index + 1}: ${source.title}`} onPress={() => void Linking.openURL(url.toString()).catch(() => {})} style={{ padding: 12, borderRadius: 12, backgroundColor: c.neutral[900] }}>
        <Text style={{ color: c.primary[300], lineHeight: 22 }}>[{index + 1}] {source.title}</Text>
        <Text style={{ color: c.neutral[400], fontSize: 12, marginTop: 4 }}>{url.hostname}</Text>
      </Pressable>;
    })}
  </View>;
}
