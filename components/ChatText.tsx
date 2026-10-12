import { Fragment } from 'react';
import { View, Text, Platform, type StyleProp, type TextStyle } from 'react-native';
import { CitationText } from './WebSources';

export function ChatText({ content, citations, format = true, style }: {
  content: string; citations?: unknown; format?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  if (!format) return <Text selectable style={style}>{content}</Text>;
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g)
    .map((part, index) => {
      const bold = /^(?:\*\*|__)/.test(part) && part.length >= 4;
      const code = part.startsWith('`') && part.endsWith('`') && part.length > 1;
      const value = bold ? part.slice(2, -2) : code ? part.slice(1, -1) : part;
      return <Text key={index} style={bold ? { fontWeight: '700', fontFamily: 'Inter-SemiBold' }
        : code ? { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' } : undefined}>
        <CitationText content={value} value={citations} />
      </Text>;
    });

  let fenced = false;
  return <View style={{ gap: 3, flexShrink: 1 }}>
    {content.split('\n').map((line, index) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return null; }
      if (fenced) return <Text key={index} selectable
        style={[style, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          lineHeight: 23 }]}>{line || ' '}</Text>;
      if (!line.trim()) return <View key={index} style={{ height: 7 }} />;
      const heading = /^#{1,6}\s+/.test(line);
      const bullet = /^\s*[-*]\s+/.test(line);
      const value = heading ? line.replace(/^#{1,6}\s+/, '')
        : bullet ? line.replace(/^\s*[-*]\s+/, '• ') : line;
      return <Fragment key={index}>
        <Text selectable style={[style, { lineHeight: 25 },
          heading && { fontWeight: '700', fontFamily: 'Inter-SemiBold', marginTop: 7 }]}>
          {inline(value)}
        </Text>
      </Fragment>;
    })}
  </View>;
}
