const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// The phone app's doorway to live video in the web app. No device, browser or server is used.
function load({env={},status,signedIn=true,open}={}){
  const calls={fetch:[],open:[]};const mod={exports:{}};
  const stubs={'react-native':{Linking:{openURL:async url=>{calls.open.push(url);if(open===false)throw Error('no browser');}}},'./auth':{authHeaders:async()=>{if(!signedIn)throw Error('Sign in to Lumen first.');return {Authorization:'Bearer synthetic'};}}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-video-web.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:name=>stubs[name],URL,process:{env},
    fetch:async(url,options)=>{calls.fetch.push({url,options});if(status==='offline')throw Error('offline');return {ok:status!==500,json:async()=>status};}});
  return {...mod.exports,calls};
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
test('offered only while the server says the animated companion is on and reachable',async()=>{
  const env={EXPO_PUBLIC_LUMEN_API_URL:API+'/'};
  const on=load({env,status:{enabled:true,available:true}});
  assert.equal(await on.liveVideoOnWeb(),WEB);
  assert.equal(on.calls.fetch[0].url,API+'/v0.1/avatar/status');
  assert.equal(on.calls.fetch[0].options.headers.Authorization,'Bearer synthetic');   // the status check is the app's own signed-in API call
  for(const status of [{enabled:true,available:false},{enabled:false,available:true},{},null,500,'offline'])
    assert.equal(await load({env,status}).liveVideoOnWeb(),null,JSON.stringify(status));
  assert.equal(await load({env,status:{enabled:true,available:true},signedIn:false}).liveVideoOnWeb(),null);
  const unknown=load({env:{EXPO_PUBLIC_LUMEN_API_URL:'http://192.168.1.100:8000'},status:{enabled:true,available:true}});
  assert.equal(await unknown.liveVideoOnWeb(),null);assert.equal(unknown.calls.fetch.length,0);
});
test('opening hands the browser the bare address: no token, cookie or account detail',async()=>{
  const app=load({env:{EXPO_PUBLIC_LUMEN_API_URL:API},status:{enabled:true,available:true}});
  const url=await app.liveVideoOnWeb();
  assert.equal(await app.openLiveVideoOnWeb(url),true);
  assert.deepEqual(app.calls.open,[WEB]);
  assert.doesNotMatch(app.calls.open[0],/synthetic(?!\.invalid)|token|Bearer|[?#@]/);
  assert.equal(await app.openLiveVideoOnWeb(WEB+'?access_token=x'),false);
  assert.equal(await app.openLiveVideoOnWeb('http://lumen.synthetic.invalid/'),false);
  assert.deepEqual(app.calls.open,[WEB]);
  assert.equal(await load({open:false}).openLiveVideoOnWeb(WEB),false);              // no browser: reported, not thrown
});
test('the chat screen shows the action in the phone app only, asks first, and keeps the web toggle web-only',()=>{
  const screen=fs.readFileSync('app/(tabs)/index.tsx','utf8');
  assert.match(screen,/Platform\.OS !== 'web' && !!liveVideoWeb && <TouchableOpacity accessibilityRole="link" accessibilityLabel="Open live video in your browser"/);
  assert.match(screen,/Alert\.alert\('Open live video in your browser\?'[\s\S]{0,400}text: 'Cancel'[\s\S]{0,200}openLiveVideoOnWeb\(url\)/);
  assert.match(screen,/if \(Platform\.OS !== 'web'\) \{\s+void liveVideoOnWeb\(controller\.signal\)[\s\S]{0,200}return \(\) => controller\.abort\(\);\s+\}\s+void animatedCompanionAvailable/);
  assert.doesNotMatch(fs.readFileSync('package.json','utf8')+fs.readFileSync('lib/live-video-web.ts','utf8'),/react-native-webrtc|WebView/);   // no new native module, no embedded page
});
