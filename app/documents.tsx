import { createElement, useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useCompanion } from '@/hooks/useCompanion';
import { useTheme } from '@/lib/theme-context';
import { documentRequest, MAX_DOCUMENT_BYTES, type PrivateDocument, type DocumentHit } from '@/lib/documents';
import { DocumentSources } from '@/components/DocumentSources';

export default function DocumentsScreen() {
  const { session,loading } = useAuth(), {companion} = useCompanion(), {colors:c} = useTheme();
  const input = useRef<HTMLInputElement | null>(null);
  const [documents,setDocuments] = useState<PrivateDocument[]>([]), [hits,setHits] = useState<DocumentHit[]>([]);
  const [query,setQuery] = useState(''), [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false), [deleting,setDeleting] = useState('');
  const refresh = useCallback(async () => {
    if (!companion) return;
    setDocuments(await documentRequest<PrivateDocument[]>(companion.id));
  },[companion?.id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (companion) documentRequest<PrivateDocument[]>(companion.id).then(rows => {if(active)setDocuments(rows);}).catch(e => {if(active)setError(e.message);});
    return () => {active=false;};
  },[companion?.id]));
  const upload = async (file: File) => {
    if (!companion) return;
    if (file.size > MAX_DOCUMENT_BYTES) {setError('Choose a file up to 25 MB.');return;}
    setBusy(true);setError('');setNotice('');
    try {
      const body = new FormData();body.append('file',file);
      const result=await documentRequest<PrivateDocument & {existing:boolean}>(companion.id,'/upload','POST',body);
      setNotice(result.existing ? 'This document is already imported.' : `Imported ${result.title}.`);
      await refresh();
    } catch(e) {setError(e instanceof Error?e.message:'Upload failed.');}
    finally {setBusy(false);}
  };
  const search = async () => {
    if (!companion || query.trim().length<2) {setError('Enter at least two characters.');return;}
    setBusy(true);setError('');setNotice('');
    try {const rows=await documentRequest<DocumentHit[]>(companion.id,'/search','POST',{query:query.trim()});setHits(rows);if(!rows.length)setNotice('No matching text. Try specific words from the document.');}
    catch(e) {setError(e instanceof Error?e.message:'Search failed.');}
    finally {setBusy(false);}
  };
  const remove = async (id:string) => {
    if (!companion) return;
    setBusy(true);setError('');
    try {await documentRequest(companion.id,`/${id}`,'DELETE');setHits([]);setDeleting('');await refresh();}
    catch(e) {setError(e instanceof Error?e.message:'Delete failed.');}
    finally {setBusy(false);}
  };
  if (loading) return <ActivityIndicator color={c.primary[300]} />;
  if (!session) return <Redirect href="/login" />;
  const button=(label:string,onPress:()=>void)=> <Pressable accessibilityRole="button" disabled={busy || !companion} onPress={onPress} style={{paddingVertical:12}}><Text style={{color:c.primary[300]}}>{label}</Text></Pressable>;
  return <SafeAreaView style={{flex:1,backgroundColor:c.neutral[950]}}><ScrollView contentContainerStyle={{padding:20,gap:16,width:'100%',maxWidth:900,alignSelf:'center'}}>
    {button('Back to conversation',()=>router.dismissTo('/'))}
    <Text style={{color:c.neutral[100],fontSize:28}}>Your documents</Text>
    <Text style={{color:c.neutral[300],lineHeight:23}}>Import PDFs with selectable text, TXT or Markdown files. Up to 25 MB and 100 pages. Scanned PDFs need OCR first.</Text>
    <Text style={{color:c.neutral[400],lineHeight:22}}>Only extracted text is saved privately for this companion. Original files are not retained. Deleting an import removes its indexed text; earlier quoted chat replies remain.</Text>
    {Platform.OS === 'web' ? <>
      {createElement('input',{ref:input,type:'file',accept:'.pdf,.txt,.md',style:{display:'none'},onChange:(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}})}
      {button('Import document',()=>input.current?.click())}
    </> : <Text style={{color:c.neutral[400]}}>Use Lumen in a browser to import files in this release.</Text>}
    {busy && <ActivityIndicator color={c.primary[300]} />}
    {!!error && <Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
    {!!notice && <Text style={{color:c.neutral[200]}}>{notice}</Text>}
    <TextInput accessibilityLabel="Search document text" placeholder="Warranty, refrigerator, billing…" placeholderTextColor={c.neutral[500]} value={query} onChangeText={setQuery} maxLength={500}
      style={{color:c.neutral[100],padding:14,borderWidth:1,borderColor:c.neutral[700],borderRadius:12}} />
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:20}}>
      {button('Search documents',()=>void search())}
      {button('Ask companion',()=>{if(query.trim().length>=2)router.dismissTo({pathname:'/',params:{draft:`Search my documents: ${query.trim()}`}});else setError('Enter a question first.');})}
    </View>
    {companion && <DocumentSources companionId={companion.id} value={hits.map((hit,i)=>({...hit,number:i+1,excerpt:hit.content}))} />}
    <Text style={{color:c.neutral[100],fontSize:20}}>Imported text · {documents.length}</Text>
    {documents.map(doc=><View key={doc.id} style={{padding:16,borderRadius:12,backgroundColor:c.neutral[900],gap:8}}>
      <Text style={{color:c.neutral[100]}}>{doc.title}</Text>
      <Text style={{color:c.neutral[400]}}>{doc.page_count} page{doc.page_count===1?'':'s'} · {doc.kind}</Text>
      {button('Explain this document',()=>router.dismissTo({pathname:'/',params:{document:doc.id,draft:'Explain this document in plain language.'}}))}
      {deleting===doc.id ? <View style={{flexDirection:'row',gap:24}}>{button('Delete extracted text',()=>void remove(doc.id))}{button('Keep document',()=>setDeleting(''))}</View>
        : button(`Delete ${doc.title}`,()=>setDeleting(doc.id))}
    </View>)}
  </ScrollView></SafeAreaView>;
}
