const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// The phone app's doorway to live video in the web app. No device, browser or server is used.
function load({env={},status,signedIn=true,open,platform='android',webview=false}={}){
  const calls={fetch:[],open:[]};const mod={exports:{}};
  const stubs={'react-native':{Platform:{OS:platform},TurboModuleRegistry:{get:name=>{if(webview==='throws')throw Error('no registry');return webview&&name==='RNCWebViewModule'?{}:null;}},Linking:{openURL:async url=>{calls.open.push(url);if(open===false)throw Error('no browser');}}},'./auth':{authHeaders:async()=>{if(!signedIn)throw Error('Sign in to Lumen first.');return {Authorization:'Bearer synthetic'};}}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-video-web.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:name=>stubs[name],URL,JSON,Object,AbortController,setTimeout,clearTimeout,process:{env},
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
  assert.match(screen,/const status = url \? await liveVideoStatus\(\) : 'unknown';[\s\S]{0,300}liveVideoPrompt\(url, status, inAppVideoSupported\(\)\)[\s\S]{0,900}Alert\.alert\(prompt\.title, prompt\.message/);
  assert.match(screen,/text: 'Check again', onPress: \(\) => \{ void check\(\); \}/);
  assert.match(screen,/if \(Platform\.OS !== 'web' \|\| !companion\?\.id\) return;\s+const controller = new AbortController\(\);\s+void animatedCompanionAvailable/);
  assert.doesNotMatch(fs.readFileSync('package.json','utf8'),/react-native-webrtc/);   // no video engine in the app
});
test('phone layout: the reminder banner starts below the status bar, and the chat header actions get their own row',()=>{
  const banner=fs.readFileSync('components/ReminderInbox.tsx','utf8');
  assert.match(banner,/useSafeAreaInsets\(\)/);assert.match(banner,/paddingTop: insets\.top \+ 10/);
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(screen,/flexWrap: isMobile \? 'wrap' : 'nowrap'/);
  assert.match(screen,/headerStatus: \{[\s\S]{0,200}isMobile \? \{ width: '100%'/);
});

// --- Live video inside the app (Issue #19) ---
test('in-app video is offered only where the web view is compiled into this Android build',()=>{
  assert.equal(load({webview:true}).inAppVideoSupported(),true);
  assert.equal(load({webview:false}).inAppVideoSupported(),false);
  assert.equal(load({webview:'throws'}).inAppVideoSupported(),false);                 // never crashes the chat screen
  assert.equal(load({webview:true,platform:'ios'}).inAppVideoSupported(),false);
  assert.equal(load({webview:true,platform:'web'}).inAppVideoSupported(),false);
  const {liveVideoPrompt}=load();
  assert.deepEqual([...liveVideoPrompt(WEB,'available',true).choices],['cancel','open','inapp']);
  assert.deepEqual([...liveVideoPrompt(WEB,'available',false).choices],['cancel','open']);
  for(const status of ['unavailable','unknown']) assert.deepEqual([...liveVideoPrompt(WEB,status,true).choices],['cancel','retry','open']);   // video down: no in-app offer
  assert.deepEqual([...liveVideoPrompt(null,'available',true).choices],['cancel']);
});
test('the in-app view loads the Lumen web app and nothing else',()=>{
  const {sameWebOrigin}=load();
  for(const url of [WEB,WEB+'login',WEB+'?x=1#y','https://lumen.synthetic.invalid'])assert.equal(sameWebOrigin(WEB,url),true,url);
  for(const url of ['http://lumen.synthetic.invalid/','https://lumen.synthetic.invalid:8445/auth/v1/authorize','https://lumen.synthetic.invalid.evil.invalid/','https://evil.invalid/?https://lumen.synthetic.invalid/','https://user:pw@lumen.synthetic.invalid/','https://accounts.google.com/','intent://lumen.synthetic.invalid/#Intent;end','javascript:alert(1)','file:///sdcard/x','data:text/html,x','nonsense',''])
    assert.equal(sameWebOrigin(WEB,url),false,url);
  assert.equal(sameWebOrigin('http://lumen.synthetic.invalid/','http://lumen.synthetic.invalid/'),false);   // never plain http
});
test('the capability probe report is read strictly, and a page cannot send the app anything else',()=>{
  const {readInAppProbe,IN_APP_PROBE}=load();
  const all={lumenProbe:1,rtc:true,channel:true,capture:true,audio:true,inline:true};
  assert.deepEqual({...readInAppProbe(JSON.stringify(all)),missing:[...readInAppProbe(JSON.stringify(all)).missing]},{ok:true,missing:[]});
  const partial=readInAppProbe(JSON.stringify({...all,capture:false,rtc:'yes'}));
  assert.equal(partial.ok,false);assert.deepEqual([...partial.missing],['WebRTC','canvas capture']);
  for(const data of [null,undefined,42,{},'','not json','[]','{"rtc":true}',JSON.stringify({lumenProbe:2,...all,lumenProbe:2}),'x'.repeat(600)])assert.equal(readInAppProbe(data),null);
  // The probe itself, run against a stand-in page: it posts one report and reads nothing else.
  const posted=[];const proto={createDataChannel(){}};function RTC(){};RTC.prototype=proto;
  vm.runInNewContext(IN_APP_PROBE,{RTCPeerConnection:RTC,AudioContext:function(){},JSON,document:{createElement:tag=>tag==='canvas'?{captureStream(){}}:{playsInline:false}},window:{ReactNativeWebView:{postMessage:data=>posted.push(data)}}});
  assert.equal(posted.length,1);assert.equal(readInAppProbe(posted[0]).ok,true);
  posted.length=0;vm.runInNewContext(IN_APP_PROBE,{JSON,document:{createElement:()=>({})},window:{ReactNativeWebView:{postMessage:data=>posted.push(data)}}});
  assert.deepEqual([...readInAppProbe(posted[0]).missing],['WebRTC','WebRTC data channel','canvas capture','Web Audio','inline video']);
  assert.doesNotMatch(IN_APP_PROBE,/localStorage|cookie|token|fetch|XMLHttpRequest/i);
});
test('the in-app screen: guarded, allowlisted, closed in the background, with the browser always at hand',()=>{
  const screen=fs.readFileSync('app/live-video.tsx','utf8');
  assert.doesNotMatch(screen,/^import .*react-native-webview/m);                      // loaded only behind the guard
  assert.match(screen,/url && supported && !message \? require\('react-native-webview'\)\.WebView : null/);
  assert.match(screen,/sameWebOrigin\(url!, request\.url\)\) return true;[\s\S]{0,300}return false;/);
  assert.match(screen,/originWhitelist=\{\['\*'\]\}/);                                // so the library never hands a blocked address to another app
  assert.match(screen,/WebView && active \? <WebView/);assert.match(screen,/AppState\.addEventListener\('change'/);
  assert.match(screen,/Platform\.OS === 'web' \|\| !session\) return <Redirect/);
  assert.match(screen,/Browser ↗/);
  assert.doesNotMatch(screen,/access_token|Authorization|injectJavaScript\(|supabase/);   // nothing of the app's sign-in goes into the page
  for(const off of ['allowFileAccess={false}','setSupportMultipleWindows={false}','thirdPartyCookiesEnabled={false}','geolocationEnabled={false}','mixedContentMode="never"'])assert.ok(screen.includes(off),off);
  assert.match(fs.readFileSync('app/(tabs)/index.tsx','utf8'),/choice === 'inapp' \? \{ text: 'Watch here', onPress: \(\) => \{ router\.push\('\/live-video'\); \} \}/);
});
test('phone layout: no helper lines around the composer, resting status word left out',()=>{
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8'),effort=fs.readFileSync('components/EffortControl.tsx','utf8');
  assert.match(screen,/!keyboardVisible && !isMobile && <Text style=\{styles\.composerHint\}/);
  assert.match(screen,/compact=\{isMobile\}/);assert.match(screen,/!\(isMobile && !sending && syncStatus === 'current'\)/);
  assert.match(effort,/if\(compact&&!supported\)return null;/);assert.equal((effort.match(/\{!compact&&/g)||[]).length,2);
});
