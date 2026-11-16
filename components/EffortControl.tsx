import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { modelRequest } from '@/lib/models';
import { useTheme } from '@/lib/theme-context';
type Effort = 'quick' | 'deep' | 'default';
// `compact` (phone widths): only the choices, on one line, and nothing at all while the model offers no choice.
// The explanations stay on wider screens, where there is room for them.
export function EffortControl({companionId, model, value, onChange, disabled, compact = false}: {companionId:string;model?:string|null;value:Effort;onChange:(value:Effort)=>void;disabled:boolean;compact?:boolean}) {
  const {colors:c}=useTheme();
  const [supported,setSupported]=useState(false);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{let active=true;setSupported(false);
    modelRequest(companionId).then(result=>{if(active)setSupported(result.effort_supported===true);}).catch(()=>{});
    return()=>{active=false;};
  },[companionId,model,refresh]);
  if(compact&&!supported)return null;
  return <View style={{padding:compact?4:8,paddingHorizontal:compact?12:8,gap:6}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{(['quick','deep','default'] as Effort[]).map(mode=><Pressable key={mode} accessibilityRole="radio" aria-checked={(supported?value:'default')===mode} aria-disabled={disabled||(!supported&&mode!=='default')} accessibilityState={{checked:(supported?value:'default')===mode,disabled:disabled||(!supported&&mode!=='default')}} disabled={disabled||(!supported&&mode!=='default')} onPress={()=>onChange(mode)}><Text style={{color:(supported?value:'default')===mode?c.primary[300]:c.neutral[400]}}>{mode==='quick'?'Quick':mode==='deep'?'Think deeper':'Model default'}</Text></Pressable>)}</View>
    {!compact&&<Pressable accessibilityRole="button" onPress={()=>setRefresh(n=>n+1)}><Text style={{color:c.neutral[400],fontSize:11}}>Refresh effort support after changing models</Text></Pressable>}
    {!compact&&<Text style={{color:c.neutral[400],fontSize:11}}>{supported?'Conversation effort · document workflows use their own drafting settings.':'Model default · effort control has not been verified for this model.'}</Text>}
  </View>;
}
