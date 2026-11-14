const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Fictional data only. Timers are faked so nothing waits on real time.
function clock(){let now=0,id=0;const timers=new Map();return {
  setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id},clearTimeout:handle=>timers.delete(handle),
  advance(ms){now+=ms;for(const [handle,timer] of [...timers])if(timer.at<=now){timers.delete(handle);timer.fn()}},pending:()=>timers.size};}
function load(file,sandbox,require=()=>({})){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require,...sandbox});return mod.exports}
const tick=async(times=6)=>{for(let i=0;i<times;i++)await new Promise(resolve=>setImmediate(resolve))};
function core(time=clock()){return {time,core:load('lib/animated-companion-core.ts',{setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,DataView,String,Math,JSON,Promise})}}
function link({ticket='T'.repeat(43),duration=2000,sendOk=true,uploadFails=false}={}){
  const log={sent:[],audible:[],uploads:0,listeners:0};let onEvent,onClosed;
  return {log,event:name=>onEvent?.(name),drop:()=>onClosed?.(),link:{
    send:message=>{log.sent.push(JSON.parse(message));return sendOk},
    listen:(event,closed)=>{onEvent=event;onClosed=closed;log.listeners++;return()=>{log.listeners--;onEvent=onClosed=undefined}},
    upload:async()=>{log.uploads++;if(uploadFails)throw Error('down');return ticket},
    setAudible:value=>log.audible.push(value),duration:async()=>duration}};
}
const signal=(body,name='ChatSignal')=>JSON.stringify({header:{name},payload:body});
const names=log=>log.sent.map(message=>message.header.name);

