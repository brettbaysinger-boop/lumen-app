// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
const {ChatCache}=compile('lib/chat-cache.ts'),theme=compile('lib/theme.ts');
const values=new Map(),cache=new ChatCache({getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k),getAllKeys:async()=>[...values.keys()]});
let companion={id:'c',owner_user_id:'a',name:'Lumen',persona:'Warm',portrait_url:'/lumen-original.jpg',setup_completed_at:null};
let resolveSave,calls=0,route=null,retries=0;
const client={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,abortSignal:()=>q,single:async()=>({data:companion,error:null})};return q},rpc:(_,args)=>{calls++;return new Promise(resolve=>{resolveSave=result=>{if(!result.error){companion={...companion,...args.p_details,setup_completed_at:'2026-10-11'};result={data:companion,error:null};}resolve(result)}})}};
const native=new Proxy({Platform:{OS:'android'}},{get:(o,k)=>o[k]||k});
const stubs={'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-router':{Redirect:'Redirect',useLocalSearchParams:()=>({}),router:{replace:path=>route=path}},'@/lib/auth':{useAuth:()=>({session:{user:{id:'a'}},loading:false,error:null,setupCompanionId:'c',retry:()=>retries++})},'@/lib/theme-context':{useTheme:()=>({colors:theme.Colors})},'@/lib/supabase':{supabase:client},'@/lib/chat-read':{chatRead:fn=>fn(new AbortController().signal)},'@/lib/chat-cache-storage':{chatCache:cache},'@/lib/companion-creation':compile('lib/companion-creation.ts'),'@/lib/portraits':{BUILT_IN_PORTRAITS:[{path:'/lumen-original.jpg',label:'Starter',source:1}],deleteUploadedPortrait:async()=>{},pickAndUploadPortrait:async()=>null},'@/lib/voice':{getVoiceOptions:async()=>({voices:[{id:'af_heart',name:'Heart'}]})},'@/lib/sign-out':{signOutThisBrowser:async()=>{}}};
const Screen=compile('app/companion-setup.tsx',stubs).default;
(async()=>{
 cache.activate('a');await cache.write('a',{companion,conversations:[{id:'x',companion_id:'c'}],messages:{x:[{conversation_id:'x',companion_id:'c',content:'Keep'}]},drafts:{x:'Keep draft'},savedAt:''});
 let root;await act(async()=>{root=create(React.createElement(Screen))});
 const button=label=>root.root.findAllByType('Pressable').find(x=>x.props.accessibilityLabel===label);
 const press=async label=>act(async()=>{button(label).props.onPress()});
 await press('Continue');assert.ok(root.root.findAllByType('Text').some(x=>String(x.props.children).includes('Enter a name')));
 await act(async()=>root.root.findAllByType('TextInput').find(x=>x.props.accessibilityLabel==='Companion name').props.onChangeText('Sol'));
 await press('Continue');await press('Playful & witty');await press('Continue');await press('Continue');await press('Heart');await press('Continue');
 await press('Meet my companion');await press('Meet my companion');assert.equal(calls,1,'duplicate saves are blocked');
 await act(async()=>resolveSave({error:{message:'Offline'}}));assert.equal(route,null);assert.equal((await cache.read('a')).companion.name,'Lumen');
 await press('Meet my companion');await act(async()=>resolveSave({error:null}));
 assert.equal(route,'/');assert.equal(retries,1);const stored=await cache.read('a');assert.equal(stored.companion.name,'Sol');assert.equal(stored.companion.speech_voice,'af_heart');assert.match(stored.companion.persona,/Playful/);assert.equal(stored.drafts.x,'Keep draft');assert.equal(stored.messages.x[0].content,'Keep');
 await act(async()=>root.unmount());console.log('PASS: guided creation, required name, voice/personality selection, failed save, duplicate guard and cache preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
