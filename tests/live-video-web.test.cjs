const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// The phone app's doorway to live video in the web app. No device, browser or server is used.
function load({env={},status,signedIn=true,open}={}){
  const calls={fetch:[],open:[]};const mod={exports:{}};
  const stubs={'react-native':{Linking:{openURL:async url=>{calls.open.push(url);if(open===false)throw Error('no browser');}}},'./auth':{authHeaders:async()=>{if(!signedIn)throw Error('Sign in to Lumen first.');return {Authorization:'Bearer synthetic'};}}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-video-web.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:name=>stubs[name],URL,AbortController,setTimeout,clearTimeout,process:{env},
    fetch:async(url,options)=>{calls.fetch.push({url,options});if(status==='offline')throw Error('offline');return {ok:status!==500,json:async()=>status};}});
  return {...mod.exports,calls,setStatus:value=>{status=value;}};
}
const API='https://lumen.synthetic.invalid:8444',WEB='https://lumen.synthetic.invalid/';

test('the web address comes from the explicit setting, or from the documented private HTTPS layout',()=>{
  const {lumenWebUrl}=load();
  assert.equal(lumenWebUrl('https://web.synthetic.invalid',API),'https://web.synthetic.invalid/');
  assert.equal(lumenWebUrl(' https://web.synthetic.invalid:8443/ ',undefined),'https://web.synthetic.invalid:8443/');
  assert.equal(lumenWebUrl(undefined,API),WEB);
  assert.equal(lumenWebUrl('',API+'/'),WEB);
});
test('anything uncertain or unsafe gives no address, so no action is shown',()=>{
  const {lumenWebUrl}=load();
  for(const api of [undefined,'','not a url','http://lumen.synthetic.invalid:8444','https://lumen.synthetic.invalid:8001','https://lumen.synthetic.invalid','http://192.168.1.100:8000','https://user:secret@lumen.synthetic.invalid:8444'])
    assert.equal(lumenWebUrl(undefined,api),null,String(api));
  for(const web of ['http://web.synthetic.invalid','https://user:secret@web.synthetic.invalid','https://web.synthetic.invalid/?access_token=x','https://web.synthetic.invalid/#access_token=x','https://web.synthetic.invalid/other','javascript:alert(1)','intent://web.synthetic.invalid','nonsense'])
    assert.equal(lumenWebUrl(web,API),null,web);   // a bad explicit setting is not papered over by the API address
});
test('the status is the server\'s answer, asked through the app\'s own signed-in API call',async()=>{
  const env={EXPO_PUBLIC_LUMEN_API_URL:API+'/'};
  const on=load({env,status:{enabled:true,available:true}});
  assert.equal(await on.liveVideoStatus(),'available');
  assert.equal(on.calls.fetch[0].url,API+'/v0.1/avatar/status');
  assert.equal(on.calls.fetch[0].options.headers.Authorization,'Bearer synthetic');
  assert.ok(on.calls.fetch[0].options.signal);                                       // the check cannot hang: it is abandoned after a few seconds
  for(const status of [{enabled:true,available:false},{enabled:false,available:true},{},null])
    assert.equal(await load({env,status}).liveVideoStatus(),'unavailable',JSON.stringify(status));
  for(const status of [500,'offline']) assert.equal(await load({env,status}).liveVideoStatus(),'unknown');
  assert.equal(await load({env,status:{enabled:true,available:true},signedIn:false}).liveVideoStatus(),'unknown');
  assert.equal(await load({env:{},status:{enabled:true,available:true}}).liveVideoStatus(),'unknown');
});
test('asked afresh every time: video that comes back is found without restarting the app',async()=>{
  const app=load({env:{EXPO_PUBLIC_LUMEN_API_URL:API},status:{enabled:true,available:false}});
  assert.equal(await app.liveVideoStatus(),'unavailable');
  app.setStatus({enabled:true,available:true});
  assert.equal(await app.liveVideoStatus(),'available');
  assert.equal(app.calls.fetch.length,2);
});
test('the person is always told what is going on, and nothing opens without their choice',()=>{
  const {liveVideoPrompt}=load();
  const ready=liveVideoPrompt(WEB,'available');
  assert.equal(ready.title,'Open live video in your browser?');assert.deepEqual([...ready.choices],['cancel','open']);
  const down=liveVideoPrompt(WEB,'unavailable');
  assert.equal(down.title,'Video currently unavailable');assert.deepEqual([...down.choices],['cancel','retry','open']);
  assert.match(down.message,/portrait until video is back/);
  const unsure=liveVideoPrompt(WEB,'unknown');
  assert.equal(unsure.title,'Could not check live video');assert.deepEqual([...unsure.choices],['cancel','retry','open']);
  for(const prompt of [ready,down,unsure]) assert.match(prompt.message,/its own Lumen sign-in/);   // the separate browser sign-in is always stated
  const unset=liveVideoPrompt(null,'unknown');
  assert.equal(unset.title,'Live video is not set up in this app');assert.deepEqual([...unset.choices],['cancel']);   // no address: nothing can be opened
});
test('opening hands the browser the bare address: no token, cookie or account detail',async()=>{
  const app=load({env:{EXPO_PUBLIC_LUMEN_API_URL:API},status:{enabled:true,available:true}});
  const url=app.liveVideoWebUrl();assert.equal(url,WEB);
  assert.equal(await app.openLiveVideoOnWeb(url),true);
  assert.deepEqual(app.calls.open,[WEB]);
  assert.doesNotMatch(app.calls.open[0],/synthetic(?!\.invalid)|token|Bearer|[?#@]/);
  assert.equal(await app.openLiveVideoOnWeb(WEB+'?access_token=x'),false);
  assert.equal(await app.openLiveVideoOnWeb('http://lumen.synthetic.invalid/'),false);
  assert.deepEqual(app.calls.open,[WEB]);
  assert.equal(await load({open:false}).openLiveVideoOnWeb(WEB),false);              // no browser: reported, not thrown
});
test('the chat screen always shows the action in the phone app, checks on each tap, and keeps the web toggle web-only',()=>{
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(screen,/\{Platform\.OS !== 'web' && <TouchableOpacity accessibilityRole="link" accessibilityLabel="Open live video in your browser"/);   // not hidden when video is down
  assert.doesNotMatch(screen,/liveVideoOnWeb|setLiveVideoWeb/);                       // no remembered availability that could go stale
  assert.match(screen,/const status = url \? await liveVideoStatus\(\) : 'unknown';[\s\S]{0,300}liveVideoPrompt\(url, status\)[\s\S]{0,900}Alert\.alert\(prompt\.title, prompt\.message/);
  assert.match(screen,/text: 'Check again', onPress: \(\) => \{ void check\(\); \}/);
  assert.match(screen,/if \(Platform\.OS !== 'web' \|\| !companion\?\.id\) return;\s+const controller = new AbortController\(\);\s+void animatedCompanionAvailable/);
  assert.doesNotMatch(fs.readFileSync('package.json','utf8')+fs.readFileSync('lib/live-video-web.ts','utf8'),/react-native-webrtc|WebView/);   // no new native module, no embedded page
});
test('phone layout: the reminder banner starts below the status bar, and the chat header actions get their own row',()=>{
  const banner=fs.readFileSync('components/ReminderInbox.tsx','utf8');
  assert.match(banner,/useSafeAreaInsets\(\)/);assert.match(banner,/paddingTop: insets\.top \+ 10/);
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(screen,/flexWrap: isMobile \? 'wrap' : 'nowrap'/);
  assert.match(screen,/headerStatus: \{[\s\S]{0,200}isMobile \? \{ width: '100%'/);
});
