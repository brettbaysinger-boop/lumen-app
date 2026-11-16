const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// The Live Room (Video Chat + Companion Theater). No device, browser, avatar service or server is used.
// The rendered layout is checked separately, in a browser, by scripts/test-animated-live-room-browser.cjs.
function load({search='',stored=null,embedded=false,noWindow=false}={}){
  const mod={exports:{}},posted=[],events=[],session=new Map(stored===null?[]:[['lumen.room',stored]]);
  const window=noWindow?undefined:{location:{search},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    dispatchEvent:event=>events.push(event.type),...(embedded?{ReactNativeWebView:{postMessage:data=>posted.push(data)}}:{})};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-room.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:mod,exports:mod.exports,require:()=>({useSyncExternalStore:(_,get)=>get()}),URLSearchParams,JSON,Math,Set,window,Event:class{constructor(type){this.type=type;}}});
  return {...mod.exports,posted,events,session,window};
}
const read=file=>fs.readFileSync(file,'utf8');

test('the room is asked for by one static word in the address, and remembered for the tab',()=>{
  const {roomRequested}=load();
  assert.equal(roomRequested('?room=live',null),true);
  assert.equal(roomRequested('?conversation=abc&room=live',null),true);
  for(const search of ['','?conversation=abc',null,undefined])assert.equal(roomRequested(search,null),false,String(search));
  assert.equal(roomRequested('','live'),true);                                        // after sign-in or Documents, still the room
  for(const search of ['?room=off','?room=','?room=LIVE','?room=live2'])assert.equal(roomRequested(search,'live'),false,search);   // any other value leaves it
  const first=load({search:'?room=live'});assert.equal(first.isLiveRoom(),true);assert.equal(first.session.get('lumen.room'),'live');
  first.window.location.search='';assert.equal(first.isLiveRoom(),true);              // decided once per page load
  assert.equal(load({stored:'live'}).isLiveRoom(),true);
  const left=load({search:'?room=off',stored:'live'});assert.equal(left.isLiveRoom(),false);assert.equal(left.session.has('lumen.room'),false);
  assert.equal(load().isLiveRoom(),false);assert.equal(load({noWindow:true}).isLiveRoom(),false);   // the ordinary website, and the phone app itself
});
test('the address the phone app loads carries the static word and nothing of the sign-in',()=>{
  const web=read('lib/live-video-web.ts');
  assert.match(web,/export function liveRoomWebUrl\(\): string \| null \{\s+const url = liveVideoWebUrl\(\);\s+return url \? `\$\{url\}\?room=live` : null;/);
  assert.match(read('app/live-video.tsx'),/source=\{\{ uri: roomUrl \?\? url \}\}/);
});
test('the video is always the whole 3:2 frame: compact in Video Chat, as large as fits in Theater',()=>{
  const {liveRoomBox}=load();
  for(const [width,height] of [[320,568],[360,660],[390,844],[412,915],[360,343],[320,295],[800,1200],[915,412]]){
    const chat=liveRoomBox('chat',width,height);
    assert.equal(chat.width,chat.height*1.5,`chat ${width}x${height}`);assert.ok(Number.isInteger(chat.width)&&Number.isInteger(chat.height));
    assert.ok(chat.width<=width,`chat never wider than its column at ${width}`);
    assert.ok(chat.height<=Math.max(80,height*0.38),`chat leaves the height to the conversation at ${width}x${height}: ${chat.height}`);
    const theater=liveRoomBox('theater',width,height);
    assert.equal(theater.width,theater.height*1.5,`theater ${width}x${height}`);
    assert.ok(theater.width<=width&&theater.height<=height,`theater fits its space at ${width}x${height}`);
    assert.ok(theater.width>width-3||theater.height>height-2,`theater fills one dimension at ${width}x${height}`);   // letterboxed, not shrunk
  }
  assert.deepEqual({...liveRoomBox('chat',360,660)},{width:360,height:240});          // S22-like width: full width, 36% of the height
  assert.deepEqual({...liveRoomBox('chat',360,343)},{width:195,height:130});          // keyboard open: the video shrinks
  assert.deepEqual({...liveRoomBox('theater',360,700)},{width:360,height:240});       // portrait: letterboxed top and bottom
  assert.deepEqual({...liveRoomBox('theater',780,360)},{width:540,height:360});       // landscape: letterboxed at the sides
  assert.deepEqual({...liveRoomBox('theater',360,0)},{width:0,height:0});
});
test('the page tells the phone app only fixed words, and only inside the phone app',()=>{
  const inside=load({embedded:true});
  for(const word of inside.ROOM_EVENTS)inside.postRoomEvent(word);
  assert.deepEqual(inside.posted.map(data=>JSON.parse(data)),['ready','gone','chat','theater','close','browser','restored','private','public'].map(event=>({lumenRoom:1,event})));
  const browser=load();browser.postRoomEvent('close');assert.equal(browser.roomEmbedded(),false);assert.deepEqual(browser.posted,[]);
  const {readRoomEvent}=load();
  for(const data of inside.posted)assert.ok(readRoomEvent(data));
  for(const data of [null,42,{},'','ready','{"event":"close"}','{"lumenRoom":2,"event":"close"}','{"lumenRoom":1,"event":"open https://evil.invalid"}','{"lumenRoom":1,"event":"__proto__"}','{"lumenRoom":1}',JSON.stringify({lumenRoom:1,event:'close',pad:'x'.repeat(200)})])
    assert.equal(readRoomEvent(data),null,String(data));
});
test('the phone app says one fixed line to the page, with no data in it',()=>{
  const room=load();
  assert.equal(room.ROOM_BACK_SCRIPT,"window.dispatchEvent(new Event('lumenroomback'));true;");
  vm.runInNewContext(room.ROOM_BACK_SCRIPT,{window:room.window,Event:class{constructor(type){this.type=type;}}});assert.deepEqual(room.events,['lumenroomback']);
  const screen=read('app/live-video.tsx');
  assert.deepEqual(screen.match(/injectJavaScript\([^)]*\)/g),['injectJavaScript(ROOM_BACK_SCRIPT)','injectJavaScript(landscape ? ROOM_LANDSCAPE_SCRIPT : ROOM_PORTRAIT_SCRIPT)','injectJavaScript(privacyScript(mode)']);   // the only scripts ever sent after load: fixed lines (privacyScript is one of two, see tests/privacy-mode.test.cjs)
  assert.match(screen,/if \(room !== 'theater'\) return;\s+const back = BackHandler\.addEventListener\('hardwareBackPress'/);   // Back leaves the screen everywhere else, as before
  assert.doesNotMatch(screen,/access_token|Authorization|supabase|session\.(access|refresh|user)/);
});
test('the phone app screen: one header at a time, room words handled narrowly, keyboard kept clear',()=>{
  const screen=read('app/live-video.tsx');
  assert.match(screen,/const showingRoom = !!WebView && active && room !== null;/);
  assert.match(screen,/\{!showingRoom && <View[\s\S]{0,400}‹ Chat[\s\S]{0,300}Browser ↗/);     // its own bar returns whenever the room's header is not there
  assert.match(screen,/onLoadStart=\{\(\) => setRoom\(null\)\}/);                         // a page load (sign-in, an older web build) starts from the bar
  assert.match(screen,/if \(report\) \{ setProbe\(report\); return; \}/);                 // the capability probe is untouched
  assert.match(screen,/word === 'close'\) close\(\);\s+else if \(word === 'browser'\) browser\(\);/);
  assert.match(screen,/<KeyboardAvoidingView behavior="padding" style=\{\{ flex: 1 \}\}><WebView/);
  assert.match(screen,/<SafeAreaView style=\{\{ flex: 1, backgroundColor: c\.neutral\[950\] \}\}>/);   // status bar and system navigation stay clear, in the account's colour
});
test('switching views is layout only: one video element in one place, and nothing connects or closes',()=>{
  const screen=read('app/(tabs)/index.tsx'),companion=read('components/AnimatedCompanion.tsx');
  assert.equal((screen.match(/<AnimatedCompanion /g)||[]).length,1);
  assert.equal((companion.match(/createElement\('video'/g)||[]).length,1);
  assert.match(screen,/room=\{room \? \(theater \? 'theater' : 'chat'\) : undefined\}/);
  assert.equal((screen.match(/animated\.connect\(/g)||[]).length,1);                   // still only the Live switch connects
  assert.equal((screen.match(/animated(Ref\.current\?)?\.close\(\)/g)||[]).length,3);   // as before: switch off, companion change, leaving the screen
  for(const line of screen.split('\n').filter(line=>/setRoomMode\(/.test(line)))assert.doesNotMatch(line,/animated\.(connect|close)|toggleAnimated/,line.trim());
  assert.match(screen,/if \(!room \|\| roomStarted\.current \|\| !animatedOffered/);      // live is turned on once per opening, never again by itself
  assert.match(screen,/testID="conversation-panel" style=\{!theater \? \{ flex: 1, minHeight: 0 \}/);   // the conversation is the same elements in both views
  assert.match(companion,/\{!room && <View style=\{\{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 \}\}>/);   // no size choices in the room
});
test('full screen and sideways: the browser\'s own full screen for the page, and nothing native',()=>{
  const screen=read('app/(tabs)/index.tsx'),native=read('app/live-video.tsx');
  assert.match(screen,/document\.documentElement\.requestFullscreen\(\{ navigationUI: 'hide' \}\)/);   // the whole page: same layout, same <video>, same session
  assert.match(screen,/if \(room && !theater\) leaveFullScreen\(\);/);                    // full screen belongs to Theater
  assert.match(screen,/if \(document\.fullscreenElement\) void document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\); else setRoomMode\('chat'\);/);   // Back: full screen first, then Video Chat
  assert.match(screen,/onFullScreen=\{canFullScreen \? toggleFullScreen : undefined\}/);   // no dead button where the browser cannot
  assert.match(native,/allowsFullscreenVideo/);                                        // already on since PR #20: the web view hides the bars and frees rotation itself
  assert.equal(JSON.parse(read('app.json')).expo.orientation,'portrait');             // the app stays portrait everywhere else
  assert.doesNotMatch(read('package.json'),/expo-screen-orientation|expo-navigation-bar/);   // the repository's dependencies are as they were
});
test('the room has no website tab bar, and nothing that is not built: no Mini, no floating video',()=>{
  const tabs=read('app/(tabs)/_layout.tsx'),chrome=read('components/LiveRoom.tsx');
  assert.match(tabs,/const room = Platform\.OS === 'web' && isLiveRoom\(\);/);
  assert.match(tabs,/tabBar=\{props => room \? null : <LumenNavigation \{\.\.\.props\} \/>\}/);
  assert.match(tabs,/\{!\(room && theater\) && <ReminderInbox \/>\}/);
  assert.doesNotMatch(chrome,/Mini|Floating|floating|PiP/);
  for(const label of ['Live video','Open your documents','Open goals and practice','Switch to Companion Theater','Leave Companion Theater and return to Video Chat','More actions'])assert.ok(chrome.includes(label),label);
  assert.doesNotMatch(read('package.json'),/react-native-webrtc/);
});
test('appearance: the account synchronization reports where it stands, and nothing new carries the theme',()=>{
  const theme=read('lib/theme-context.tsx'),controls=read('components/AppearanceControls.tsx');
  assert.match(theme,/export type AccountAppearanceSync = 'checking' \| 'synced' \| 'pending' \| 'failed';/);
  assert.match(theme,/console\.warn\('Raialume appearance load:', error\.message\);[\s\S]{0,200}report\('failed'\);\s+return;/);   // a read that fails is said, not hidden
  assert.match(theme,/void queue\.flush\(\)\.then\(saved => report\(saved \? 'synced' : 'failed'\)\)/);
  assert.equal((theme.match(/from\('user_appearance_preferences'\)/g)||[]).length,2);   // the same one read and one write as before
  assert.match(controls,/Not saved to your account/);assert.match(controls,/Saved to your account/);
  for(const file of ['app/live-video.tsx','lib/live-room.ts','components/LiveRoom.tsx'])assert.doesNotMatch(read(file),/appearance|schemeId|scheme_id/i,file);   // no second theme path through the web view
});
test('the guarded web updater accepts this change as it stands: its allowlist is not widened',()=>{
  const updater=read('scripts/animated-web-update.sh');
  const pattern=updater.match(/^FRONTEND_ONLY='(.+)'$/m)[1];
  // Unchanged, character for character: the room's files fit the rule instead of the rule being bent.
  assert.equal(pattern,String.raw`^(app/|components/|lib/|hooks/|types/|tests/|docs/|scripts/(test-)?(animated[-_][A-Za-z0-9_.-]+|android-refresh\.sh)$)`);
  const allowed=new RegExp(pattern);
  for(const file of ['app/(tabs)/_layout.tsx','app/(tabs)/index.tsx','app/live-video.tsx','components/AnimatedCompanion.tsx','components/AppearanceControls.tsx','components/LiveRoom.tsx','docs/live-room.md','lib/live-room.ts','lib/live-video-web.ts','lib/theme-context.tsx','scripts/test-animated-size-component.cjs','scripts/test-animated-live-room-browser.cjs','tests/live-room.test.cjs','tests/live-video-web.test.cjs']){
    assert.ok(fs.existsSync(file),file);assert.ok(allowed.test(file),`accepted: ${file}`);}
  // Still refused: the backend, the database, dependencies, native configuration, service scripts, and a browser test under any other name.
  for(const file of ['backend/app.py','supabase/migrations/20261116000000_x.sql','package.json','package-lock.json','app.json','infra/lumen-web.service','scripts/animated-deploy.sh.bak/x','scripts/lumen-rmc.sh','scripts/serve-web.cjs','scripts/test-live-room-browser.cjs','scripts/install-static-web.sh','.env'])
    assert.equal(allowed.test(file),false,`refused: ${file}`);
  assert.equal(fs.existsSync('scripts/test-live-room-browser.cjs'),false);
});

// --- Turning the phone: automatic Theater, with what the app's navigation already has ---
function loadRotation(){
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(read('lib/room-rotation.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>{throw Error('imports nothing');}});
  return mod.exports;
}
test('only the room turns: portrait away from it, held still while typing, Android\'s auto-rotate honoured',()=>{
  const {roomLock,roomImmersive,APP_ORIENTATION}=loadRotation();
  for(const keyboard of [false,true])for(const landscape of [false,true])assert.equal(roomLock(false,keyboard,landscape),'portrait_up');   // sign-in, failure, background
  assert.equal(roomLock(true,false,false),'default');assert.equal(roomLock(true,false,true),'default');   // 'default': Android decides, so rotation lock in quick settings is obeyed
  assert.equal(roomLock(true,true,false),'portrait_up');assert.equal(roomLock(true,true,true),'landscape');   // the keyboard is not turned over mid-word
  assert.equal(roomLock(true,false,true,true),'portrait_up');                          // one moment after the page's own full screen ends
  assert.doesNotMatch(read('lib/room-rotation.ts'),/'all'|sensor/i);                   // never a value that overrides the phone's rotation lock
  assert.equal(roomImmersive(true,true),true);
  for(const [shown,landscape] of [[true,false],[false,true],[false,false]])assert.equal(roomImmersive(shown,landscape),false);   // bars hidden only sideways in the room
  assert.equal(APP_ORIENTATION,'portrait_up');
});
test('rotation is stated per screen by the native stack: no new native module, the app portrait elsewhere',()=>{
  const screen=read('app/live-video.tsx'),root=read('app/_layout.tsx');
  assert.match(root,/<Stack screenOptions=\{\{ headerShown: false, orientation: APP_ORIENTATION \}\}>/);   // every screen states portrait, so none is left free to turn
  assert.match(screen,/<Stack\.Screen options=\{\{ orientation: roomLock\(roomShown, keyboardOpen, landscape, settle\), statusBarHidden: roomImmersive\(roomShown, landscape\), navigationBarHidden: roomImmersive\(roomShown, landscape\) \}\} \/>/);
  assert.match(screen,/const roomShown = active && room !== null && !failed && !\(silent && !probe\) && !\(probe && !probe\.ok\);/);
  assert.match(screen,/if \(roomShown\) view\.current\?\.injectJavaScript\(landscape \? ROOM_LANDSCAPE_SCRIPT : ROOM_PORTRAIT_SCRIPT\)/);
  assert.match(screen,/if \(word === 'restored'\) \{ setSettle\(true\); return; \}/);
  assert.equal(JSON.parse(read('app.json')).expo.orientation,'portrait');
  const packages=read('package.json');
  assert.doesNotMatch(packages,/expo-screen-orientation|expo-navigation-bar/);assert.match(packages,/"react-native-screens": "~4\.16\.0"/);
  for(const file of ['app/live-video.tsx','lib/room-rotation.ts'])assert.doesNotMatch(read(file),/requireOptionalNativeModule|ExpoScreenOrientation/,file);
});
test('sideways shows Theater by itself and upright puts back exactly what was there',()=>{
  const room=load(),chat={mode:'chat',messages:false},theaterOpen={mode:'theater',messages:true},alone={mode:'theater',messages:false};
  const plain=value=>JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(room.turnRoom(true,true,chat,null)),{now:alone,saved:chat});
  assert.deepEqual(plain(room.turnRoom(false,true,alone,chat)),{now:chat,saved:null});
  assert.deepEqual(plain(room.turnRoom(true,true,theaterOpen,null)),{now:alone,saved:theaterOpen});   // the messages panel closes sideways
  assert.deepEqual(plain(room.turnRoom(false,true,alone,theaterOpen)),{now:theaterOpen,saved:null}); // and opens again upright
  assert.deepEqual(plain(room.turnRoom(true,false,chat,null)),{now:chat,saved:null});               // no live video: no Theater to show
  assert.deepEqual(plain(room.turnRoom(true,true,chat,theaterOpen)),{now:chat,saved:theaterOpen});  // already sideways: a view chosen by hand is kept
  assert.deepEqual(plain(room.turnRoom(false,true,chat,null)),{now:chat,saved:null});
  assert.equal(room.ROOM_LANDSCAPE_SCRIPT,"window.dispatchEvent(new Event('lumenroomlandscape'));true;");
  assert.equal(room.ROOM_PORTRAIT_SCRIPT,"window.dispatchEvent(new Event('lumenroomportrait'));true;");
  const screen=read('app/(tabs)/index.tsx');
  for(const line of screen.split('\n').filter(line=>/turnRoom\(|setSideways\(/.test(line)))assert.doesNotMatch(line,/animated\.(connect|close)|toggleAnimated/,line.trim());   // layout only
  assert.doesNotMatch(screen,/innerWidth\s*>\s*innerHeight|screenWidth > screenHeight/);   // never guessed from the window's shape (the keyboard changes it)
});
test('sideways is read from the phone\'s screen, never from the window the keyboard resizes',()=>{
  const screen=read('app/live-video.tsx'),hook=read('hooks/useScreenLandscape.ts');
  assert.match(screen,/const landscape = useScreenLandscape\(\);/);
  assert.doesNotMatch(screen,/useWindowDimensions|Dimensions\.get\('window'\)/);
  assert.doesNotMatch(hook,/useWindowDimensions|get\('window'\)|\{ window/);
  assert.match(hook,/Dimensions\.addEventListener\('change', \(\{ screen \}\) => setLandscape\(isLandscape\(screen\)\)\)/);
  assert.match(hook,/return \(\) => watch\.remove\(\);/);
  // Run the hook's logic against a stand-in phone: the keyboard shrinks the window, the screen stays as it is.
  const mod={exports:{}};let listener=null,removed=0;const sizes={screen:{width:360,height:780},window:{width:360,height:780}};const state=[];
  vm.runInNewContext(ts.transpileModule(hook,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:name=>name==='react'
    ?{useState:initial=>{const value=typeof initial==='function'?initial():initial;state.push(value);return [value,next=>state.push(next)];},useEffect:effect=>{mod.cleanup=effect();}}
    :{Dimensions:{get:name=>sizes[name],addEventListener:(_,handler)=>{listener=handler;return {remove:()=>removed++};}}}});
  assert.equal(mod.exports.useScreenLandscape(),false);
  sizes.window={width:360,height:300};listener({window:sizes.window,screen:sizes.screen});assert.equal(state.at(-1),false);   // keyboard open, phone upright: not sideways
  sizes.screen={width:780,height:360};listener({window:{width:780,height:360},screen:sizes.screen});assert.equal(state.at(-1),true);   // the phone is turned
  listener({window:{width:780,height:120},screen:sizes.screen});assert.equal(state.at(-1),true);                                      // keyboard open sideways: still sideways
  sizes.screen={width:360,height:780};listener({window:{width:360,height:300},screen:sizes.screen});assert.equal(state.at(-1),false);
  mod.cleanup();assert.equal(removed,1);
  for(const bad of [null,undefined,{width:0,height:0},{width:500,height:500}])assert.equal(mod.exports.isLandscape(bad),false);
});
