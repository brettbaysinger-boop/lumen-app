import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { authHeaders } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
interface Route {capability:string;provider:string;endpoint:string;model:string;configured:boolean;note:string}
export function ProviderRoutes({companionId}:{companionId:string}){
 const {colors:c}=useTheme(),[rows,setRows]=useState<Route[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async(signal?:AbortSignal)=>{const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,15000);signal?.addEventListener('abort',abort);if(signal?.aborted)abort();setBusy(true);setError('');setRows([]);try{
  const base=process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/,'');if(!base)throw new Error('API address is missing.');
  const response=await fetch(`${base}/v0.9/providers/companions/${encodeURIComponent(companionId)}`,{headers:await authHeaders(),signal:controller.signal});
  if(!response.ok)throw new Error('Could not load provider routes. Check your session and API.');
  const data=await response.json();if(!Array.isArray(data.routes))throw new Error('Provider response was incomplete.');
  if(!signal?.aborted)setRows(data.routes);
 }catch(error){if(!signal?.aborted)setError(controller.signal.aborted?'Provider lookup timed out. Try refreshing.':error instanceof Error?error.message:'Could not load routes.');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(!signal?.aborted)setBusy(false);}},[companionId]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
 return <View style={{backgroundColor:c.neutral[900],padding:20,borderRadius:16,gap:14}}>
  <Text style={{color:c.neutral[100],fontSize:18}}>AI providers</Text>
  <Text style={{color:c.neutral[400],lineHeight:21}}>Configured destinations. This does not measure live health or GPU use. Refresh after changing your model.</Text>
  {rows.map(row=><View key={row.capability} style={{gap:4}}><Text style={{color:c.primary[300]}}>{row.capability}</Text><Text selectable style={{color:c.neutral[200]}}>{row.provider} · {row.endpoint}</Text><Text selectable style={{color:c.neutral[300]}}>{row.model}</Text><Text style={{color:c.neutral[400],fontSize:12}}>{row.note}</Text></View>)}
  {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void load()}><Text style={{color:c.primary[300]}}>{busy?'Loading routes…':'Refresh provider routes'}</Text></Pressable>
 </View>;
}
