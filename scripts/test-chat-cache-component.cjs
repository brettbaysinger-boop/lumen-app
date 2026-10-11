// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
const {ChatCache}=compile('lib/chat-cache.ts'),theme=compile('lib/theme.ts');
const values=new Map(),cache=new ChatCache({getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k),getAllKeys:async()=>[...values.keys()]});
let offline=false,pending=null;
const companion={id:'c',owner_user_id:'a',name:'Test',persona:'Friendly'},conversations=[{id:'x',companion_id:'c',title:'First'},{id:'y',companion_id:'c',title:'Second'}];
function message(id){return {id:'m-'+id,conversation_id:id,companion_id:'c',role:'user',content:'History '+id,metadata:{}};}
const client={from:table=>{let id;const q={select:()=>q,eq:(key,value)=>{if(key==='conversation_id')id=value;return q},order:()=>q,limit:()=>q,abortSignal:()=>q,maybeSingle:()=>q,then:(ok,bad)=>{
 if(pending && table==='messages' && id==='x')return pending.then(ok,bad);
 return Promise.resolve(offline?{data:null,error:{message:'Offline'}}:{data:table==='companions'?companion:table==='conversations'?conversations:table==='messages'?[message(id)]:[],error:null}).then(ok,bad);
 }};return q}};
const native=new Proxy({Platform:{OS:'native'},StyleSheet:{create:x=>x},Keyboard:{dismiss(){}},AppState:{addEventListener:()=>({remove(){}})},useWindowDimensions:()=>({width:390,height:844})},{get:(o,k)=>o[k]||k});
const generic=new Proxy({},{get:(_,key)=>key});
const list=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollToEnd(){}}));return React.createElement('Messages',{data:props.data},props.data.map(m=>React.createElement('Text',{key:m.id},m.content)));});
const stubs={'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'lucide-react-native':generic,'expo-router':{useLocalSearchParams:()=>({}),useFocusEffect:cb=>React.useEffect(cb,[cb]),router:{setParams(){},push(){}}},'@/lib/auth':{useAuth:()=>({session:{user:{id:'a'}}})},'@/lib/supabase':{supabase:client},'@/lib/chat-cache-storage':{chatCache:cache},'@/lib/chat-read':{chatRead:fn=>fn(new AbortController().signal)},'@/lib/theme':theme,'@/lib/theme-context':{useTheme:()=>({colors:theme.Colors})},'@/hooks/useCompanionState':{useCompanionState:()=>({state:null}),getMoodFromState:()=> 'calm'},'@/components/ConversationList':{ConversationList:list}};
const source=fs.readFileSync('app/(tabs)/index.tsx','utf8');for(const match of source.matchAll(/from ['"](@\/[^'"]+)['"]/g)){if(!stubs[match[1]])stubs[match[1]]=generic;}
const Chat=compile('app/(tabs)/index.tsx',stubs).default;
const current=r=>r.root.findByType('Messages').props.data.map(m=>m.content).join('');
const input=r=>r.root.findByType('TextInput');
const switchTo=async(r,id)=>{await act(async()=>r.root.findAllByType('TouchableOpacity').find(x=>x.props.accessibilityLabel==='Open conversation history').props.onPress());const sidebar=r.root.findByType('FlatList');const row=sidebar.props.renderItem({item:conversations.find(c=>c.id===id)});await act(async()=>row.props.onPress());};
(async()=>{
 let root;await act(async()=>{root=create(React.createElement(Chat))});assert.equal(current(root),'History x');
 await act(async()=>input(root).props.onChangeText('Draft X'));await switchTo(root,'y');assert.equal(current(root),'History y');assert.equal(input(root).props.value,'');
 await act(async()=>input(root).props.onChangeText('Draft Y'));await switchTo(root,'x');assert.equal(input(root).props.value,'Draft X');
 await act(async()=>root.unmount());offline=true;await act(async()=>{root=create(React.createElement(Chat))});assert.equal(current(root),'History x');assert.equal(input(root).props.value,'Draft X');assert.ok(root.root.findAllByType('TouchableOpacity').some(x=>x.props.accessibilityLabel==='Retry connection'));
 await switchTo(root,'y');assert.equal(current(root),'History y');assert.equal(input(root).props.value,'Draft Y');
 offline=false;let resolve;pending=new Promise(r=>resolve=r);await switchTo(root,'x');await switchTo(root,'y');assert.equal(current(root),'History y');await act(async()=>resolve({data:[{...message('x'),content:'Late X'}],error:null}));assert.equal(current(root),'History y');pending=null;
 await act(async()=>root.unmount());
 console.log('PASS: chat hydration, backend-unavailable reload, per-conversation drafts and stale message response isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
