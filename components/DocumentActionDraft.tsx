import { createElement, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { documentRequest } from '@/lib/documents';
import { proposalPDF } from '@/lib/proposal-pdf';
import { DocumentStylePanel } from './DocumentStylePanel';
import { userTimezone, type DayItem } from '@/lib/my-day';
import { DayActionCard } from './DayActionCard';

export interface ActionDraft { kind: 'list' | 'note' | 'reminder'; title: string; body: string; checklist: {text:string;done:boolean}[] }
function isDraft(value: unknown): value is ActionDraft {
  if (!value || typeof value !== 'object') return false;
  const draft=value as ActionDraft;
  return ['list','note','reminder'].includes(draft.kind) && typeof draft.title==='string' && typeof draft.body==='string'
    && Array.isArray(draft.checklist) && draft.checklist.every(item=>!!item && typeof item.text==='string');
}
export function DocumentActionDraft({ value, companionId, messageId, sources }: { value: unknown; companionId: string; messageId: string; sources?: unknown }) {
  if (!isDraft(value)) return null;
  return <DraftCard sources={sources} draft={value} companionId={companionId} messageId={messageId} />;
}
function DraftCard({draft,companionId,messageId,sources}:{draft:ActionDraft;companionId:string;messageId:string;sources?:unknown}) {
  const {colors:c}=useTheme();
  const [title,setTitle]=useState(draft.title),[body,setBody]=useState(draft.body),[steps,setSteps]=useState(draft.checklist.map(item=>item.text).join('\n'));
  const [due,setDue]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [saved,setSaved]=useState<DayItem|null>(null);
  const [pdfUrl,setPdfUrl]=useState(''),[pdfBusy,setPdfBusy]=useState(false);
  useEffect(()=>{setPdfUrl('');},[title,body]);
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);},[pdfUrl]);
  const previewPDF=async()=>{
    setPdfBusy(true);setBusy(true);setError('');
    try { const blob=await proposalPDF(companionId,messageId,title,body);setPdfUrl(URL.createObjectURL(blob)); }
    catch(error){setError(error instanceof Error?error.message:'Could not create PDF.');}
    finally {setPdfBusy(false);setBusy(false);}
  };
  useEffect(()=>{
    let active=true;
    documentRequest<{item:DayItem|null}>(companionId,`/drafts/${messageId}`).then(result=>{if(active)setSaved(result.item);})
      .catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[companionId,messageId]);
  const save=async()=>{
    setBusy(true);setError('');
    try {
      const date=due ? new Date(due) : null;
      if (draft.kind==='reminder' && (!date || !Number.isFinite(date.getTime()) || date.getTime()<=Date.now())) throw new Error('Choose a future reminder date and time.');
      const item=await documentRequest<DayItem>(companionId,`/drafts/${messageId}/save`,'POST',{
        title:title.trim(),body,checklist:draft.kind==='list'?steps.split('\n').map(text=>text.trim()).filter(Boolean).map(text=>({text,done:false})):[],
        due_at:draft.kind==='reminder'?date!.toISOString():null,timezone:userTimezone(),
      });
      if (!item?.id) throw new Error('The save response was incomplete. Reload before retrying.');
      setSaved(item);
    } catch(error) {setError(error instanceof Error?error.message:'Could not save.');}
    finally {setBusy(false);}
  };
  if(saved)return <DayActionCard item={saved} />;
  const field={color:c.neutral[100],backgroundColor:c.neutral[800],padding:12,borderRadius:8,borderWidth:1,borderColor:c.neutral[700]};
  return <View style={{backgroundColor:c.neutral[900],borderWidth:1,borderColor:c.neutral[700],padding:16,borderRadius:14,gap:12,marginTop:14}}>
    <Text style={{color:c.primary[300]}}>{draft.kind==='list'?'CHECKLIST':draft.kind.toUpperCase()} · DRAFT</Text>
    <Text style={{color:c.neutral[300]}}>Review the details and source pages before saving. Nothing is scheduled or saved in My Day yet.</Text>
    {Platform.OS==='web' && <Pressable accessibilityRole="button" onPress={()=>{
      const refs=Array.isArray(sources)?sources.filter(s=>s&&typeof s.title==='string').map(s=>`[${s.number}] ${s.title} · page ${s.page}\n${s.excerpt || ''}`).join('\n\n'):'';
      const url=URL.createObjectURL(new Blob(['REVIEW DRAFT\n\n'+title+'\n\n'+body+(steps?'\n\n'+steps:'')+(refs?'\n\nSource excerpts\n'+refs:'')],{type:'text/plain;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='companion-draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}><Text style={{color:c.primary[300]}}>Download editable text</Text></Pressable>}
    {Platform.OS==='web' && draft.kind==='note' && <>
      <DocumentStylePanel disabled={busy||pdfBusy} onBusyChange={setBusy} onChanged={()=>setPdfUrl('')}/>
      <Pressable accessibilityRole="button" disabled={pdfBusy||busy||loading} onPress={()=>void previewPDF()}><Text style={{color:c.primary[300]}}>{pdfBusy?'Preparing PDF…':'Preview proposal PDF'}</Text></Pressable>
      {!!pdfUrl && <>
        {createElement('iframe',{src:pdfUrl,title:'Proposal PDF preview',style:{width:'100%',height:520,border:0,borderRadius:8}})}
        <Pressable accessibilityRole="button" onPress={()=>{const link=document.createElement('a');link.href=pdfUrl;link.download='proposal-review-draft.pdf';link.click();}}><Text style={{color:c.primary[300]}}>Download PDF</Text></Pressable>
      </>}
    </>}
    {!editing?<>
      <Text style={{color:c.neutral[100]}}>{title}</Text>
      <Text style={{color:c.neutral[300],lineHeight:22}}>{body}</Text>
      {!!steps&&<Text style={{color:c.neutral[300],lineHeight:22}}>{steps}</Text>}
      <Pressable accessibilityRole="button" disabled={loading||busy} onPress={()=>setEditing(true)}><Text style={{color:c.primary[300]}}>{loading?'Checking save status…':'Review and save'}</Text></Pressable>
    </>:<>
      <TextInput accessibilityLabel="Draft title" value={title} onChangeText={setTitle} maxLength={300} editable={!busy} style={field}/>
      <TextInput accessibilityLabel="Draft notes" value={body} onChangeText={setBody} multiline maxLength={12000} editable={!busy} style={[field,{minHeight:90}]}/>
      {draft.kind==='list'&&<><Text style={{color:c.neutral[300]}}>Checklist · one step per line</Text><TextInput accessibilityLabel="Draft checklist" value={steps} onChangeText={setSteps} multiline maxLength={30000} editable={!busy} style={[field,{minHeight:120}]}/></>}
      {draft.kind==='reminder'&&<>
        <Text style={{color:c.neutral[300]}}>Reminder date and time · {userTimezone()}</Text>
        {Platform.OS==='web'?createElement('input',{type:'datetime-local','aria-label':'Reminder date and time',value:due,disabled:busy,onChange:(event:React.ChangeEvent<HTMLInputElement>)=>setDue(event.target.value),
          style:{color:c.neutral[100],backgroundColor:c.neutral[800],padding:12,borderRadius:8,border:'1px solid '+c.neutral[700],colorScheme:'dark',width:'100%',boxSizing:'border-box'}}):
          <TextInput accessibilityLabel="Reminder date and time" placeholder="YYYY-MM-DDTHH:MM" value={due} onChangeText={setDue} editable={!busy} style={field}/>}
      </>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:24}}>
        <Pressable accessibilityRole="button" disabled={busy||loading} onPress={()=>void save()}><Text style={{color:c.primary[300]}}>{busy?'Saving…':'Save to My Day'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={()=>setEditing(false)}><Text style={{color:c.neutral[300]}}>Keep as draft</Text></Pressable>
      </View>
    </>}
    {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
  </View>;
}
