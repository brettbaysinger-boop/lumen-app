import {useEffect, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/lib/auth';
import {useTheme} from '@/lib/theme-context';

type Revision = {id:string; kind:'correction'|'change'; before_content:string; after_content:string; undone_at:string|null};
export function MemoryCorrectionCard({value, memoryId, onUndo}:{value?:unknown; memoryId?:string; onUndo?:()=>void}) {
 const {colors:c}=useTheme();
 const {session}=useAuth();
 const owner=session?.user.id;
 const id=value && typeof value==='object' && 'id' in value && typeof value.id==='string' ? value.id : null;
 const [revision,setRevision]=useState<Revision|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [expanded,setExpanded]=useState(false);
 const generation=useRef(0);
 const activeOwner=useRef(owner); activeOwner.current=owner;
 const [loadedOwner,setLoadedOwner]=useState<string|undefined>();
 useEffect(()=>{
  const current=++generation.current;
  setRevision(null);setError('');setBusy(false);setExpanded(false);setLoadedOwner(undefined);
  if((!id && !memoryId) || !owner)return;
  let query=supabase.from('memory_revisions')
   .select('id,kind,before_content,after_content,undone_at');
  query=id ? query.eq('id',id) : query.eq('memory_id',memoryId!)
   .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
  void query.maybeSingle()
   .then(({data,error:err})=>{
    if(generation.current!==current || activeOwner.current!==owner)return;
    if(err)setError('Could not load memory correction.');
    else {setRevision(data as Revision|null);setLoadedOwner(owner);}
   });
  return ()=>{generation.current++;};
 },[id,memoryId,owner]);
 const undo=async()=>{
  if(!revision || busy || revision.undone_at || loadedOwner!==owner)return;
  const current=generation.current;
  const expectedOwner=owner;
  setBusy(true);setError('');
  try {
   const {data:auth}=await supabase.auth.getSession();
   if(auth.session?.user.id!==expectedOwner || activeOwner.current!==expectedOwner)return;
   const {data,error:err}=await supabase.rpc('undo_memory_correction',{p_id:revision.id});
   if(generation.current!==current || activeOwner.current!==expectedOwner)return;
   if(err) {setError('Could not undo. The memory may have changed; review its current value in Memories.');return;}
   if(!data || data.id!==revision.id || !data.undone_at){setError('Undo was not confirmed. Please refresh.');return;}
   setRevision(data as Revision);
   onUndo?.();
  } catch {
   if(generation.current===current)setError('Undo could not be confirmed. Please refresh before retrying.');
  } finally {if(generation.current===current)setBusy(false);}
 };
 if((!id && !memoryId) || !owner)return null;
 if(!revision || loadedOwner!==owner)return error ? <Text style={{color:c.neutral[400]}}>{error}</Text> : null;
 return <View style={{gap:6,marginTop:10}}>
  <View style={{flexDirection:'row',gap:14,alignItems:'center',flexWrap:'wrap'}}>
   <Text style={{color:c.primary[300],fontSize:12}}>{revision.undone_at?'Memory correction undone':revision.kind==='change'?'Memory updated · changed over time':'Memory corrected'}</Text>
   {!revision.undone_at && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void undo()}><Text style={{color:c.primary[300]}}>{busy?'Undoing…':'Undo'}</Text></Pressable>}
   <Pressable accessibilityRole="button" onPress={()=>setExpanded(v=>!v)}><Text style={{color:c.neutral[400],fontSize:12}}>{expanded?'Hide change':'View change'}</Text></Pressable>
  </View>
  {expanded && <Text selectable style={{color:c.neutral[300]}}>{revision.kind==='change'?'Previously':'Incorrect earlier entry'}: {revision.before_content}{'\n'}Replacement: {revision.after_content}{'\n'}This is the recorded change. Memories shows the current value.</Text>}
  {!!error && <Text style={{color:c.neutral[400]}}>{error}</Text>}
 </View>;
}
