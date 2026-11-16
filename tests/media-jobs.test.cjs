const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Local media generation, client side: job polling is Private-only and the Gallery never reads in Public.
const read=file=>fs.readFileSync(file,'utf8');
const js=file=>ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function load(mode){
  const mod={exports:{}},calls=[];
  const req=name=>name==='react'?{useEffect:()=>{},useState:v=>[v,()=>{}]}
    :name==='./auth'?{authHeaders:async()=>({Authorization:'Bearer t'})}
    :name==='./privacy-mode'?{getPrivacyMode:()=>mode}:{};
  const fetch=async(url,opts)=>{calls.push(url);return{ok:true,json:async()=>({id:'j1',status:'running',progress:40})};};
  vm.runInNewContext(js('lib/media-jobs.ts'),{module:mod,exports:mod.exports,require:req,fetch,process:{env:{EXPO_PUBLIC_LUMEN_API_URL:'http://lumen.test/'}},encodeURIComponent,setTimeout,clearTimeout});
  return {...mod.exports,calls};
}

test('job status is read from the backend only in Private mode',async()=>{
  const priv=load('private');
  assert.equal((await priv.fetchMediaJob('j1')).progress,40);
  assert.deepEqual(priv.calls,['http://lumen.test/v0.3/media/jobs/j1?privacy_mode=private']);
  const pub=load('public');
  assert.equal(await pub.fetchMediaJob('j1'),null);
  assert.deepEqual(pub.calls,[]);
});

test('message metadata is read defensively',()=>{
  const {readMediaJob,jobFinished}=load('private');
  assert.equal(readMediaJob(null),null);
  assert.equal(readMediaJob({media_job:{id:5}}),null);
  assert.deepEqual({...readMediaJob({media_job:{id:'a',status:'failed',error:'x'}})},{id:'a',status:'failed',error:'x'});
  assert.ok(jobFinished('completed')&&jobFinished('failed')&&!jobFinished('running'));
});

test('Gallery reads nothing unless Private is on and loaded',()=>{
  const src=read('app/(tabs)/gallery.tsx');
  assert.match(src,/const isPrivate = privacy\.loaded && privacy\.mode === 'private';/);
  assert.match(src,/if \(!companion \|\| !isPrivate\) return;/);
  assert.match(src,/Gallery is hidden in 👥 Public/);
});

test('videos in chat use the existing WebView or a web <video>, no new dependency',()=>{
  const src=read('components/ChatAttachments.tsx');
  assert.match(src,/require\('react-native-webview'\)/);
  assert.match(src,/createElement\('video'/);
  const pkg=JSON.parse(read('package.json'));
  assert.ok(!pkg.dependencies['expo-video']&&!pkg.dependencies['expo-av']);
});

test('the frontend-only updater refuses this change as a whole: backend and migration need their own gates',()=>{
  const rule=new RegExp(read('scripts/animated-web-update.sh').match(/^FRONTEND_ONLY='(.+)'$/m)[1]);
  for(const file of ['backend/lumen/media_jobs.py','backend/lumen/images.py','backend/workflows/biglust-sdxl-v16-api.json',
    'supabase/migrations/20261116100000_media_generation_jobs.sql','scripts/check-framepack-endpoint.py'])
    assert.doesNotMatch(file,rule,file);
  for(const file of ['components/ChatAttachments.tsx','lib/media-jobs.ts','app/(tabs)/gallery.tsx','scripts/test-animated-media-generation-browser.cjs'])
    assert.match(file,rule,file);
});
