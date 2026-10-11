// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let callback,cached={companion:{id:'c',owner_user_id:'a'}},resolve,clears=0,activated=null,view;
const session={user:{id:'a',user_metadata:{}}};
const client={auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session},error:null})},rpc:()=>new Promise(r=>resolve=r)};
const cache={read:async()=>cached,clearAll:async()=>{clears++},activate:id=>activated=id};
const file=require('node:path').resolve('lib/auth.tsx'),mod=new Module(file,module);mod.paths=module.paths;mod.require=name=>name==='./supabase'?{supabase:client}:name==='./chat-cache-storage'?{chatCache:cache}:require(name);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {AuthProvider,useAuth}=mod.exports;function Child(){view=useAuth();return React.createElement('State',{loading:view.loading,error:view.error});}
const element=()=>React.createElement(AuthProvider,null,React.createElement(Child));
(async()=>{let root;await act(async()=>{root=create(element())});assert.equal(view.loading,false,'returning cached owner does not wait for pending RPC');await act(async()=>resolve({error:{message:'Offline'}}));assert.equal(view.error,null);await act(async()=>callback('SIGNED_OUT',null));assert.equal(clears,1);assert.equal(view.session,null);await act(async()=>callback('SIGNED_IN',session));assert.equal(activated,'a');await act(async()=>root.unmount());
 cached=null;await act(async()=>{root=create(element())});assert.equal(view.loading,true,'new account must complete provisioning');await act(async()=>resolve({error:{message:'Offline'}}));assert.equal(view.error,'Offline');await act(async()=>root.unmount());
 console.log('PASS: cached bootstrap without RPC wait, new-account provisioning guard and sign-out cleanup.');})().catch(e=>{console.error(e);process.exitCode=1;});
