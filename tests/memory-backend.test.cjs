const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/memory-backend-core.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:mod,exports:mod.exports,setTimeout,clearTimeout,AbortController,Promise,Error,Object,Array,JSON});
const {probeMemoryBackend,isCurrentSupabase,MemoryBackendTracker,MAX_AGE_MS,backendNotice}=mod.exports;

const ADA='00000000-0000-4000-8000-00000000ada1', BEN='00000000-0000-4000-8000-00000000be11';
const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>{if(body instanceof Error)throw body;return body;}});

function world({account=ADA,base='http://lumen.test',respond=()=>reply(200,{backend:'supabase'})}={}){
  const w={account,clock:1_000_000,calls:[],base};
  w.deps={baseUrl:()=>w.base,now:()=>w.clock,timeoutMs:50,
    session:async()=>w.account?{userId:w.account,token:'fictional-token-'+w.account}:null,
    fetch:async(url,init)=>{w.calls.push({url,auth:init.headers.Authorization});return respond(w,url,init);}};
  return w;
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('only an exact supabase or rmc answer for the same account is accepted',async()=>{
  for(const [respond,kind,reason] of [
    [()=>reply(200,{backend:'supabase'}),'supabase'],
    [()=>reply(200,{backend:'rmc'}),'rmc'],
    [()=>reply(404,{}),'unavailable','http_404'],
    [()=>reply(401,{detail:'x'}),'unavailable','http_401'],
    [()=>reply(500,{backend:'supabase'}),'unavailable','http_500'],
    [()=>reply(503,{}),'unavailable','http_503'],
    [()=>reply(200,new Error('bad json')),'unavailable','invalid_response'],
    [()=>reply(200,{backend:'SUPABASE'}),'unavailable','invalid_response'],
    [()=>reply(200,{backend:'supabase',extra:1}),'unavailable','invalid_response'],
    [()=>reply(200,[{backend:'supabase'}]),'unavailable','invalid_response'],
    [()=>reply(200,null),'unavailable','invalid_response'],
    [()=>{throw new TypeError('Network request failed');},'unavailable','network'],
    [()=>new Promise(()=>{}),'unavailable','network'],
  ]){
    const state=await probeMemoryBackend(world({respond}).deps,ADA);
    assert.equal(state.kind,kind,JSON.stringify({kind,reason}));
    if(reason)assert.equal(state.reason,reason);
  }
});

test('missing configuration, signed-out and mismatched sessions never reach the server',async()=>{
  const noBase=world({base:''});
  assert.equal((await probeMemoryBackend(noBase.deps,ADA)).reason,'not_configured');
  const out=world({account:null});
  assert.equal((await probeMemoryBackend(out.deps,ADA)).reason,'account_changed');
  assert.equal((await probeMemoryBackend(out.deps,null)).reason,'signed_out');
  const other=world({account:BEN});
  assert.equal((await probeMemoryBackend(other.deps,ADA)).reason,'account_changed');
  assert.equal(noBase.calls.length+out.calls.length+other.calls.length,0);
});

test('an account switch during the request discards the answer',async()=>{
  const w=world({respond:(w)=>{w.account=BEN;return reply(200,{backend:'supabase'});}});
  const state=await probeMemoryBackend(w.deps,ADA);
  assert.equal(state.kind,'unavailable');
  assert.equal(state.reason,'account_changed');
});

test('a remembered answer stops authorizing once stale, and never for another account',()=>{
  const state={kind:'supabase',userId:ADA,checkedAt:1000};
  assert.equal(isCurrentSupabase(state,ADA,1000+MAX_AGE_MS),true);
  assert.equal(isCurrentSupabase(state,ADA,1001+MAX_AGE_MS),false);
  assert.equal(isCurrentSupabase(state,BEN,1000),false);
  assert.equal(isCurrentSupabase(state,null,1000),false);
  assert.equal(isCurrentSupabase(state,ADA,999),false); // clock went backwards
  for(const kind of ['rmc','unavailable','checking'])assert.equal(isCurrentSupabase({...state,kind},ADA,1000),false);
});

test('tracker starts closed and stays closed until the server answers',async()=>{
  const gate=deferred();
  const w=world({respond:()=>gate.promise});
  const tracker=new MemoryBackendTracker(w.deps);
  assert.equal(tracker.canEditSupabase(),false);
  const pending=tracker.setActiveUser(ADA);
  assert.equal(tracker.state.kind,'checking');
  assert.equal(tracker.canEditSupabase(),false);
  gate.resolve(reply(200,{backend:'supabase'}));
  await pending;
  assert.equal(tracker.canEditSupabase(),true);
  w.clock+=MAX_AGE_MS+1;
  assert.equal(tracker.canEditSupabase(),false,'stale answer must not allow edits');
});

test('backend switch race: a slow old supabase answer cannot overwrite a newer rmc answer',async()=>{
  const slow=deferred();let n=0;
  const w=world({respond:()=>(++n===1?slow.promise:reply(200,{backend:'rmc'}))});
  const tracker=new MemoryBackendTracker(w.deps);
  const first=tracker.setActiveUser(ADA);
  await tracker.refresh();
  assert.equal(tracker.state.kind,'rmc');
  slow.resolve(reply(200,{backend:'supabase'}));
  await first;
  assert.equal(tracker.state.kind,'rmc');
  assert.equal(tracker.canEditSupabase(),false);
});

test('cross-account: an answer for the previous account is never applied to the new one',async()=>{
  const slow=deferred();
  const w=world({respond:(w,url,init)=>init.headers.Authorization.endsWith(ADA)?slow.promise:reply(200,{backend:'rmc'})});
  const tracker=new MemoryBackendTracker(w.deps);
  const forAda=tracker.setActiveUser(ADA);
  w.account=BEN;
  await tracker.setActiveUser(BEN);
  slow.resolve(reply(200,{backend:'supabase'}));
  await forAda;
  assert.equal(tracker.state.userId,BEN);
  assert.equal(tracker.state.kind,'rmc');
  assert.equal(await tracker.authorizeSupabaseMutation(),false);
  await tracker.setActiveUser(null);
  assert.equal(tracker.state.kind,'unavailable');
  assert.equal(await tracker.authorizeSupabaseMutation(),false);
});

test('every mutation asks the server again; a cached supabase answer is not enough',async()=>{
  let backend='supabase', fail=false;
  const w=world({respond:()=>{if(fail)throw new Error('offline');return reply(200,{backend});}});
  const tracker=new MemoryBackendTracker(w.deps);
  await tracker.setActiveUser(ADA);
  const before=w.calls.length;
  assert.equal(await tracker.authorizeSupabaseMutation(),true);
  assert.equal(w.calls.length,before+1);
  backend='rmc';                     // server switched to RMC since the last check
  assert.equal(tracker.canEditSupabase(),true,'display hint still says supabase');
  assert.equal(await tracker.authorizeSupabaseMutation(),false);
  assert.equal(tracker.state.kind,'rmc');
  backend='supabase'; fail=true;     // reconnecting: network down
  assert.equal(await tracker.authorizeSupabaseMutation(),false);
  assert.equal(tracker.state.kind,'unavailable');
  fail=false;                        // reconnected
  assert.equal(await tracker.authorizeSupabaseMutation(),true);
});

test('a mutation check racing an account switch is refused',async()=>{
  const slow=deferred();
  const w=world({respond:()=>slow.promise});
  const tracker=new MemoryBackendTracker(w.deps);
  await Promise.race([tracker.setActiveUser(ADA),Promise.resolve()]);
  const check=tracker.authorizeSupabaseMutation();
  w.account=BEN;
  void tracker.setActiveUser(BEN);
  slow.resolve(reply(200,{backend:'supabase'}));
  assert.equal(await check,false);
});

test('notices describe RMC, checking and unavailable without implying Supabase',()=>{
  assert.match(backendNotice({kind:'rmc'},'Nova'),/Raialume Memory Core/);
  assert.match(backendNotice({kind:'unavailable'},'Nova'),/could not confirm/);
  assert.match(backendNotice({kind:'checking'},'Nova'),/Checking/);
});

// Static guard: every direct Supabase memory write in the app must be
// preceded, in the same handler, by a fresh backend authorization.
test('every Supabase memory mutation in the app awaits a fresh authorization first',()=>{
  const files=['app/(tabs)/memories.tsx','app/(tabs)/index.tsx','components/MemoryCorrectionCard.tsx'];
  const mutation=/supabase\s*\.(?:from\(\s*'memories'\s*\)\s*\.(?:insert|update|delete|upsert)|rpc\(\s*'(?:review_memory_suggestion\w*|undo_memory_correction|correct_user_memory|propose_memory|auto_save_memory_suggestion)')/g;
  let found=0;
  for(const file of files){
    const text=fs.readFileSync(file,'utf8').replace(/supabase\s*\n\s*\./g,'supabase.');
    for(const match of text.matchAll(mutation)){
      found++;
      const before=text.slice(Math.max(0,match.index-700),match.index);
      assert.match(before,/await authoriz\w*Mutation\(\)/,`${file}: unguarded ${match[0]}`);
    }
  }
  assert.ok(found>=8,`expected all known mutation sites, found ${found}`);
  // Lumen's own backend URL must not be read anywhere else to decide the store.
  const hook=fs.readFileSync('lib/memory-backend.ts','utf8');
  assert.doesNotMatch(hook,/cached|return 'supabase'/);
});
