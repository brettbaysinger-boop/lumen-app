const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// The Live Room (Video Chat + Companion Theater). No device, browser, avatar service or server is used.
// The rendered layout is checked separately, in a browser, by scripts/test-live-room-browser.cjs.
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
  assert.deepEqual(inside.posted.map(data=>JSON.parse(data)),['ready','gone','chat','theater','close','browser'].map(event=>({lumenRoom:1,event})));
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
  assert.deepEqual(screen.match(/injectJavaScript\([^)]*\)/g),['injectJavaScript(ROOM_BACK_SCRIPT)']);   // the only script ever sent after load
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
  assert.doesNotMatch(read('package.json'),/expo-screen-orientation|expo-navigation-bar/);   // no new native part, so the signed build is as it was
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