test('messages use OpenAvatarChat data-channel names and carry only the ticket',()=>{
  const {core:c}=core();
  const sent=JSON.parse(c.speechTicketMessage('abc'));
  assert.equal(sent.header.name,'SendHumanText');assert.deepEqual(JSON.parse(sent.payload.text),{lumen_speech:'abc'});
  assert.deepEqual(JSON.parse(c.interruptMessage()),{header:{name:'Interrupt'}});
});
test('only client playback signals count as speech begin and end',()=>{
  const {core:c}=core();
  assert.equal(c.playbackEvent(signal({type:'stream_begin',stream_type:'client_playback'})),'begin');
  assert.equal(c.playbackEvent(signal({type:'stream_end',stream_type:'client_playback'})),'end');
  assert.equal(c.playbackEvent(signal({type:'stream_cancel',stream_type:'client_playback'})),'end');
  for(const raw of [signal({type:'stream_begin',stream_type:'avatar_audio'}),signal({type:'stream_begin',stream_type:'client_playback'},'EchoHumanText'),
    signal({type:'interrupt',stream_type:'client_playback'}),'not json','{}',null,42])assert.equal(c.playbackEvent(raw),null);
});
test('wav length is read from the header, including streamed placeholder sizes',()=>{
  const {core:c}=core();
  const wav=(dataSize,bytes=48000)=>{const buffer=new ArrayBuffer(44+bytes),view=new DataView(buffer);
    [...'RIFF'].forEach((ch,i)=>view.setUint8(i,ch.charCodeAt(0)));[...'WAVEfmt '].forEach((ch,i)=>view.setUint8(8+i,ch.charCodeAt(0)));
    view.setUint32(16,16,true);view.setUint32(28,48000,true);[...'data'].forEach((ch,i)=>view.setUint8(36+i,ch.charCodeAt(0)));view.setUint32(40,dataSize,true);return buffer};
  assert.equal(c.wavMilliseconds(wav(48000)),1000);assert.equal(c.wavMilliseconds(wav(0xFFFFFFFF)),1000);
  assert.equal(c.wavMilliseconds(new ArrayBuffer(10)),null);assert.equal(c.wavMilliseconds(new ArrayBuffer(64)),null);
});
test('idle to speech to idle: unmuted only while the avatar speaks, one ticket, ends after the end signal',async()=>{
  const {core:c,time}=core(),f=link();
  const pending=c.playThroughAvatar(f.link,{},new AbortController().signal);await tick();
  assert.deepEqual(names(f.log),['SendHumanText']);assert.deepEqual(f.log.audible,[]);
  f.event('begin');const playback=await pending;assert.ok(playback);assert.deepEqual(f.log.audible,[true]);
  let ended=false;playback.ended.then(()=>{ended=true});
  f.event('end');await tick();assert.equal(ended,false);
  time.advance(c.TAIL_MS);await tick();assert.equal(ended,true);
  assert.deepEqual(f.log.audible,[true,false]);assert.equal(f.log.uploads,1);assert.equal(f.log.listeners,0);
  assert.deepEqual(names(f.log),['SendHumanText']);assert.equal(time.pending(),0);
});
test('interruption stops the avatar, mutes it and ends playback once',async()=>{
  const {core:c,time}=core(),f=link();
  const pending=c.playThroughAvatar(f.link,{},new AbortController().signal);await tick();f.event('begin');const playback=await pending;
  let ends=0;playback.ended.then(()=>ends++);
  playback.release();playback.release();await tick();
  assert.equal(ends,1);assert.deepEqual(names(f.log),['SendHumanText','Interrupt']);assert.deepEqual(f.log.audible,[true,false]);
  f.event('end');time.advance(60000);await tick();assert.equal(ends,1);assert.equal(time.pending(),0);
});
test('when the avatar never starts it is told to stop and stays muted, so the caller can play the audio itself',async()=>{
  const {core:c,time}=core(),f=link();
  const pending=c.playThroughAvatar(f.link,{},new AbortController().signal);await tick();
  time.advance(c.START_TIMEOUT_MS);assert.equal(await pending,null);
  assert.deepEqual(names(f.log),['SendHumanText','Interrupt']);assert.deepEqual(f.log.audible,[false]);
  assert.equal(f.log.listeners,0);assert.equal(time.pending(),0);
});
test('upload failure, closed channel, lost connection and cancellation all fall back without unmuting',async()=>{
  for(const scenario of ['upload','send','drop','abort','aborted']){
    const {core:c,time}=core(),f=link({uploadFails:scenario==='upload',sendOk:scenario!=='send'}),controller=new AbortController();
    if(scenario==='aborted')controller.abort();
    const pending=c.playThroughAvatar(f.link,{},controller.signal);await tick();
    if(scenario==='drop')f.drop();if(scenario==='abort')controller.abort();
    assert.equal(await pending,null,scenario);assert.ok(!f.log.audible.includes(true),scenario);
    assert.equal(f.log.listeners,0,scenario);assert.equal(time.pending(),0,scenario);
    if(scenario==='upload'||scenario==='aborted')assert.deepEqual(f.log.sent,[],scenario);
  }
});
test('a lost connection or a missing end signal still ends playback',async()=>{
  for(const scenario of ['drop','limit']){
    const {core:c,time}=core(),f=link({duration:2000});
    const pending=c.playThroughAvatar(f.link,{},new AbortController().signal);await tick();f.event('begin');const playback=await pending;
    let ended=false;playback.ended.then(()=>{ended=true});
    if(scenario==='drop'){f.drop();time.advance(c.TAIL_MS)}else{time.advance(2000+c.END_GRACE_MS-1);await tick();assert.equal(ended,false);time.advance(1)}
    await tick();assert.equal(ended,true,scenario);assert.deepEqual(f.log.audible,[true,false],scenario);assert.equal(time.pending(),0,scenario);
  }
});

