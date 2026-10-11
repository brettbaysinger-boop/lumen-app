const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function fixture({failAt=0,pendingAt=0,failPlayer=false}={}){
 const stats={requests:[],files:[],players:[],ends:0,starts:0,errors:[]};let background,resolvePending;
 class File {constructor(){this.uri='file://private/'+stats.files.length;this.exists=false;stats.files.push(this)}create(){this.exists=true}write(bytes){assert.ok(bytes.length)}delete(){this.exists=false}}
 const auth={authHeaders:async()=>({Authorization:'Bearer synthetic'})};
 function load(file,require){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require,process:{env:{EXPO_PUBLIC_LUMEN_API_URL:'https://synthetic.invalid'}},AbortController,Uint8Array,setTimeout,clearTimeout,fetch:async(url,options)=>{
   stats.requests.push(JSON.parse(options.body));const number=stats.requests.length;
   if(number===pendingAt)await new Promise(resolve=>{resolvePending=resolve});
   if(number===failAt)return {ok:false,json:async()=>({detail:'Speech unavailable'})};
   return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};
 }});return mod.exports}
 const voice=load('lib/voice.ts',name=>name==='./auth'?auth:{});
 const stubs={'./auth':auth,'./voice':voice,'react-native':{AppState:{addEventListener:(_,callback)=>{background=callback;return {remove(){}}}}},'expo-file-system':{File,Paths:{cache:{}}},'expo-audio':{setAudioModeAsync:async()=>{},createAudioPlayer:()=>{
   if(failPlayer)throw Error('Player failed');
   const player={removed:false,played:false,addListener:(_,callback)=>{player.complete=()=>callback({didJustFinish:true});return {remove(){}}},play(){player.played=true},pause(){},remove(){player.removed=true}};stats.players.push(player);return player;
 }}};
 const client=load('lib/reply-audio.native.ts',name=>stubs[name]);
 const signal=new AbortController();
 return {client,stats,signal,background:()=>background('background'),resolve:()=>resolvePending(),play:text=>client.playReply(text,signal.signal,()=>stats.ends++,{companionId:'companion',onStart:()=>stats.starts++,onError:error=>stats.errors.push(error.message)})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('native replies play all chunks with saved companion voice and remove every file',async()=>{
 const f=fixture();await f.play('a'.repeat(550));assert.equal(f.stats.players.length,1);assert.equal(f.stats.starts,1);
 assert.equal(f.stats.requests[0].companion_id,'companion');assert.equal(f.stats.requests[0].voice,undefined);
 f.stats.players[0].complete();await tick();assert.equal(f.stats.players.length,2);assert.equal(f.stats.files[0].exists,false);
 f.stats.players[1].complete();await tick();assert.equal(f.stats.ends,1);assert.ok(f.stats.files.every(file=>!file.exists));assert.ok(f.stats.players.every(player=>player.removed));
});
test('stop and backgrounding end native reply once and cancel the remaining chunks',async()=>{
 for(const background of [false,true]){const f=fixture();const stop=await f.play('a'.repeat(550));if(background)f.background();else stop();stop();await tick();assert.equal(f.stats.ends,1);assert.equal(f.stats.requests.length,1);assert.equal(f.stats.files[0].exists,false)}
});
test('later synthesis failures surface an error and stop the reply cleanly',async()=>{
 const f=fixture({failAt:2});await f.play('a'.repeat(550));f.stats.players[0].complete();await tick();assert.equal(f.stats.ends,1);assert.equal(f.stats.errors[0],'Speech unavailable');assert.ok(f.stats.files.every(file=>!file.exists));
});
test('a late cancelled synthesis response cannot create audio or start playback',async()=>{
 const f=fixture({pendingAt:1});const promise=f.play('Hello');await tick();f.signal.abort();f.resolve();await assert.rejects(promise,/cancelled/);assert.equal(f.stats.ends,1);assert.equal(f.stats.players.length,0);assert.ok(f.stats.files.every(file=>!file.exists));
});
test('player initialization failure deletes temporary reply audio',async()=>{
 const f=fixture({failPlayer:true});await assert.rejects(f.play('Hello'),/Player failed/);assert.equal(f.stats.ends,1);assert.ok(f.stats.files.every(file=>!file.exists));
});
