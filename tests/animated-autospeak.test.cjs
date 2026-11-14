const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Speaking new replies automatically in Animated Companion mode. Fictional data only.
function load(file,sandbox,require=()=>({})){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require,...sandbox});return mod.exports}
const tick=async(times=6)=>{for(let i=0;i<times;i++)await new Promise(resolve=>setImmediate(resolve))};
const core=()=>load('lib/animated-companion-core.ts',{setTimeout,clearTimeout,DataView,String,Math,JSON,Promise,Set});
const user=(id,content='A fictional question.')=>({id,role:'user',content,conversation_id:'chat'});
const reply=(id,content='A fictional reply.')=>({id,role:'assistant',content,conversation_id:'chat'});
const history=[user('u1'),reply('a1')];
const ids=messages=>messages.map(message=>message.id);

test('the reply to a message the user just sent is spoken, once',()=>{
  const auto=new (core().AutoSpeak)();
  const turn=auto.begin('chat',ids(history));
  const after=[...history,user('u2'),reply('a2')];
  assert.equal(auto.claim(turn,'chat',after,true)?.id,'a2');
  assert.equal(auto.claim(turn,'chat',after,true),null);
  // The same reply is not spoken again by a later turn either, for example after a failed refresh.
  assert.equal(auto.claim(auto.begin('chat',ids(history)),'chat',after,true),null);
});
test('history is never spoken: loading or reloading a conversation starts nothing',()=>{
  const auto=new (core().AutoSpeak)();
  assert.equal(auto.claim(0,'chat',history,true),null);
  assert.equal(auto.claim(1,'chat',history,true),null);
  const turn=auto.begin('chat',ids(history));
  assert.equal(auto.claim(turn,'chat',history,true),null,'the last old reply is not new');
  assert.equal(auto.claim(turn,'chat',[...history,user('u2'),reply('a2')],true),null,'a turn is used up by its first claim');
});
test('nothing is spoken unless the newest message is a reply with text',()=>{
  const C=core().AutoSpeak;
  for(const after of [[...history,user('u2')],[...history,user('u2'),reply('a2','   ')],[]]){
    const auto=new C();assert.equal(auto.claim(auto.begin('chat',ids(history)),'chat',after,true),null);
  }
});
test('with the mode off or the avatar not connected nothing is spoken, then or later',()=>{
  const auto=new (core().AutoSpeak)();
  const turn=auto.begin('chat',ids(history)),after=[...history,user('u2'),reply('a2')];
  assert.equal(auto.claim(turn,'chat',after,false),null);
  assert.equal(auto.claim(turn,'chat',after,true),null);
});
test('sending again, switching conversation or a failed send voids the earlier turn',()=>{
  const C=core().AutoSpeak,after=[...history,user('u2'),reply('a2')];
  let auto=new C();const first=auto.begin('chat',ids(history));const second=auto.begin('chat',ids(history));
  assert.equal(auto.claim(first,'chat',after,true),null);assert.equal(auto.claim(second,'chat',after,true)?.id,'a2');
  auto=new C();let turn=auto.begin('chat',ids(history));auto.moved('other');auto.moved('chat');
  assert.equal(auto.claim(turn,'chat',after,true),null);
  auto=new C();turn=auto.begin('chat',ids(history));auto.cancel();assert.equal(auto.claim(turn,'chat',after,true),null);
  auto=new C();turn=auto.begin('chat',ids(history));assert.equal(auto.claim(turn,'other',after,true),null);
});
test('the first message of a new conversation is answered aloud once the server has named it',()=>{
  const auto=new (core().AutoSpeak)();
  const turn=auto.begin(null,[]);auto.moved('new-chat');
  assert.equal(auto.claim(turn,'new-chat',[user('u1'),reply('a1')],true)?.id,'a1');
});

// Browser autoplay rules.
function element({refuse=null}={}){const log={plays:0};return {log,muted:true,async play(){log.plays++;if(refuse&&!this.muted)throw Object.assign(Error('blocked'),{name:refuse})}}}
test('sound the browser allows is simply unmuted',async()=>{
  const c=core(),video=element();
  assert.equal(await c.setElementAudible(video,true),'ok');assert.equal(video.muted,false);
  assert.equal(await c.setElementAudible(video,false),'ok');assert.equal(video.muted,true);assert.equal(video.log.plays,1);
});
test('refused sound is reported, and the picture keeps moving muted',async()=>{
  const c=core(),video=element({refuse:'NotAllowedError'});
  assert.equal(await c.setElementAudible(video,true),'blocked');
  assert.equal(video.muted,true);assert.equal(video.log.plays,2,'played again muted so the video does not freeze');
  video.play=async function(){this.log.plays++};  // after the user pressed Enable sound
  assert.equal(await c.setElementAudible(video,true),'ok');assert.equal(video.muted,false);
});
test('other playback errors, and speech that already ended, do not ask for Enable sound',async()=>{
  const c=core();
  assert.equal(await c.setElementAudible(element({refuse:'AbortError'}),true),'ok');
  assert.equal(await c.setElementAudible(element({refuse:'NotAllowedError'}),true,()=>false),'ok');
});

