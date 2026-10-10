import {useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {useTheme} from '@/lib/theme-context';
interface Request {kind:string;provider:string;endpoint:string;model:string;status:string;duration_ms:number}
export function ProviderRequests({value}:{value:unknown}){
 const {colors:c}=useTheme(),[expanded,setExpanded]=useState(false);
 if(!Array.isArray(value))return null;
 const rows=value.filter((row):row is Request=>!!row&&typeof row==='object'&&['kind','provider','endpoint','model','status'].every(key=>typeof row[key]==='string')&&typeof row.duration_ms==='number');
 return <View style={{marginTop:8,gap:8}}><Pressable accessibilityRole="button" onPress={()=>setExpanded(!expanded)}><Text style={{color:c.primary[300],fontSize:12}}>Provider requests {expanded?'▾':'▸'}</Text></Pressable>{expanded&&<>
  {!rows.length&&<Text style={{color:c.neutral[400],fontSize:12}}>No text, vision, structured-output or image model request was made for this reply.</Text>}
  {rows.map((row,index)=><Text selectable key={index} style={{color:c.neutral[400],fontSize:12,lineHeight:19}}>{row.kind} · {row.provider} · {row.endpoint}{'\n'}{row.model} · {row.status} · {(row.duration_ms/1000).toFixed(2)}s</Text>)}
  {!!rows.length&&<Text style={{color:c.neutral[400],fontSize:11}}>Recorded requests, not GPU telemetry. Background memory processing and speech playback are separate.</Text>}
 </>}</View>;
}
