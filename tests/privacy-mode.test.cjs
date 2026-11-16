const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Public / Private mode (Issue #39), client side. No device, browser or server is used.
// The backend enforcement and leak tests are in backend/tests/test_privacy_mode.py.
const read=file=>fs.readFileSync(file,'utf8');
const js=file=>ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load({stored,throws=false,embedded=false}={}){
  const mod={exports:{}},posted=[],saved=new Map(stored===undefined?[]:[['lumen.privacyMode.v1',stored]]),listeners={};
  const storage={getItem:async key=>{if(throws)throw new Error('no storage');return saved.get(key)??null;},setItem:async(key,value)=>{saved.set(key,value);}};
  const window={addEventListener:(t,f)=>{listeners[t]=f;},removeEventListener:t=>{delete listeners[t];}};
  const req=name=>name==='react'?{useSyncExternalStore:(_,get)=>get(),useEffect:()=>{}}
    :name==='./live-room'?{postRoomEvent:event=>{if(embedded)posted.push(event);}}
    :name.includes('async-storage')?{default:storage}:{};
  vm.runInNewContext(js('lib/privacy-mode.ts'),{module:mod,exports:mod.exports,require:req,window,Date,Number,Promise,Set,Object});
  mod.exports.resetPrivacyModeForTests(storage);
  return {...mod.exports,saved,posted,listeners};
}

test('only the two fixed words are modes; anything else is not',()=>{
  const {parsePrivacyMode}=load();
  assert.equal(parsePrivacyMode('private'),'private');assert.equal(parsePrivacyMode('public'),'public');
  for(const value of ['PUBLIC','Private','company','',null,undefined,1,{}])assert.equal(parsePrivacyMode(value),null,String(value));
});

test('fail closed: Public until the remembered choice is read; nothing remembered means Private',async()=>{
  const fresh=load();
  assert.deepEqual({...fresh.getPrivacySnapshot()},{mode:'public',loaded:false,restored:false});
  assert.equal(await fresh.loadPrivacyMode(),'private');
  assert.deepEqual({...fresh.getPrivacySnapshot()},{mode:'private',loaded:true,restored:false});
});

test('a reload in Public stays Public and says so; Private stays Private',async()=>{
  const pub=load({stored:'public'});assert.equal(await pub.loadPrivacyMode(),'public');assert.equal(pub.getPrivacySnapshot().restored,true);
  const priv=load({stored:'private'});assert.equal(await priv.loadPrivacyMode(),'private');assert.equal(priv.getPrivacySnapshot().restored,false);
});

test('unreadable or unknown storage stays Public until the person chooses',async()=>{
  assert.equal(await load({stored:'company'}).loadPrivacyMode(),'public');
  assert.equal(await load({throws:true}).loadPrivacyMode(),'public');
});

test('a choice takes effect at once, is remembered on this device, and wins over a slow read',async()=>{
  const m=load({stored:'private'});
  const pending=m.loadPrivacyMode();m.setPrivacyMode('public');
  assert.equal(await pending,'public');assert.equal(m.saved.get('lumen.privacyMode.v1'),'public');
  m.setPrivacyMode('private');assert.equal(m.getPrivacyMode(),'private');assert.equal(m.saved.get('lumen.privacyMode.v1'),'private');
  m.setPrivacyMode('nonsense');assert.equal(m.getPrivacyMode(),'private');
});

test('only a tap is passed to the phone app; a page load or the app\'s own line never is',()=>{
  const m=load({embedded:true});
  m.setPrivacyMode('public');assert.deepEqual(m.posted,[]);
  m.choosePrivacyMode('private');m.choosePrivacyMode('public');assert.deepEqual(m.posted,['private','public']);
});

test('the phone app tells the room its choice in one of two fixed lines with no data',()=>{
  const m=load();
  assert.equal(m.privacyScript('public'),"window.dispatchEvent(new Event('lumenroompublic'));true;");
  assert.equal(m.privacyScript('private'),"window.dispatchEvent(new Event('lumenroomprivate'));true;");
  const stop=m.listenForAppPrivacy();
  m.listeners.lumenroompublic();assert.equal(m.getPrivacyMode(),'public');
  m.listeners.lumenroomprivate();assert.equal(m.getPrivacyMode(),'private');
  stop();assert.deepEqual(Object.keys(m.listeners),[]);
  const screen=read('app/live-video.tsx');
  assert.match(screen,/else if \(word === 'private' \|\| word === 'public'\) setPrivacyMode\(word\);/);
  assert.match(screen,/loadPrivacyMode\(\)\.then\(mode => view\.current\?\.injectJavaScript\(privacyScript\(mode\)\)\)/);
});

test('in Public only messages written in Public are shown, and chat names are neutral',()=>{
  const {messageVisible,conversationLabel}=load();
  const priv={metadata:{}},legacy={},pub={metadata:{privacy_mode:'public'}},spoof={metadata:{privacy_mode:'PUBLIC'}};
  for(const m of [priv,legacy,pub,spoof])assert.equal(messageVisible('private',m),true);
  assert.equal(messageVisible('public',priv),false);assert.equal(messageVisible('public',legacy),false);
  assert.equal(messageVisible('public',spoof),false);assert.equal(messageVisible('public',pub),true);
  assert.equal(conversationLabel('private','Sam birthday surprise','2026-11-15T10:00:00Z'),'Sam birthday surprise');
  assert.doesNotMatch(conversationLabel('public','Sam birthday surprise','2026-11-15T10:00:00Z'),/Sam|birthday|surprise/);
  assert.equal(conversationLabel('public','Sam birthday surprise',null),'Chat');
});

test('every chat, image and voice request carries the mode as a fixed word, never in an address',()=>{
  const cognition=read('lib/cognition.ts');
  assert.match(cognition,/request_id: turnKey \|\| requestKey\(\), privacy_mode: privacyMode \}\)/);
  assert.match(cognition,/privacy_mode: privacyMode,\n\s+\}\),/);
  const screen=read('app/(tabs)/index.tsx');
  assert.match(screen,/const sentMode = getPrivacyMode\(\);/);
  assert.equal((screen.match(/sentMode,\n\s+\);/g)||[]).length,2);   // respondToMessage and generateImage use the mode the turn was sent in
  assert.match(screen,/privacy: \{ mode: getPrivacyMode\(\), messageId: message\.id \}/);
  assert.match(read('lib/voice.ts'),/\.\.\.speechPrivacy\(options\.privacy\)/);
  assert.match(read('lib/reply-audio.native.ts'),/\.\.\.speechPrivacy\(options\.privacy\)/);
  for(const file of ['lib/privacy-mode.ts','lib/live-room.ts','lib/live-video-web.ts'])assert.doesNotMatch(read(file),/[?&]privacy=/);
});