// The whole path the screen takes: send, reply arrives, speak it through the existing playReply.
function screen({player,failPlay=false}={}){
  const stats={requests:[],audios:[],ends:0,starts:0,errors:[]};
  class Audio{constructor(){stats.audios.push(this)}async play(){if(failPlay)throw Error('blocked')}pause(){}removeAttribute(){}}
  const sandbox={window:{},MediaRecorder:function(){},Audio,URL:{createObjectURL:()=>'blob:fictional',revokeObjectURL(){}},AbortController,setTimeout,clearTimeout,Promise,JSON,Error,TypeError,
    process:{env:{EXPO_PUBLIC_LUMEN_API_URL:'https://synthetic.invalid'}},
    fetch:async(url,options)=>{stats.requests.push({url,body:JSON.parse(options.body)});return {ok:true,blob:async()=>({wav:stats.requests.length})}}};
  const voice=load('lib/voice.ts',sandbox,name=>name==='./auth'?{authHeaders:async()=>({Authorization:'Bearer synthetic'})}:{});
  const auto=new (core().AutoSpeak)();let playback=null,messages=[...history],blocked=false;
  return {stats,voice,get blocked(){return blocked},
    // sendMessage in app/(tabs)/index.tsx: abort what is playing, begin the turn, load the reply, claim, play.
    async send(next,{ready=true}={}){
      playback?.abort();const turn=auto.begin('chat',ids(messages));
      messages=[...messages,user('u'+messages.length),next];
      const message=auto.claim(turn,'chat',messages,ready);if(!message)return null;
      playback=new AbortController();
      try{return await voice.playReply(message.content,playback.signal,()=>stats.ends++,{companionId:'companion',player:ready?player:undefined,onStart:()=>stats.starts++,onError:error=>stats.errors.push(error.message)})}
      catch(error){if(error.message===voice.SOUND_BLOCKED_MESSAGE)blocked=true;else throw error;return null}},
    reload(){return auto.claim(0,'chat',messages,true)},stopAudio(){playback?.abort()}};
}
function avatar(){const handles=[];return {handles,player:async blob=>{let finish;const handle={blob,released:0,ended:new Promise(resolve=>{finish=resolve}),release(){handle.released++;finish()},finish:()=>finish()};handles.push(handle);return handle}}}

test('a new reply is spoken through the avatar with one speech request and no browser audio',async()=>{
  const a=avatar(),s=screen({player:a.player});
  await s.send(reply('a2'));
  assert.equal(s.stats.requests.length,1);assert.ok(s.stats.requests[0].url.endsWith('/v0.1/voice/speak'));
  assert.equal(a.handles.length,1);assert.equal(s.stats.audios.length,0);assert.equal(s.stats.starts,1);
  assert.equal(s.reload(),null);a.handles[0].finish();await tick();
  assert.equal(s.stats.ends,1);assert.equal(s.stats.requests.length,1,'finishing or reloading requests nothing more');
});
test('Stop audio interrupts automatic speech once and nothing more is requested',async()=>{
  const a=avatar(),s=screen({player:a.player});
  await s.send(reply('a2','a'.repeat(550)));s.stopAudio();s.stopAudio();await tick();
  assert.equal(a.handles[0].released,1);assert.equal(s.stats.ends,1);assert.equal(s.stats.requests.length,1);assert.equal(s.stats.audios.length,0);
});
test('sending the next message interrupts the reply being spoken and speaks only the new one',async()=>{
  const a=avatar(),s=screen({player:a.player});
  await s.send(reply('a2'));await s.send(reply('a3','Another fictional reply.'));await tick();
  assert.equal(a.handles[0].released,1);assert.equal(a.handles.length,2);assert.equal(a.handles[1].released,0);
  assert.deepEqual(s.stats.requests.map(request=>request.body.text),['A fictional reply.','Another fictional reply.']);
});
test('fallback: if the avatar cannot speak, the same audio plays in the browser once',async()=>{
  for(const player of [async()=>null,async()=>{throw Error('avatar down')}]){
    const s=screen({player});await s.send(reply('a2'));
    assert.equal(s.stats.requests.length,1);assert.equal(s.stats.audios.length,1);assert.equal(s.stats.starts,1);assert.equal(s.blocked,false);
  }
});
test('with the avatar unavailable nothing plays by itself; Play reply stays manual',async()=>{
  const a=avatar(),s=screen({player:a.player});
  assert.equal(await s.send(reply('a2'),{ready:false}),null);
  assert.equal(s.stats.requests.length,0);assert.equal(a.handles.length,0);assert.equal(s.stats.audios.length,0);
});
test('fallback audio the browser refuses asks for Enable sound instead of failing silently',async()=>{
  const s=screen({player:async()=>null,failPlay:true});await s.send(reply('a2'));
  assert.equal(s.blocked,true);assert.equal(s.stats.ends,1);assert.equal(s.stats.requests.length,1);
});

test('the chat screen is wired the same way',()=>{
  const source=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(source,/const speakTurn = autoSpeak\.begin\(activeConversation\?\.id \?\? null, messages\.map/);
  assert.match(source,/autoSpeak\.claim\(speakTurn, response\.conversation_id, loaded \?\? \[\], animated\.state === 'ready'\)/);
  assert.equal((source.match(/autoSpeak\.begin\(/g)||[]).length,1,'only sending a message can lead to automatic speech');
  assert.equal((source.match(/startPlayback\(pendingSpeak, true\)/g)||[]).length,1);
  assert.equal((source.match(/playReply\(/g)||[]).length,1,'manual and automatic playback share one playReply call');
  assert.match(source,/autoSpeak\.moved\(activeConversation\?\.id \?\? null\)/);
  assert.match(source,/accessibilityLabel="Enable sound"/);assert.match(source,/soundBlocked && </);
  assert.match(source,/playingId === item\.id \? 'Stop audio' : 'Play reply'/);
  const session=fs.readFileSync('lib/animated-companion.ts','utf8');
  assert.match(session,/enableSound\(\)/);assert.doesNotMatch(session,/getUserMedia|voice\/speak|respond/);
});
