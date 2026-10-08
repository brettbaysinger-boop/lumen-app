import {useCallback,useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useCompanion} from '@/hooks/useCompanion';
import {useTheme} from '@/lib/theme-context';
import {dayRequest,requestKey,userTimezone,type DayItem} from '@/lib/my-day';
import {goalRequest,type GoalProfile,type GoalSession} from '@/lib/goals';
const defaults:GoalProfile={level:'beginner',focus:'Everyday Spanish',minutes:5,cadence:'flexible'};
export default function GoalsScreen(){
 const {colors:c}=useTheme(),{companion,loading:companionLoading,error:companionError}=useCompanion();
 const params=useLocalSearchParams<{goal?:string}>();
 const [goals,setGoals]=useState<DayItem[]>([]),[selectedId,setSelectedId]=useState(''),[sessions,setSessions]=useState<GoalSession[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [creating,setCreating]=useState(false),[title,setTitle]=useState('Learn Spanish'),[profile,setProfile]=useState<GoalProfile>(defaults);
 const [summary,setSummary]=useState(''),[notes,setNotes]=useState(''),[vocabulary,setVocabulary]=useState(''),[nextStep,setNextStep]=useState('');
 const createKey=useRef(requestKey()),startKey=useRef(requestKey()),loadVersion=useRef(0);
 const selected=goals.find(goal=>goal.id===selectedId),open=sessions.find(session=>session.status==='open');
 const load=useCallback(async()=>{
  if(!companion)return;const version=++loadVersion.current;setLoading(true);setError('');
  try{const rows=await goalRequest<DayItem[]>(companion.id);if(version===loadVersion.current){setGoals(rows);setSelectedId(old=>rows.find(g=>g.id===params.goal)?.id||(rows.some(g=>g.id===old)?old:'')||rows.find(g=>g.status==='open')?.id||rows[0]?.id||'');}}
  catch(e){if(version===loadVersion.current)setError(e instanceof Error?e.message:'Could not load goals.');}finally{if(version===loadVersion.current)setLoading(false);}
 },[companion?.id,params.goal]);
 useFocusEffect(useCallback(()=>{void load();return()=>{loadVersion.current++;};},[load]));
 const loadSessions=useCallback(async()=>{
  if(!companion||!selectedId)return;
  const rows=await goalRequest<GoalSession[]>(companion.id,`/${selectedId}/sessions`);setSessions(rows);
 },[companion?.id,selectedId]);
 useEffect(()=>{
  let active=true;setSessions([]);setSummary('');setNotes('');setVocabulary('');setNextStep('');startKey.current=requestKey();
  const row=goals.find(g=>g.id===selectedId);
  if(row){setProfile({...defaults,focus:row.title,...row.goal_profile} as GoalProfile);}
  if(companion&&selectedId)goalRequest<GoalSession[]>(companion.id,`/${selectedId}/sessions`).then(rows=>{if(active)setSessions(rows);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[companion?.id,selectedId]);
 const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Could not save practice.');}finally{setBusy(false);}};
 const create=()=>run(async()=>{
  if(!companion||!title.trim())throw new Error('Give your goal a name.');
  const item=await dayRequest<DayItem>(companion.id,'','POST',{kind:'goal',title:title.trim(),body:'',request_key:createKey.current,timezone:userTimezone()});
  await load();setSelectedId(item.id);setCreating(false);createKey.current=requestKey();setNotice('Goal saved. Choose your practice preferences below.');
 });
 const saveProfile=async()=>{
  if(!companion||!selected)return;
  if(!profile.focus.trim())throw new Error('Choose a practice focus.');
  const item=await goalRequest<DayItem>(companion.id,`/${selected.id}/profile`,'PATCH',profile);setGoals(rows=>rows.map(row=>row.id===item.id?item:row));
 };
 const start=()=>run(async()=>{
  if(!companion||!selected)return;await saveProfile();
  const session=await goalRequest<GoalSession>(companion.id,`/${selected.id}/sessions`,'POST',{request_key:startKey.current});
  if(!session?.conversation_id)throw new Error('Practice response was incomplete. Reload before retrying.');
  router.push({pathname:'/',params:{conversation:session.conversation_id,draft:'Let’s practice this goal. Use my saved progress and give me one small exercise to begin.'}});
 });
 const finish=()=>run(async()=>{
  if(!companion||!selected||!open)return;
  if(!summary.trim())throw new Error('Add a short progress note before finishing.');
  await goalRequest(companion.id,`/${selected.id}/sessions/${open.id}/finish`,'POST',{summary,practice_notes:notes,vocabulary,next_step:nextStep});
  await loadSessions();startKey.current=requestKey();setSummary('');setNotes('');setVocabulary('');setNextStep('');setNotice('Session saved. Your next practice will include these notes.');
 });
 const field={color:c.neutral[100],backgroundColor:c.neutral[900],borderColor:c.neutral[700],borderWidth:1,padding:12,borderRadius:10};
 const button=(label:string,action:()=>void,disabled=false)=><Pressable key={label} accessibilityRole="button" disabled={busy||disabled} onPress={action} style={{padding:12,borderRadius:10,borderWidth:1,borderColor:c.neutral[700],opacity:(busy||disabled)?0.5:1}}><Text style={{color:c.primary[300]}}>{label}</Text></Pressable>;
 if(companionLoading)return <ActivityIndicator color={c.primary[300]}/>;
 if(!companion)return <Text style={{color:c.error[300],padding:24}}>{companionError||'Could not load your companion.'}</Text>;
 return <SafeAreaView style={{flex:1,backgroundColor:c.neutral[950]}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:60,gap:16,maxWidth:820,width:'100%',alignSelf:'center'}}>
  <Text style={{color:c.neutral[100],fontSize:30}}>Goals & practice</Text>
  <Text style={{color:c.neutral[300],lineHeight:23}}>A little practice, with a place to pick up next time.</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{button('Back to conversation',()=>router.push('/'))}{button('New goal',()=>{setCreating(true);setTitle('Learn Spanish');})}</View>
  {!!error&&<Text accessibilityRole="alert" style={{color:c.error[300]}}>{error}</Text>}
  {!!notice&&<Text style={{color:c.primary[300]}}>{notice}</Text>}
  {loading&&<ActivityIndicator color={c.primary[300]}/>}
  {creating&&<View style={{gap:12}}><TextInput accessibilityLabel="Goal name" value={title} onChangeText={setTitle} maxLength={300} editable={!busy} style={field}/><View style={{flexDirection:'row',gap:12}}>{button('Create goal',()=>void create())}{button('Cancel new goal',()=>setCreating(false))}</View></View>}
  {!loading&&!goals.length&&!creating&&<Text style={{color:c.neutral[300]}}>Start with a goal such as Learn Spanish, or reopen a goal you already saved in My Day.</Text>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{goals.map(goal=>button(`${goal.title}${goal.status==='open'?'':' · '+goal.status}`,()=>{setSelectedId(goal.id);setNotice('');setError('');}))}</View>
  {selected&&<>
   <Text style={{color:c.neutral[100],fontSize:22}}>{selected.title}</Text>
   {!!selected.body&&<Text style={{color:c.neutral[300]}}>{selected.body}</Text>}
   <Text style={{color:c.neutral[300]}}>Practice focus</Text><TextInput accessibilityLabel="Practice focus" value={profile.focus} onChangeText={focus=>setProfile(p=>({...p,focus}))} multiline maxLength={1000} editable={!busy} style={field}/>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{button('Everyday Spanish',()=>setProfile(p=>({...p,focus:'Everyday Spanish'})))}{button('Customer Spanish',()=>setProfile(p=>({...p,focus:'Spanish for pest-control customer conversations: appointments and explaining services.'})))}</View>
   <Text style={{color:c.neutral[300]}}>Level · {profile.level}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{(['beginner','intermediate','advanced'] as const).map(level=>button(level,()=>setProfile(p=>({...p,level}))))}</View>
   <Text style={{color:c.neutral[300]}}>Preferred session length · {profile.minutes} minutes</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[5,10,15,30].map(minutes=>button(`${minutes} minutes`,()=>setProfile(p=>({...p,minutes}))))}</View>
   <Text style={{color:c.neutral[300]}}>Practice rhythm · {profile.cadence}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{(['daily','weekly','flexible'] as const).map(cadence=>button(cadence,()=>setProfile(p=>({...p,cadence}))))}</View>
   <Text style={{color:c.neutral[400],lineHeight:21}}>Rhythm and minutes are preferences. They do not schedule notifications or run a timer. Preference changes apply to new sessions; an open session keeps its original setup.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{button('Save practice preferences',()=>void run(async()=>{await saveProfile();setNotice('Practice preferences saved.');}))}{button(open?'Resume practice':'Start practice',()=>void start(),selected.status!=='open')}{button('Edit goal in My Day',()=>router.push({pathname:'/my-day',params:{item:selected.id}}))}</View>
   {open&&<View style={{gap:12,backgroundColor:c.neutral[800],padding:16,borderRadius:14}}>
    <Text style={{color:c.neutral[100],fontSize:20}}>Save this session</Text><Text style={{color:c.neutral[300]}}>Record what you tried. Finishing saves these notes; it does not mark the entire goal complete.</Text>
    <TextInput accessibilityLabel="Session progress" placeholder="What did you practice?" value={summary} onChangeText={setSummary} multiline maxLength={2000} editable={!busy} style={field}/>
    <TextInput accessibilityLabel="Practice corrections" placeholder="Corrections or things to revisit" value={notes} onChangeText={setNotes} multiline maxLength={2000} editable={!busy} style={field}/>
    <TextInput accessibilityLabel="Practice vocabulary" placeholder="Useful vocabulary" value={vocabulary} onChangeText={setVocabulary} multiline maxLength={2000} editable={!busy} style={field}/>
    <TextInput accessibilityLabel="Next practice step" placeholder="One next step" value={nextStep} onChangeText={setNextStep} maxLength={300} editable={!busy} style={field}/>
    {button('Finish and save session',()=>void finish())}
   </View>}
   <Text style={{color:c.neutral[100],fontSize:22}}>Recent practice</Text>
   {!sessions.some(s=>s.status==='completed')&&<Text style={{color:c.neutral[300]}}>Your saved sessions will appear here.</Text>}
   {sessions.filter(s=>s.status==='completed').slice(0,20).map(s=><View key={s.id} style={{gap:10,padding:16,backgroundColor:c.neutral[900],borderRadius:14}}>
    <Text style={{color:c.primary[300]}}>{new Date(s.ended_at||s.started_at).toLocaleString()}</Text><Text style={{color:c.neutral[100]}}>{s.summary}</Text>
    {!!s.practice_notes&&<Text style={{color:c.neutral[300]}}>Revisit: {s.practice_notes}</Text>}{!!s.vocabulary&&<Text style={{color:c.neutral[300]}}>Vocabulary: {s.vocabulary}</Text>}{!!s.next_step&&<Text style={{color:c.neutral[300]}}>Next: {s.next_step}</Text>}
    {button('Open saved practice chat',()=>router.push({pathname:'/',params:{conversation:s.conversation_id}}))}
   </View>)}
  </>}
 </ScrollView></SafeAreaView>;
}
