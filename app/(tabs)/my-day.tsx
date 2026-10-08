import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus, Search, Check, Circle } from 'lucide-react-native';
import { SmallStepCard } from '@/components/SmallStepCard';
import { DocumentSources } from '@/components/DocumentSources';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth';
import { useCompanion } from '@/hooks/useCompanion';
import { dayRequest, listDayItems, updateDayItem, requestKey, userTimezone, type DayItem, type DayKind, type SearchHit } from '@/lib/my-day';

const kinds: DayKind[] = ['task','reminder','note','list','project','goal'];
const label = (kind: string) => kind[0].toUpperCase()+kind.slice(1);
function dateInput(value: string | null) {
 if (!value) return ''; const date = new Date(value); const pad = (n: number) => String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export default function MyDayScreen() {
 const { colors: c } = useTheme(), { session } = useAuth(); const { companion, loading: companionLoading, error: companionError } = useCompanion();
 const params = useLocalSearchParams<{ item?: string }>(); const opened = useRef('');
 const [items, setItems] = useState<DayItem[]>([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
 const [filter,setFilter] = useState('all'), [showDone,setShowDone] = useState(false), [editing,setEditing] = useState<DayItem | 'new' | null>(null);
 const [kind,setKind] = useState<DayKind>('task'), [title,setTitle] = useState(''), [body,setBody] = useState(''), [due,setDue] = useState(''), [checklist,setChecklist] = useState(''), [busy,setBusy] = useState(false);
 const [query,setQuery] = useState(''), [hits,setHits] = useState<SearchHit[] | null>(null), [searching,setSearching] = useState(false), [notificationStatus,setNotificationStatus] = useState('');
 const key = useRef(requestKey()), searchController = useRef<AbortController | null>(null);
 const load = useCallback(async () => {
  if (!companion) return; setLoading(true); setError('');
  try { setItems(await listDayItems(companion.id)); } catch(e) { setError(e instanceof Error ? e.message : 'Could not load My Day.'); }
  finally { setLoading(false); }
 }, [companion?.id]);
 useFocusEffect(useCallback(() => { void load(); return () => searchController.current?.abort(); }, [load]));
 const edit = (item: DayItem | 'new') => { setEditing(item); setKind(item==='new'?'task':item.kind); setTitle(item==='new'?'':item.title); setBody(item==='new'?'':item.body); setDue(item==='new'?'':dateInput(item.due_at)); setChecklist(item==='new'?'':item.checklist.map(x=>x.text).join('\n')); key.current=requestKey(); setError(''); };
 useEffect(() => { const item = items.find(i=>i.id===params.item); if (item && opened.current!==item.id) { opened.current=item.id; edit(item); } }, [params.item,items]);
 const save = async () => {
  if (!companion || !title.trim()) { setError('Give this item a title.'); return; }
  let dueAt: string | null = null;
  if (due) {
   const value = new Date(due); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due) || !Number.isFinite(value.getTime()) || dateInput(value.toISOString())!==due) { setError('Use a valid local date and time: YYYY-MM-DDTHH:mm.'); return; }
   dueAt=value.toISOString();
  }
  if (kind==='reminder' && !dueAt) { setError('Choose a date and time for your reminder.'); return; }
  const old = editing && editing!=='new' ? editing : null;
  const checks=checklist.split('\n').map(x=>x.trim()).filter(Boolean).map(text=>({text,done:old?.checklist.find(x=>x.text===text)?.done||false}));
  setBusy(true); setError('');
  try {
   if (old) await updateDayItem(companion.id,old.id,{title:title.trim(),body,checklist:checks,due_at:dueAt,timezone:userTimezone()});
   else await dayRequest(companion.id,'','POST',{kind,title:title.trim(),body,checklist:checks,due_at:dueAt,timezone:userTimezone(),request_key:key.current});
   setEditing(null); await load();
  } catch(e) { setError(e instanceof Error ? e.message : 'Could not save this item.'); } finally { setBusy(false); }
 };
 const change = async (item: DayItem, changes: Partial<DayItem>) => {
  if (!companion || busy) return; setBusy(true); setError('');
  try { const saved = await updateDayItem(companion.id,item.id,changes); setItems(old=>old.map(row=>row.id===saved.id?saved:row)); }
  catch(e) { setError(e instanceof Error ? e.message : 'Could not update this item.'); } finally { setBusy(false); }
 };
 const search = async () => {
  if (!companion || query.trim().length<2) { setError('Enter at least two characters to search.'); return; }
  searchController.current?.abort(); const controller=new AbortController(); searchController.current=controller; setSearching(true); setError('');
  try { const result=await dayRequest<SearchHit[]>(companion.id,`/search?q=${encodeURIComponent(query.trim())}`,'GET',undefined,controller.signal); if (!controller.signal.aborted) setHits(result); }
  catch(e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Search failed.'); }
  finally { if (!controller.signal.aborted) setSearching(false); }
 };
 const visible=items.filter(i=>(showDone?i.status!=='open':i.status==='open') && (filter==='all'||i.kind===filter)).sort((a,b)=>(a.due_at||'9999').localeCompare(b.due_at||'9999'));
 const textStyle={color:c.neutral[100],fontFamily:'Inter-Regular' as const};
 const field={...textStyle,borderWidth:1,borderColor:c.neutral[700],borderRadius:12,padding:14};
 const button=(text:string,onPress:()=>void,active=false)=> <Pressable key={text} accessibilityRole="button" disabled={busy} onPress={onPress} style={{padding:12,borderRadius:10,borderWidth:1,borderColor:active?c.primary[400]:c.neutral[700]}}><Text style={{color:active?c.primary[300]:c.neutral[300],fontSize:12}}>{text}</Text></Pressable>;
 if (!companionLoading && !companion) return <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:c.neutral[950]}}><Text style={{color:c.error[300]}}>{companionError||'Could not load your companion. Return to Conversation and try again.'}</Text></View>;
 if (companionLoading) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.neutral[950]}}><ActivityIndicator color={c.primary[400]}/></View>;
 return <SafeAreaView edges={['top']} style={{flex:1,backgroundColor:c.neutral[950]}}><ScrollView contentContainerStyle={{width:'100%',maxWidth:820,alignSelf:'center',padding:20,gap:20,paddingBottom:50}}>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View><Text style={{...textStyle,fontSize:32,fontFamily:'Inter-Medium',letterSpacing:-1}}>My Day</Text><Text style={{color:c.neutral[400],fontSize:13,marginTop:8}}>A little less to carry in your head.</Text></View><Pressable accessibilityLabel="Add My Day item" onPress={()=>edit('new')} style={{padding:12,borderRadius:14,backgroundColor:c.neutral[800]}}><Plus size={22} color={c.primary[400]}/></Pressable></View>
  <Pressable accessibilityRole="button" onPress={()=>router.push('/goals')}><Text style={{color:c.primary[300],paddingVertical:12}}>Goals & practice</Text></Pressable>
  <View style={{backgroundColor:c.neutral[900],borderRadius:18,padding:18,gap:10}}><Text style={{...textStyle,fontSize:17}}>{items.filter(i=>i.status==='open'&&i.kind==='task').length} open tasks · {items.filter(i=>i.status==='open'&&i.kind==='reminder').length} reminders</Text><Text style={{color:c.neutral[400],fontSize:12,lineHeight:20}}>Times shown in {userTimezone()}. Reminders appear here while Lumen is open, or when you return.</Text>
   {Platform.OS==='web' && <Pressable onPress={async()=>{ if(typeof Notification==='undefined'){setNotificationStatus('Browser alerts are not supported here. In-app reminders still work.');return;} try{const permission=await Notification.requestPermission();if(permission==='granted'){localStorage.setItem(`lumen-browser-alerts-${session?.user.id}`,'yes');setNotificationStatus('Browser alerts enabled while Lumen is open.');}else setNotificationStatus('Use the in-app inbox, or allow notifications in your browser settings.');}catch{setNotificationStatus('Browser alerts need HTTPS or localhost. In-app reminders still work.');} }}><Text style={{color:c.primary[300],fontSize:12}}>Enable browser reminder alerts</Text></Pressable>}
   {Platform.OS==='web'&&<Pressable onPress={()=>{try{localStorage.removeItem(`lumen-browser-alerts-${session?.user.id}`);}catch{}setNotificationStatus('Browser alerts disabled. In-app reminders remain available.');}}><Text style={{color:c.neutral[400],fontSize:11}}>Turn off browser alerts</Text></Pressable>}
   {!!notificationStatus&&<Text style={{color:c.neutral[400],fontSize:11}}>{notificationStatus}</Text>}
  </View>
  <View style={{backgroundColor:c.neutral[900],padding:16,borderRadius:14,gap:8}}>
   <Text style={{...textStyle,fontSize:16}}>Capture from chat</Text>
   <Text style={{color:c.neutral[300],lineHeight:23}}>Try “add milk, eggs to my shopping list”, “save a gift idea: a book for Sarah”, or “take a note: ask about the warranty”. Then edit or check off your items here. Feeling stuck? Try “help me get unstuck: my desk is covered in paperwork”.</Text>
   <Pressable accessibilityRole="button" onPress={()=>router.push('/')}><Text style={{color:c.primary[300]}}>Open conversation</Text></Pressable>
  </View>
  <View style={{gap:10}}><Text style={{...textStyle,fontSize:16}}>Find something you saved</Text><View style={{flexDirection:'row',gap:8,alignItems:'center'}}><TextInput accessibilityLabel="Search your information" placeholder="Movie, recommendation, note…" placeholderTextColor={c.neutral[500]} value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} style={[field,{flex:1,minWidth:0}]}/><Pressable accessibilityLabel="Search saved information" onPress={()=>void search()} style={{padding:12}}>{searching?<ActivityIndicator color={c.primary[400]}/>:<Search color={c.primary[400]} size={20}/>}</Pressable></View>
   {hits!==null&&<View style={{gap:12}}>{button('Close search',()=>setHits(null))}{!hits.length&&<Text style={{color:c.neutral[400]}}>No saved sources matched. Try a shorter phrase.</Text>}{hits.map(hit=><Pressable key={`${hit.kind}-${hit.id}`} onPress={()=>{if(hit.kind==='message'||hit.kind==='memory'){if(hit.conversation_id)router.push({pathname:'/',params:{conversation:hit.conversation_id}});else if(hit.kind==='memory')router.push('/memories');}else{const item=items.find(i=>i.id===hit.id);if(item)edit(item);}}} style={{backgroundColor:c.neutral[900],padding:16,borderRadius:14,gap:8}}><Text style={{color:c.primary[300],fontSize:11}}>{label(hit.kind)} · {new Date(hit.created_at).toLocaleDateString()}</Text><Text style={{...textStyle,lineHeight:23}}>{hit.content}</Text><Text style={{color:c.neutral[400],fontSize:11}}>{hit.conversation_id?'Open source conversation':hit.kind==='memory'?'Saved memory':'Open item'}</Text></Pressable>)}</View>}
  </View>
  {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300],lineHeight:22}}>{error}</Text>}
  {items.length>=500&&<Text style={{color:c.neutral[400],fontSize:12}}>Showing your 500 most recent items. Search can find older notes and conversations.</Text>}
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{button('All',()=>setFilter('all'),filter==='all')}{kinds.map(k=>button(label(k)+'s',()=>setFilter(k),filter===k))}</ScrollView>
  <View style={{flexDirection:'row',justifyContent:'space-between'}}><Pressable onPress={()=>setShowDone(!showDone)}><Text style={{color:c.primary[300],fontSize:12}}>{showDone?'Show open items':'Show completed / archived'}</Text></Pressable><Pressable onPress={()=>void load()}><Text style={{color:c.neutral[400],fontSize:12}}>{loading?'Loading…':'Refresh'}</Text></Pressable></View>
  {visible.map(item=><View key={item.id} style={{backgroundColor:c.neutral[900],borderWidth:1,borderColor:c.neutral[800],borderRadius:18,padding:18,gap:12}}>
   <View style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}><Pressable disabled={busy} accessibilityLabel={`${item.status==='open'?'Complete':'Reopen'} ${item.title}`} onPress={()=>void change(item,{status:item.status==='open'?'done':'open'})} style={{padding:4}}>{item.status==='done'?<Check size={20} color={c.primary[400]}/>:<Circle size={20} color={c.neutral[400]}/>}</Pressable><View style={{flex:1}}><Text style={{color:c.primary[300],fontSize:10,letterSpacing:1}}>{item.kind.toUpperCase()} · {item.status.toUpperCase()}</Text><Text style={{...textStyle,fontSize:18,lineHeight:25,marginTop:8}}>{item.title}</Text></View></View>
   {item.kind==='goal'&&<Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/goals',params:{goal:item.id}})}><Text style={{color:c.primary[300]}}>Practice this goal</Text></Pressable>}
   {!!item.source_documents?.length&&<DocumentSources value={item.source_documents} companionId={item.companion_id}/>}
   {item.step_mode&&<SmallStepCard item={item} onChange={value=>setItems(previous=>previous.map(row=>row.id===value.id?value:row))}/>}
   {!!item.body&&<Text style={{color:c.neutral[300],lineHeight:23}}>{item.body}</Text>}
   {!!item.due_at&&<Text style={{color:new Date(item.due_at).getTime()<Date.now()&&item.status==='open'?c.warning[300]:c.neutral[400],fontSize:12}}>{new Date(item.due_at).getTime()<Date.now()&&item.status==='open'?'Due · ':''}{new Date(item.due_at).toLocaleString()}</Text>}
   {!item.step_mode&&item.checklist.map((check,index)=><Pressable key={index} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:check.done}} onPress={()=>void change(item,{checklist:item.checklist.map((row,i)=>i===index?{...row,done:!row.done}:row)})} style={{flexDirection:'row',gap:10,paddingVertical:5}}>{check.done?<Check color={c.primary[400]} size={18}/>:<Circle color={c.neutral[400]} size={18}/>}<Text style={{color:check.done?c.neutral[500]:c.neutral[200],textDecorationLine:check.done?'line-through':'none',flex:1}}>{check.text}</Text></Pressable>)}
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:20}}><Pressable onPress={()=>edit(item)}><Text style={{color:c.primary[300],fontSize:12}}>Edit / reschedule</Text></Pressable><Pressable onPress={()=>router.push({pathname:'/',params:{draft:`Help me work on this ${item.kind}: ${item.title}.\n${item.body}\n${item.checklist.filter(x=>!x.done).map(x=>x.text).join('\n')}\nLet's choose one small next step.`}})}><Text style={{color:c.primary[300],fontSize:12}}>Work on it together</Text></Pressable><Pressable disabled={busy} onPress={()=>void change(item,{status:item.status==='archived'?'open':'archived'})}><Text style={{color:c.neutral[400],fontSize:12}}>{item.status==='archived'?'Restore':'Archive'}</Text></Pressable></View>
  </View>)}
  {!visible.length&&!loading&&<Text style={{color:c.neutral[400],lineHeight:24}}>Nothing here yet. Add an item, or tell {companion?.name||'your companion'}: “add a task: call the mechanic”.</Text>}
 </ScrollView>
 <Modal visible={editing!==null} transparent animationType="fade" onRequestClose={()=>{if(!busy)setEditing(null);}}><View style={{flex:1,backgroundColor:'rgba(0,0,0,.75)',justifyContent:'center',padding:20}}><ScrollView style={{maxHeight:'90%',maxWidth:640,width:'100%',alignSelf:'center',backgroundColor:c.neutral[900],borderRadius:20}} contentContainerStyle={{padding:24,gap:16}}>
  <Text style={{...textStyle,fontSize:24}}>{editing==='new'?'A little something to remember':'Make it yours'}</Text>
  {editing==='new'&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{kinds.map(k=>button(label(k),()=>setKind(k),kind===k))}</View>}
  <TextInput accessibilityLabel="Item title" placeholder="Title" placeholderTextColor={c.neutral[500]} value={title} onChangeText={setTitle} maxLength={300} editable={!busy} style={field}/>
  <TextInput accessibilityLabel="Item notes" placeholder="Notes, draft, or the next step…" placeholderTextColor={c.neutral[500]} value={body} onChangeText={setBody} multiline maxLength={12000} editable={!busy} style={[field,{minHeight:100}]}/>
  <TextInput accessibilityLabel="Checklist lines" placeholder="Checklist: one item per line" placeholderTextColor={c.neutral[500]} value={checklist} onChangeText={setChecklist} multiline editable={!busy} style={[field,{minHeight:80}]}/>
  <Text style={{color:c.neutral[400],fontSize:12}}>Date / time ({userTimezone()}) · required for reminders</Text><TextInput accessibilityLabel="Item local date and time" placeholder="2026-10-07T09:00" placeholderTextColor={c.neutral[500]} value={due} onChangeText={setDue} editable={!busy} style={field}/>
  {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
  <View style={{flexDirection:'row',justifyContent:'space-between'}}>{button(busy?'Saving…':'Save',()=>void save())}{button('Cancel',()=>setEditing(null))}</View>
 </ScrollView></View></Modal>
 </SafeAreaView>;
}
