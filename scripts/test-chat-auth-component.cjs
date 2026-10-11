// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let platform='web',appCallback,starts=0,stops=0,removed=0;
let callback,cached={companion:{id:'c',owner_user_id:'a'}},resolve,clears=0,activated=null,view;
const session={user:{id:'a',user_metadata:{}}};
const client={auth:{startAutoRefresh:()=>starts++,stopAutoRefresh:()=>stops++,onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session},error:null})},rpc:()=>new Promise(r=>resolve=r)};
const cache={read:async()=>cached,clearAll:async()=>{clears++},activate:id=>activated=id};
const file=require('node:path').resolve('lib/auth.tsx'),mod=new Module(file,module);mod.paths=module.paths;mod.require=name=>name==='react-native'?{Platform:{get OS(){return platform}},AppState:{currentState:'active',addEventListener:(_,fn)=>{appCallback=fn;return {remove:()=>removed++}}}}:name==='./supabase'?{supabase:client}:name==='./chat-cache-storage'?{chatCache:cache}:require(name);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {AuthProvider,useAuth}=mod.exports;function Child(){view=useAuth();return React.createElement('State',{loading:view.loading,error:view.error});}
const element=()=>React.createElement(AuthProvider,null,React.createElement(Child));
(async()=>{let root;await act(async()=>{root=create(element())});assert.equal(view.loading,false,'returning cached owner does not wait for pending RPC');await act(async()=>resolve({error:{message:'Offline'}}));assert.equal(view.error,null);await act(async()=>callback('SIGNED_OUT',null));assert.equal(clears,1);assert.equal(view.session,null);await act(async()=>callback('SIGNED_IN',session));assert.equal(activated,'a');await act(async()=>root.unmount());
 cached=null;await act(async()=>{root=create(element())});assert.equal(view.loading,true,'new account must complete provisioning');await act(async()=>resolve({error:{message:'Offline'}}));assert.equal(view.error,'Offline');await act(async()=>root.unmount());
 platform='android';cached={companion:{id:'c',owner_user_id:'a'}};await act(async()=>{root=create(element())});assert.equal(starts,1);await act(async()=>appCallback('background'));assert.equal(stops,1);await act(async()=>appCallback('active'));assert.equal(starts,2);await act(async()=>root.unmount());assert.equal(removed,1);assert.equal(stops,2);
 console.log('PASS: cached bootstrap without RPC wait, new-account provisioning guard sign-out cleanup and native foreground refresh lifecycle.');})().catch(e=>{console.error(e);process.exitCode=1;});
