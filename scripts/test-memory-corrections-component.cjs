// Optional test dependency: react-test-renderer@19.1.0 (same version as React).
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const React=require('react'),{create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
let owner='owner-a',authOwner='owner-a',deferred=null,fail=false,calls=0;
let revision={id:'revision',kind:'correction',before_content:'My favorite color is red',after_content:'My favorite color is blue',undone_at:null};
const client={auth:{getSession:async()=>({data:{session:{user:{id:authOwner}}}})},
 from:()=>({select:()=>({eq:()=>({maybeSingle:()=> deferred || Promise.resolve({data:revision,error:null})})})}),
 rpc:async(name,args)=>{calls++;assert.equal(name,'undo_memory_correction');assert.deepEqual(args,{p_id:'revision'});
  if(fail)return {data:null,error:{message:'changed'}};
  revision={...revision,undone_at:'now'};return {data:revision,error:null};}};
const stubs={'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},
 '@/lib/auth':{useAuth:()=>({session:{user:{id:owner}}})},'@/lib/supabase':{supabase:client},
 '@/lib/theme-context':{useTheme:()=>({colors:{primary:{300:'cyan'},neutral:{300:'white',400:'gray'}}})}};
const file=require('node:path').resolve('components/MemoryCorrectionCard.tsx');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
mod.require=name=>stubs[name]||require(name);mod._compile(compiled,file);
const Card=mod.exports.MemoryCorrectionCard;
const render=()=>React.createElement(Card,{value:{id:'revision'}});
const visible=root=>JSON.stringify(root.toJSON());
const button=(root,label)=>root.root.findAllByType('Pressable').find(b=>b.findAllByType('Text').some(t=>t.props.children===label));
(async()=>{
 let root;await act(async()=>{root=create(render());});assert.match(visible(root),/Memory corrected/);
 await act(async()=>button(root,'View change').props.onPress());assert.match(visible(root),/Incorrect earlier entry/);
 fail=true;await act(async()=>button(root,'Undo').props.onPress());assert.match(visible(root),/Could not undo/);assert.doesNotMatch(visible(root),/Memory correction undone/);
 fail=false;await act(async()=>button(root,'Undo').props.onPress());assert.match(visible(root),/Memory correction undone/);assert.equal(calls,2);
 await act(async()=>root.unmount());await act(async()=>{root=create(render());});assert.match(visible(root),/Memory correction undone/);
 revision={...revision,kind:'change',undone_at:null};await act(async()=>root.unmount());await act(async()=>{root=create(render());});
 assert.match(visible(root),/changed over time/);
 // Session changed before the auth hook rerenders: no RPC under the new account.
 authOwner='owner-b';await act(async()=>button(root,'Undo').props.onPress());assert.equal(calls,2);
 // A delayed old-account fetch cannot replace the new account's screen.
 await act(async()=>root.unmount());let resolve;deferred=new Promise(r=>{resolve=r;});authOwner=owner='owner-a';
 await act(async()=>{root=create(render());});owner=authOwner='owner-b';deferred=null;revision=null;
 await act(async()=>root.update(render()));await act(async()=>resolve({data:{id:'revision',kind:'correction',before_content:'private A',after_content:'private A',undone_at:null},error:null}));
 assert.equal(root.toJSON(),null);await act(async()=>root.unmount());
 console.log('PASS: correction card, failed/confirmed Undo, reload, change label, session switch and stale response isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
