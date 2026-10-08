import { useEffect,useState } from 'react';
import { View,Text,TextInput,Pressable } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { unstuckRequest,type SmallPlan } from '@/lib/unstuck';
import type { DayItem } from '@/lib/my-day';
import { SmallStepCard } from './SmallStepCard';
export function UnstuckDraft({value,companionId,messageId}:{value:unknown;companionId:string;messageId:string}){
 if(!value||typeof value!=='object')return null;const plan=value as SmallPlan;
 if(typeof plan.title!=='string'||typeof plan.body!=='string'||!Array.isArray(plan.steps)||!plan.steps.every(step=>typeof step==='string'))return null;
 return <Draft plan={plan} cid={companionId} id={messageId}/>;
}
function Draft({plan,cid,id}:{plan:SmallPlan;cid:string;id:string}){
 const {colors:c}=useTheme(),[title,setTitle]=useState(plan.title),[body,setBody]=useState(plan.body),[steps,setSteps]=useState(plan.steps.join('\n'));
 const [saved,setSaved]=useState<DayItem|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const check=async()=>{setBusy(true);setError('');try{const result=await unstuckRequest<{item:DayItem|null}>(cid,`/drafts/${id}`);setSaved(result.item);}catch(error){setError(error instanceof Error?error.message:'Could not check save status.');}finally{setBusy(false);}};
 useEffect(()=>{let active=true;unstuckRequest<{item:DayItem|null}>(cid,`/drafts/${id}`).then(result=>{if(active)setSaved(result.item);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[cid,id]);
 const save=async()=>{setBusy(true);setError('');try{const value=await unstuckRequest<DayItem>(cid,`/drafts/${id}/save`,'POST',{title,body,steps:steps.split('\n').map(text=>text.trim()).filter(Boolean)});if(!value.id)throw new Error('Save was not confirmed. Reload before retrying.');setSaved(value);}catch(error){setError(error instanceof Error?error.message:'Could not save.');}finally{setBusy(false);}};
 if(saved)return <SmallStepCard item={saved}/>;
 const field={color:c.neutral[100],backgroundColor:c.neutral[800],padding:12,borderRadius:8};
 return <View style={{backgroundColor:c.neutral[900],borderColor:c.neutral[700],borderWidth:1,borderRadius:14,padding:16,gap:12,marginTop:12}}>
  <Text style={{color:c.primary[300]}}>ONE SMALL STEP · DRAFT</Text>
  <Text style={{color:c.neutral[300],lineHeight:22}}>Make this plan fit your situation. Save it when you’re ready; then we’ll show just the next step.</Text>
  <TextInput accessibilityLabel="Small-step plan title" maxLength={200} editable={!busy} value={title} onChangeText={setTitle} style={field}/>
  <TextInput accessibilityLabel="Small-step plan notes" multiline maxLength={2000} editable={!busy} value={body} onChangeText={setBody} style={field}/>
  <Text style={{color:c.neutral[400]}}>Up to five small steps, one per line</Text>
  <TextInput accessibilityLabel="Small-step plan steps" multiline maxLength={1504} editable={!busy} value={steps} onChangeText={setSteps} style={[field,{minHeight:120}]}/>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()}><Text style={{color:c.primary[300]}}>{busy?'Checking…':'Save small-step plan'}</Text></Pressable>
  {!!error&&<><Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void check()}><Text style={{color:c.primary[300]}}>Check saved status</Text></Pressable></>}
 </View>;
}