// playReply with the optional player: one speech request per chunk, heard once.
function voice({player,failPlay=false}={}){
  const stats={requests:[],audios:[],ends:0,starts:0,errors:[],revoked:0};
  class Audio{constructor(url){this.url=url;this.paused=false;stats.audios.push(this)}async play(){if(failPlay)throw Error('blocked')}pause(){this.paused=true}removeAttribute(){}}
  const sandbox={window:{},MediaRecorder:function(){},Audio,URL:{createObjectURL:()=>'blob:fictional',revokeObjectURL:()=>stats.revoked++},AbortController,setTimeout,clearTimeout,Promise,JSON,Error,TypeError,
    process:{env:{EXPO_PUBLIC_LUMEN_API_URL:'https://synthetic.invalid'}},
    fetch:async(url,options)=>{stats.requests.push({url,body:JSON.parse(options.body)});return {ok:true,blob:async()=>({wav:stats.requests.length})}}};
  const mod=load('lib/voice.ts',sandbox,name=>name==='./auth'?{authHeaders:async()=>({Authorization:'Bearer synthetic'})}:{});
  const controller=new AbortController();
  return {stats,controller,play:text=>mod.playReply(text,controller.signal,()=>stats.ends++,{companionId:'companion',player,onStart:()=>stats.starts++,onError:error=>stats.errors.push(error.message)})};
}
test('with the avatar speaking, no browser audio is created and each chunk is requested once',async()=>{
  const handles=[];const player=async blob=>{let finish;const handle={blob,released:0,ended:new Promise(resolve=>{finish=resolve}),release(){handle.released++;finish()},finish:()=>finish()};handles.push(handle);return handle};
  const f=voice({player});await f.play('a'.repeat(550));
  assert.equal(f.stats.starts,1);assert.equal(f.stats.requests.length,1);assert.equal(f.stats.audios.length,0);
  handles[0].finish();await tick();assert.equal(f.stats.requests.length,2);assert.equal(handles.length,2);
  handles[1].finish();await tick();assert.equal(f.stats.ends,1);assert.equal(f.stats.audios.length,0);
  assert.ok(f.stats.requests.every(request=>request.url.endsWith('/v0.1/voice/speak')&&request.body.companion_id==='companion'));
  assert.deepEqual(handles.map(handle=>handle.blob.wav),[1,2]);
});
test('when the avatar declines or fails, the same audio plays in the browser with no second request',async()=>{
  for(const player of [async()=>null,async()=>{throw Error('avatar down')}]){
    const f=voice({player});await f.play('A fictional reply.');
    assert.equal(f.stats.requests.length,1);assert.equal(f.stats.audios.length,1);assert.equal(f.stats.starts,1);
    f.stats.audios[0].onended();await tick();assert.equal(f.stats.ends,1);assert.equal(f.stats.requests.length,1);assert.deepEqual(f.stats.errors,[]);
  }
});
test('stopping during avatar speech releases it once and requests nothing further',async()=>{
  const handles=[];const player=async()=>{let finish;const handle={released:0,ended:new Promise(resolve=>{finish=resolve}),release(){handle.released++;finish()}};handles.push(handle);return handle};
  const f=voice({player});const stop=await f.play('a'.repeat(550));
  stop();stop();f.controller.abort();await tick();
  assert.equal(handles[0].released,1);assert.equal(f.stats.ends,1);assert.equal(f.stats.requests.length,1);assert.equal(f.stats.audios.length,0);
});
test('cancelling while the avatar is still starting releases it and plays nothing',async()=>{
  let resolvePlayer;const handle={released:0,ended:new Promise(()=>{}),release(){handle.released++}};
  const f=voice({player:()=>new Promise(resolve=>{resolvePlayer=resolve})});
  const started=f.play('A fictional reply.').catch(error=>error.message);await tick();
  f.controller.abort();resolvePlayer(handle);
  assert.equal(await started,'Playback cancelled.');assert.equal(handle.released,1);assert.equal(f.stats.audios.length,0);assert.equal(f.stats.ends,1);
});
test('without a player, reply audio behaves exactly as before',async()=>{
  const f=voice();await f.play('A fictional reply.');
  assert.equal(f.stats.requests.length,1);assert.equal(f.stats.audios.length,1);
  f.stats.audios[0].onended();await tick();assert.equal(f.stats.ends,1);assert.equal(f.stats.revoked,1);
});
test('the chat screen keeps the portrait and offers the mode only when the server does',()=>{
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(screen,/animatedOffered && <TouchableOpacity/);
  assert.match(screen,/player: animated\.state === 'ready' \? animated\.player : undefined/);
  assert.equal((screen.match(/<CompanionPortrait /g)||[]).length,3);
  const session=fs.readFileSync('lib/animated-companion.ts','utf8');
  assert.doesNotMatch(session,/getUserMedia|voice\/speak|respond/);
  for(const path of session.match(/\/v0\.1\/[a-z/]+/g))assert.match(path,/^\/v0\.1\/avatar\/(status|offer|speech)$/);
});
