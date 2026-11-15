// The scene control shows what the server says, asks before a change, and reports what is really serving.
// Optional test-only dependency: react-test-renderer@19.1.0. Fictional data only.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
const core=compile('lib/animated-companion-core.ts');
const list=(active='original',extra={})=>core.sceneList({switchable:true,active,switching:null,last_error:null,scenes:[
  {id:'original',label:'Original',status:'ready'},{id:'midnight-sanctuary',label:'Midnight Sanctuary',status:'unavailable'},{id:'rose-garden',label:'Rose Garden',status:'ready'}],...extra});
// Stand-ins for the server: `served` is what the scene route answers, `refusal` what a change request answers.
let served=list(),refusal=null,afterChange=()=>list('rose-garden');const asked=[];
const api={animatedScenes:async()=>served,chooseAnimatedScene:async(companion,scene)=>{asked.push([companion,scene]);if(!refusal)served=afterChange();return refusal}};
// The wait is replaced by one immediate read, so nothing waits on real time.
const {AnimatedScenes}=compile('components/AnimatedScenes.tsx',{'react-native':{Platform:{OS:'web'},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'},
  '@/lib/animated-companion':api,'@/lib/animated-companion-core':{...core,awaitScene:async read=>read()}});
const calls=[];const session={close:()=>calls.push('close'),connect:async id=>{calls.push(`connect ${id}`);return true}};
const notes=[];
const render=(props={})=>create(React.createElement(AnimatedScenes,{session,companionId:'c1',shown:true,busy:false,color:'#222',onNote:note=>notes.push(note),...props}));
const settle=async()=>{await act(async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));});};
const radios=root=>root.root.findAllByType('TouchableOpacity').filter(item=>item.props.accessibilityRole==='radio');
const radio=(root,label)=>radios(root).find(item=>item.props.accessibilityLabel.startsWith(`Scene ${label}`));
const button=(root,label)=>root.root.findAllByType('TouchableOpacity').find(item=>item.props.accessibilityLabel===label);
const text=root=>JSON.stringify(root.toJSON());
(async()=>{
  let root;await act(async()=>{root=render();});await settle();
  // What the server lists, in its order; Original is showing; the unprepared scene is there but cannot be pressed.
  assert.deepEqual(radios(root).map(item=>item.props.accessibilityLabel),['Scene Original, showing now','Scene Midnight Sanctuary, not ready yet','Scene Rose Garden']);
  assert.deepEqual(radios(root).map(item=>item.props.disabled),[true,true,false]);
  assert.equal(radio(root,'Original').props.accessibilityState.checked,true);
  assert.match(text(root),/Midnight Sanctuary.*\(not ready yet\)/);

  // Choosing asks first; Cancel changes nothing.
  await act(async()=>radio(root,'Rose Garden').props.onPress());
  assert.match(text(root),/restarts and is away for about a minute/);assert.deepEqual(asked,[]);
  await act(async()=>button(root,'Keep the current scene').props.onPress());
  assert.equal(button(root,'Change scene to Rose Garden'),undefined);assert.deepEqual([asked,calls],[[],[]]);

  // A refusal (GPU busy) leaves the session alone and says why.
  refusal='A video is being generated on the GPU. The scene was not changed; try again when it has finished.';
  await act(async()=>radio(root,'Rose Garden').props.onPress());
  await act(async()=>button(root,'Change scene to Rose Garden').props.onPress());await settle();
  assert.deepEqual(asked,[['c1','rose-garden']]);assert.deepEqual(calls,[]);assert.equal(notes.at(-1),refusal);
  assert.equal(radio(root,'Original').props.accessibilityState.checked,true);

  // Accepted: the session closes, reconnects once the service is back, and the new scene is the one marked.
  refusal=null;
  await act(async()=>radio(root,'Rose Garden').props.onPress());
  await act(async()=>button(root,'Change scene to Rose Garden').props.onPress());await settle();
  assert.deepEqual(calls,['close','connect c1']);
  assert.equal(radio(root,'Rose Garden').props.accessibilityState.checked,true);
  assert.equal(radio(root,'Original').props.disabled,false);                     // Original can always be chosen again
  assert.equal(notes.at(-1),null);

  // The new scene could not load: the service came back with Original, and the screen says so.
  calls.length=0;served=list();afterChange=()=>list('original',{last_error:{code:'scene_failed_to_start',scene:'rose-garden'}});
  await act(async()=>{root.update(React.createElement(AnimatedScenes,{session,companionId:'c1',shown:false,busy:false,color:'#222',onNote:note=>notes.push(note)}));});
  await act(async()=>{root.update(React.createElement(AnimatedScenes,{session,companionId:'c1',shown:true,busy:false,color:'#222',onNote:note=>notes.push(note)}));});await settle();
  await act(async()=>radio(root,'Rose Garden').props.onPress());
  await act(async()=>button(root,'Change scene to Rose Garden').props.onPress());await settle();
  assert.deepEqual(calls,['close','connect c1']);
  assert.equal(notes.at(-1),'Rose Garden could not start. Original is showing again.');
  assert.equal(radio(root,'Original').props.accessibilityState.checked,true);

  // While Lumen is replying or speaking, nothing can be chosen.
  await act(async()=>{root.unmount();root=render({busy:true});});await settle();
  assert.deepEqual(radios(root).map(item=>item.props.disabled),[true,true,true]);
  assert.match(radio(root,'Rose Garden').props.accessibilityLabel,/finished speaking/);

  // Only Original (today's production bridge): no control at all. Mode off: no control either.
  served=core.sceneList({switchable:false,active:'original',switching:null,scenes:[{id:'original',label:'Original',status:'ready'}]});
  await act(async()=>{root.unmount();root=render();});await settle();assert.equal(root.toJSON(),null);
  served=list();await act(async()=>{root.unmount();root=render({shown:false});});await settle();assert.equal(root.toJSON(),null);
  console.log('animated scenes component: all checks passed');
})().catch(error=>{console.error(error);process.exit(1);});