test('Private voice requests are unchanged; Public ones name the reply to be spoken',()=>{
  const src=read('lib/voice.ts');
  const body=src.slice(src.indexOf('export type SpeechPrivacy'),src.indexOf('export const SOUND_BLOCKED_MESSAGE'));
  const mod={exports:{}};vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
  const {speechPrivacy}=mod.exports;
  assert.deepEqual({...speechPrivacy()},{});assert.deepEqual({...speechPrivacy({mode:'private',messageId:'m'})},{});
  assert.deepEqual({...speechPrivacy({mode:'public',messageId:'m1'})},{privacy_mode:'public',message_id:'m1'});
  assert.deepEqual({...speechPrivacy({mode:'public'})},{privacy_mode:'public'});
});

test('the switch is in Chat, Video Chat and Theater, and flipping it never touches the video session',()=>{
  const screen=read('app/(tabs)/index.tsx');
  assert.match(screen,/\{!theater && !\(room && animatedState === 'ready'\) && <PrivacyBar c=\{colors\} \/>\}/);   // ordinary Chat, and Video Chat without video
  assert.match(screen,/privacy=\{animatedState === 'ready' && roomPrivacyInRow \? <PrivacyToggle c=\{colors\} \/> : undefined\} \/>\}/);   // Video Chat with video: in the button row
  assert.match(screen,/\{room && !theater && !roomPrivacyInRow && <View pointerEvents="box-none" style=\{\{ position: 'absolute', bottom: 10, left: 10 \}\}><PrivacyToggle c=\{colors\} overlay \/><\/View>\}/);   // short windows: lower corner
  assert.doesNotMatch(screen,/position: 'absolute', top: 10, left: 10 \}\}><PrivacyToggle/);   // never over the face
  assert.match(screen,/privacy=\{<PrivacyToggle c=\{colors\} overlay \/>\} \/>\}/);        // Theater's controls
  assert.match(read('components/LiveRoom.tsx'),/\{privacy\}\n\s+\{control\(messagesOpen/);
  const toggle=read('components/PrivacyToggle.tsx').replace(/^\s*\/\/.*$/gm,'');   // code only, not comments
  assert.match(toggle,/🔒 Private/);assert.match(toggle,/👥 Public/);
  assert.doesNotMatch(toggle,/animated|AnimatedCompanion|connect|close\(|reload/i);
  // Public stops audible speech at once; nothing else changes with the mode.
  assert.match(screen,/if \(privacy\.mode === 'public'\) \{ playbackRef\.current\?\.abort\(\); autoSpeak\.cancel\(\); \}/);
  assert.doesNotMatch(screen,/privacy\.mode[^\n]*animated\.(close|connect)/);
});

test('a Private reply is hidden the moment the switch says Public, and later text is dropped',()=>{
  const {turnHidden}=load();
  assert.equal(turnHidden('public','private'),true);assert.equal(turnHidden('public',null),true);
  assert.equal(turnHidden('public','public'),false);assert.equal(turnHidden('private','private'),false);assert.equal(turnHidden('private','public'),false);
  const screen=read('app/(tabs)/index.tsx');
  assert.match(screen,/if \(turnHidden\(getPrivacyMode\(\), sentMode\)\) return;\n\s+if \(event\.type === 'delta'\)/);   // checked per streamed line, before it is kept
  assert.match(screen,/ListFooterComponent=\{sending && hideTurn \?/);                                                      // pending question, activity and partial reply
  assert.match(screen,/getPrivacyMode\(\) === sentMode \? autoSpeak\.claim/);                                              // no auto-speech across a switch
  assert.match(screen,/activeConversation\?\.handoff && !theater && privacy\.mode === 'private' && <HandoffCard/);
  assert.match(screen,/privacy\.mode === 'private' && memoryQuestions\.map/);
  assert.match(screen,/memoryNotice && privacy\.mode === 'private' &&/);
  assert.match(screen,/privacy\.mode === 'private' \? `Using document: \$\{pendingDocument\.title\}`/);
});

test('the browser check follows the protected updater\'s file naming, which is not widened',()=>{
  assert.ok(fs.existsSync('scripts/test-animated-privacy-mode-browser.cjs'));
  assert.ok(!fs.existsSync('scripts/test-privacy-mode-browser.cjs'));
  const updater=read('scripts/animated-web-update.sh');
  const rule=updater.match(/^FRONTEND_ONLY='(.+)'$/m)[1];
  assert.equal(rule,"^(app/|components/|lib/|hooks/|types/|tests/|docs/|scripts/(test-)?(animated[-_][A-Za-z0-9_.-]+|android-refresh\\.sh)$)");
  assert.match('scripts/test-animated-privacy-mode-browser.cjs',new RegExp(rule));
});

test('the message box keeps one draft per mode, and a failed turn goes back only to its own mode',()=>{
  const {swapComposer,returnFailedTurn,emptyComposer}=load();
  const priv={text:'Juniper Hall deposit',images:['photo'],document:{id:'d'}};
  let slots={private:emptyComposer(),public:emptyComposer()};
  let step=swapComposer(slots,'private','public',priv);                     // flip to Public with a Private draft
  assert.deepEqual({...step.show,images:[...step.show.images]},{text:'',images:[],document:null});
  assert.deepEqual(step.slots.private,priv);                                   // parked, not erased
  step=swapComposer(step.slots,'public','private',{text:'weather',images:[],document:null});
  assert.deepEqual(step.show,priv);assert.equal(step.slots.public.text,'weather');
  assert.equal(swapComposer(step.slots,'private','private',priv).show,priv);
  // Sent in Private, failed after the switch to Public: nothing is shown, the question is parked for Private.
  const failed={text:'Did the deposit clear?',images:['p2'],document:null};
  let back=returnFailedTurn({private:emptyComposer(),public:{text:'pub',images:[],document:null}},'private','public',failed);
  assert.equal(back.show,null);assert.equal(back.slots.private.text,'Did the deposit clear?');assert.deepEqual([...back.slots.private.images],['p2']);
  assert.equal(back.slots.public.text,'pub');
  back=returnFailedTurn({private:{text:'later words',images:[],document:null},public:emptyComposer()},'private','public',failed);
  assert.equal(back.slots.private.text,'Did the deposit clear?\nlater words');   // merged, nothing lost
  assert.equal(returnFailedTurn(slots,'private','private',failed).show,failed);    // same mode: as before
  const screen=read('app/(tabs)/index.tsx');
  assert.match(screen,/if \(snapshot && getPrivacyMode\(\) === 'private'\) \{/);          // a Public draft never overwrites the saved Private one
  assert.match(screen,/const back = returnFailedTurn</);assert.doesNotMatch(screen,/setInputText\(text\);\n\s+setPendingImages\(images\);/);
  assert.match(screen,/if \(getPrivacyMode\(\) === 'public'\) \{\n\s+composerSlots\.current = \{ \.\.\.composerSlots\.current, private:/);   // opening a chat in Public parks its saved draft
});
