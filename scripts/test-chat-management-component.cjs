// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
const {ChatCache}=compile('lib/chat-cache.ts'),theme=compile('lib/theme.ts');
const values=new Map(),cache=new ChatCache({getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k),getAllKeys:async()=>[...values.keys()]});
let offline=false,pending=null,pendingList=null;
const companion={id:'c',owner_user_id:'a',name:'Test',persona:'Friendly'},conversations=[{id:'x',companion_id:'c',title:'First'},{id:'y',companion_id:'c',title:'Second'}];
function message(id){return {id:'m-'+id,conversation_id:id,companion_id:'c',role:'user',content:'History '+id,metadata:{}};}
const client={from:table=>{let id,mutation=null;const q={select:()=>q,eq:(key,value)=>{if(key==='conversation_id'||key==='id')id=value;return q},order:()=>q,limit:()=>q,abortSignal:()=>q,maybeSingle:()=>q,single:()=>q,update:value=>{mutation=value;return q},delete:()=>{mutation='delete';return q},then:(ok,bad)=>{
 if(offline)return Promise.resolve({data:null,error:{message:'Offline'}}).then(ok,bad);
 if(mutation){const index=conversations.findIndex(c=>c.id===id);if(index<0)return Promise.resolve({data:null,error:{message:'Not found'}}).then(ok,bad);const row=mutation==='delete'?conversations.splice(index,1)[0]:(conversations[index]={...conversations[index],...mutation});return Promise.resolve({data:row,error:null}).then(ok,bad);}
 if(pendingList&&table==='conversations')return pendingList.then(ok,bad);
 if(pending&&table==='messages'&&id==='x')return pending.then(ok,bad);
 return Promise.resolve({data:table==='companions'?companion:table==='conversations'?[...conversations]:table==='messages'?[message(id)]:[],error:null}).then(ok,bad);
 }};return q}};
const native=new Proxy({Platform:{OS:'native'},StyleSheet:{create:x=>x},Keyboard:{dismiss(){}},AppState:{addEventListener:()=>({remove(){}})},useWindowDimensions:()=>({width:390,height:844})},{get:(o,k)=>o[k]||k});
const generic=new Proxy({},{get:(_,key)=>key});
const list=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollToEnd(){}}));return React.createElement('Messages',{data:props.data},props.data.map(m=>React.createElement('Text',{key:m.id},m.content)));});
const stubs={'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:24,bottom:0,left:0,right:0})},'@/hooks/useKeyboardVisible':{useKeyboardVisible:()=>false},'lucide-react-native':generic,'expo-router':{useLocalSearchParams:()=>({}),useFocusEffect:cb=>React.useEffect(cb,[cb]),router:{setParams(){},push(){}}},'@/lib/auth':{useAuth:()=>({session:{user:{id:'a'}}})},'@/lib/supabase':{supabase:client},'@/lib/chat-management':compile('lib/chat-management.ts'),'@/lib/chat-cache-storage':{chatCache:cache},'@/lib/chat-read':{chatRead:fn=>fn(new AbortController().signal)},'@/lib/theme':theme,'@/lib/theme-context':{useTheme:()=>({colors:theme.Colors})},'@/hooks/useCompanionState':{useCompanionState:()=>({state:null}),getMoodFromState:()=> 'calm'},'@/components/ConversationList':{ConversationList:list}};
const source=fs.readFileSync('app/(tabs)/index.tsx','utf8');for(const match of source.matchAll(/from ['"](@\/[^'"]+)['"]/g)){if(!stubs[match[1]])stubs[match[1]]=generic;}
const Chat=compile('app/(tabs)/index.tsx',stubs).default;
const current=r=>r.root.findByType('Messages').props.data.map(m=>m.content).join('');
const input=r=>r.root.findByType('TextInput');
const switchTo=async(r,id)=>{await act(async()=>r.root.findAllByType('TouchableOpacity').find(x=>x.props.accessibilityLabel==='Open conversation history').props.onPress());const sidebar=r.root.findByType('FlatList');const row=sidebar.props.renderItem({item:conversations.find(c=>c.id===id)});await act(async()=>row.props.onPress());};
const manager=r=>r.root.findByType('ChatManagement');
const manage=async(r,id)=>{await act(async()=>r.root.findAllByType('TouchableOpacity').find(x=>x.props.accessibilityLabel==='Open conversation history').props.onPress());const row=r.root.findByType('FlatList').props.renderItem({item:conversations.find(c=>c.id===id)});await act(async()=>row.props.onLongPress());};
const change=async(r,value)=>{await act(async()=>manager(r).props.onChange(manager(r).props.chat,value));};
(async()=>{
 let root;await act(async()=>{root=create(React.createElement(Chat))});
 await act(async()=>input(root).props.onChangeText('Keep X draft'));
 await manage(root,'x');await change(root,{title:'  Renamed  '});
 assert.equal(conversations[0].title,'Renamed');assert.equal((await cache.read('a')).conversations[0].title,'Renamed');
 await manage(root,'x');offline=true;await change(root,'delete');assert.equal(conversations.length,2);assert.equal(manager(root).props.error,'Offline');assert.equal((await cache.read('a')).drafts.x,'Keep X draft');offline=false;
 await change(root,{is_active:false});assert.equal(conversations[0].is_active,false);assert.equal((await cache.read('a')).drafts.x,'Keep X draft');assert.equal(current(root),'History y');
 await manage(root,'x');await change(root,{is_active:true});assert.equal(conversations[0].is_active,true);
 let resolveList;const stale=[...conversations];pendingList=new Promise(resolve=>resolveList=resolve);
 await act(async()=>{root.root.findAllByType('TouchableOpacity').find(x=>x.props.accessibilityLabel==='Retry connection')?.props.onPress()});
 // Start a foreground read through the mounted focus callback by remounting.
 await act(async()=>root.unmount());await act(async()=>{root=create(React.createElement(Chat))});
 await manage(root,'x');await change(root,'delete');assert.equal(conversations.length,1);
 await act(async()=>resolveList({data:stale,error:null}));pendingList=null;
 const stored=await cache.read('a');assert.equal(stored.conversations.some(c=>c.id==='x'),false);assert.equal(stored.messages.x,undefined);assert.equal(stored.drafts.x,undefined);
 await act(async()=>root.unmount());offline=true;await act(async()=>{root=create(React.createElement(Chat))});assert.equal(current(root),'History y');
 await act(async()=>root.unmount());
 const Management=compile('components/ChatManagement.tsx',{'react-native':native,'@/lib/theme-context':{useTheme:()=>({colors:theme.Colors})}}).ChatManagement;
 const calls=[];let closed=false;await act(async()=>{root=create(React.createElement(Management,{chat:conversations[0],busy:false,error:null,onClose:()=>{closed=true},onChange:async(chat,change)=>calls.push(change)}))});
 const press=async label=>act(async()=>root.root.findAllByType('TouchableOpacity').find(x=>x.props.accessibilityLabel===label).props.onPress());
 await press('Delete chat…');assert.equal(calls.length,0);await press('Cancel');assert.equal(closed,true);assert.equal(calls.length,0);
 await press('Delete permanently');assert.equal(calls[0],'delete');await act(async()=>root.unmount());
 console.log('PASS: rename, archive/restore, failed delete, delayed listing after delete and offline cache reload.');
})().catch(e=>{console.error(e);process.exitCode=1;});
