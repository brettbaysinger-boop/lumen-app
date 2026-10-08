import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { dayRequest, updateDayItem, type DayItem } from '@/lib/my-day';

export function SmallStepCard({item,onChange}:{item:DayItem;onChange?:(item:DayItem)=>void}){
 const {colors:c}=useTheme(),[current,setCurrent]=useState(item),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setCurrent(item);},[item]);
 const reload=async()=>{setBusy(true);setError('');try{const value=await dayRequest<DayItem>(item.companion_id,`/items/${item.id}`);setCurrent(value);onChange?.(value);}catch(error){setError(error instanceof Error?error.message:'Could not load this plan.');}finally{setBusy(false);}};
 const index=current.checklist.findIndex(step=>!step.done),step=current.checklist[index];
 const done=async()=>{if(!step)return;setBusy(true);setError('');try{const value=await dayRequest<DayItem>(current.companion_id,`/items/${current.id}/step`,'POST',{index,text:step.text});setCurrent(value);onChange?.(value);}catch(error){setError(error instanceof Error?error.message:'Could not save progress.');}finally{setBusy(false);}};
 const complete=async()=>{setBusy(true);setError('');try{const value=await updateDayItem(current.companion_id,current.id,{status:'done'});setCurrent(value);onChange?.(value);}catch(error){setError(error instanceof Error?error.message:'Could not complete this plan.');}finally{setBusy(false);}};
 return <View style={{backgroundColor:c.neutral[900],borderColor:c.neutral[700],borderWidth:1,borderRadius:14,padding:16,gap:12,marginTop:12}}>
  <Text style={{color:c.primary[300]}}>ONE SMALL STEP · {current.status.toUpperCase()}</Text>
  <Text style={{color:c.neutral[100],fontSize:17}}>{current.title}</Text>
  <Text style={{color:c.neutral[400]}}>{current.checklist.filter(row=>row.done).length} of {current.checklist.length} steps done</Text>
  {current.status==='open'&&step?<><Text style={{color:c.neutral[100],lineHeight:24}}>{step.text}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void done()}><Text style={{color:c.primary[300]}}>{busy?'Saving…':'I did this step'}</Text></Pressable><Text style={{color:c.neutral[400],fontSize:12}}>You can pause here. Saved progress will be here when you return.</Text></>:<Text style={{color:c.neutral[300]}}>{current.status==='open'?'All steps are checked off. You can finish the plan or edit it in My Day.':'Open My Day to review or reopen this plan.'}</Text>}
  {current.status==='open'&&!step&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void complete()}><Text style={{color:c.primary[300]}}>Finish plan</Text></Pressable>}
  <View style={{flexDirection:'row',gap:20,flexWrap:'wrap'}}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void reload()}><Text style={{color:c.primary[300]}}>Refresh progress</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/my-day',params:{item:current.id}})}><Text style={{color:c.primary[300]}}>Edit full plan in My Day</Text></Pressable></View>
  {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
 </View>;
}
