const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Fictional data only. No timer waits on real time.
function load(file,sandbox={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>({}),setTimeout,clearTimeout,DataView,String,Math,JSON,Promise,Array,...sandbox});return mod.exports}
const core=load('lib/animated-companion-core.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
const SERVER={switchable:true,active:'original',switching:null,last_error:null,scenes:[
  {id:'original',label:'Original',status:'ready'},{id:'midnight-sanctuary',label:'Midnight Sanctuary',status:'unavailable'},{id:'rose-garden',label:'Rose Garden',status:'ready'}]};

test('the scene list keeps only what the server states, and drops anything unexpected',()=>{
  const list=core.sceneList({...SERVER,scenes:[...SERVER.scenes,{id:'../x',label:'x',status:'ready'},{id:'late',label:'Late',status:'live'},{id:'original',label:'Twice',status:'ready'},null,{id:'long',label:'x'.repeat(41),status:'ready'}],path:'/data/x'});
  assert.deepEqual(plain(list),{switchable:true,active:'original',switching:null,scenes:SERVER.scenes,failed:null});
  for(const bad of [null,{},{scenes:'x'},{...SERVER,active:'gone'},{...SERVER,scenes:[]}])assert.equal(core.sceneList(bad),null);
  assert.equal(core.sceneList({...SERVER,switchable:'yes'}).switchable,false);
  assert.equal(core.sceneList({...SERVER,last_error:{code:'scene_failed_to_start',scene:'rose-garden'}}).failed,'rose-garden');
  assert.equal(core.sceneList({...SERVER,last_error:{scene:'unknown'}}).failed,null);
});

test('only a ready scene that is not showing can be chosen, and never while Lumen is busy',()=>{
  const list=core.sceneList(SERVER),[original,midnight,rose]=list.scenes;
  assert.equal(core.sceneBlocked(list,original,false,false),'showing now');
  assert.equal(core.sceneBlocked(list,midnight,false,false),'not ready yet');
  assert.equal(core.sceneBlocked(list,{...midnight,status:'not_approved'},false,false),'awaiting approval');
  assert.equal(core.sceneBlocked(list,rose,false,false),null);
  assert.match(core.sceneBlocked(list,rose,true,false),/finished speaking/);
  assert.match(core.sceneBlocked(list,rose,false,true),/under way/);
  assert.match(core.sceneBlocked({...list,switching:'rose-garden'},rose,false,false),/under way/);
  assert.equal(core.sceneBlocked({...list,switchable:false},rose,false,false),'not available');
  // Original stays selectable from another scene
  assert.equal(core.sceneBlocked({...list,active:'rose-garden'},original,false,false),null);
});

const waiter=answers=>{const slept=[];let reads=0;return {slept,reads:()=>reads,read:async()=>{const next=answers[Math.min(reads++,answers.length-1)];if(next instanceof Error)throw next;return next},sleep:async ms=>{slept.push(ms)}}};
const on=(active,switching=null)=>core.sceneList({...SERVER,active,switching});

test('after a change the app waits for the service to return and reports the scene really serving',async()=>{
  let w=waiter([on('original','rose-garden'),null,Error('down'),null,on('rose-garden')]);
  assert.equal((await core.awaitScene(w.read,w.sleep)).active,'rose-garden');assert.equal(w.reads(),5);
  assert.ok(w.slept.every(ms=>ms===core.SCENE_POLL_MS));
  // The new scene could not load: the service is back with Original, and that is what is reported.
  w=waiter([null,null,on('original')]);
  assert.equal((await core.awaitScene(w.read,w.sleep)).active,'original');
});

test('a service that is still up is not mistaken for one that has restarted',async()=>{
  const w=waiter([on('original')]);
  const done=await core.awaitScene(w.read,w.sleep);
  assert.equal(done.active,'original');assert.equal(w.reads(),5);   // waited, rather than believing the first answer
});

test('the wait ends by itself when the service does not come back, or the screen is left',async()=>{
  let w=waiter([null]);
  assert.equal(await core.awaitScene(w.read,w.sleep),null);
  assert.equal(w.slept.length,core.SCENE_WAIT_MS/core.SCENE_POLL_MS);
  w=waiter([on('original','rose-garden')]);
  assert.equal(await core.awaitScene(w.read,w.sleep),null);            // never finished switching
  let wanted=true;w=waiter([null]);const sleep=async()=>{wanted=false};
  assert.equal(await core.awaitScene(w.read,sleep,()=>wanted),null);assert.equal(w.reads(),1);
});
