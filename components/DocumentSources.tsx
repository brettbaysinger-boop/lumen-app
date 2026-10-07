import { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { documentRequest, type DocumentSource } from '@/lib/documents';

export function validDocumentSources(value: unknown): DocumentSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is DocumentSource => !!s && typeof s.title === 'string' && typeof s.excerpt === 'string'
    && typeof s.document_id === 'string' && /^[0-9a-f-]{36}$/.test(s.document_id)
    && Number.isInteger(s.page) && s.page > 0 && s.page <= 100 && Number.isInteger(s.number));
}

export function DocumentSources({ value, companionId }: { value: unknown; companionId: string }) {
  const { colors: c } = useTheme();
  const sources = validDocumentSources(value);
  const [opened, setOpened] = useState<DocumentSource | null>(null), [pageText,setPageText] = useState(''), [error,setError] = useState('');
  const request = useRef(0);
  const close = () => {request.current++;setOpened(null);};
  const open = async (source: DocumentSource) => {
    const key = ++request.current;
    setOpened(source); setPageText(''); setError('');
    try {
      const result = await documentRequest<{content:string}>(companionId,`/${source.document_id}/pages/${source.page}`);
      if (key === request.current) setPageText(result.content);
    } catch (e) { if (key === request.current) setError(e instanceof Error ? e.message : 'Could not read this page.'); }
  };
  if (!sources.length) return null;
  return <View style={{ gap: 10, marginTop: 12 }}>
    <Text style={{ color:c.primary[300] }}>Document sources</Text>
    {sources.map(source => <Pressable key={source.number} accessibilityRole="button" accessibilityLabel={`Read document source ${source.number}: ${source.title}, page ${source.page}`}
      onPress={() => void open(source)} style={{padding:12,borderRadius:12,backgroundColor:c.neutral[900]}}>
      <Text style={{color:c.primary[300]}}>[{source.number}] {source.title} · page {source.page}</Text>
      <Text style={{color:c.neutral[300],marginTop:8,lineHeight:22}}>{source.excerpt}</Text>
    </Pressable>)}
    <Modal visible={!!opened} transparent animationType="fade" onRequestClose={close}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,.8)',justifyContent:'center',padding:20}}>
        <View style={{backgroundColor:c.neutral[900],padding:20,borderRadius:16,maxHeight:'85%',width:'100%',maxWidth:800,alignSelf:'center',gap:14}}>
          <Text style={{color:c.neutral[100],fontSize:18}}>{opened?.title} · page {opened?.page}</Text>
          {!!error && <Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
          <ScrollView><Text selectable style={{color:c.neutral[100],lineHeight:24}}>{pageText || opened?.excerpt}</Text></ScrollView>
          <Pressable accessibilityRole="button" onPress={close}><Text style={{color:c.primary[300],padding:10}}>Close document page</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}
