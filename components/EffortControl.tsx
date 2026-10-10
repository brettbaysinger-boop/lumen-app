import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { modelRequest } from '@/lib/models';
import { useTheme } from '@/lib/theme-context';
type Effort = 'quick' | 'deep' | 'default';
export function EffortControl({companionId, model, value, onChange, disabled}: {companionId:string;model?:string|null;value:Effort;onChange:(value:Effort)=>void;disabled:boolean}) {
  const {colors:c}=useTheme();
  const [supported,setSupported]=useState(false);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{let active=true;setSupported(false);
    modelRequest(companionId).then(result=>{if(active)setSupported(result.effort_supported===true);}).catch(()=>{});
    return()=>{active=false;};
  },[companionId,model,refresh]);
  return <View style={{padding:8,gap:6}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{(['quick','deep','default'] as Effort[]).map(mode=><Pressable key={mode} accessibilityRole="radio" aria-checked={(supported?value:'default')===mode} aria-disabled={disabled||(!supported&&mode!=='default')} accessibilityState={{checked:(supported?value:'default')===mode,disabled:disabled||(!supported&&mode!=='default')}} disabled={disabled||(!supported&&mode!=='default')} onPress={()=>onChange(mode)}><Text style={{color:(supported?value:'default')===mode?c.primary[300]:c.neutral[400]}}>{mode==='quick'?'Quick':mode==='deep'?'Think deeper':'Model default'}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={()=>setRefresh(n=>n+1)}><Text style={{color:c.neutral[400],fontSize:11}}>Refresh effort support after changing models</Text></Pressable>
    <Text style={{color:c.neutral[400],fontSize:11}}>{supported?'Conversation effort · document workflows use their own drafting settings.':'Model default · effort control has not been verified for this model.'}</Text>
  </View>;
}
