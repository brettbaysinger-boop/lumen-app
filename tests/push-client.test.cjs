const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
function fixture(){let session={user:{id:'owner-a'},access_token:'jwt-a'},granted=true,asks=0,tokenCalls=0;const values=new Map(),requests=[];
 const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v)};
 const notifications={AndroidImportance:{DEFAULT:3},AndroidNotificationVisibility:{PRIVATE:0},setNotificationChannelAsync:async()=>{},getPermissionsAsync:async()=>({granted}),requestPermissionsAsync:async()=>{asks++;return {granted}},getDevicePushTokenAsync:async()=>{tokenCalls++;return {type:'android',data:'native-token-aaaaaaaaaaaa'}},dismissAllNotificationsAsync:async()=>{}};
 const file=path.resolve('lib/push-client.native.ts'),mod=new Module(file,module);mod.paths=module.paths;
 mod.require=name=>name==='react-native'?{Platform:{OS:'android'}}:name==='@react-native-async-storage/async-storage'?{default:storage,__esModule:true}:name==='expo-notifications'?notifications:name==='./supabase'?{supabase:{auth:{getSession:async()=>({data:{session}})}}}:name==='./my-day'?{requestKey:()=> '33333333-3333-4333-8333-333333333333'}:require(name);
 const original=global.fetch;global.fetch=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return {ok:true}};
 process.env.EXPO_PUBLIC_LUMEN_API_URL='https://synthetic.invalid';
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
 return {client:mod.exports,values,requests,setSession:v=>{session=v},setGranted:v=>{granted=v},counts:()=>({asks,tokenCalls}),restore:()=>{global.fetch=original}};
}
test('push stays opt-in and uses native FCM registration after permission',async()=>{const f=fixture();try{
 await f.client.refreshPush('owner-a');assert.equal(f.requests.length,0);assert.equal(f.counts().asks,0);
 await f.client.enablePush('owner-a');assert.equal(await f.client.pushEnabled('owner-a'),true);
 assert.equal(f.requests[0].body.token,'native-token-aaaaaaaaaaaa');assert.match(f.requests[0].url,/\/register$/);
 await f.client.testPush('owner-a');assert.match(f.requests.at(-1).url,/\/test$/);
 await f.client.disablePush('owner-a');assert.equal(await f.client.pushEnabled('owner-a'),false);
}finally{f.restore()}});
test('permission rejection never obtains a token or enables push',async()=>{const f=fixture();try{
 f.setGranted(false);await assert.rejects(f.client.enablePush('owner-a'),/blocked/);
 assert.equal(f.counts().tokenCalls,0);assert.equal(await f.client.pushEnabled('owner-a'),false);
 assert.match(f.requests[0].url,/disable$/);
}finally{f.restore()}});
test('account changes rebind a known installation disabled without asking permission',async()=>{const f=fixture();try{
 await f.client.enablePush('owner-a');f.setSession({user:{id:'owner-b'},access_token:'jwt-b'});
 await f.client.refreshPush('owner-b');assert.equal(f.requests.at(-1).body.enabled,false);
 assert.equal(f.requests.at(-1).options.headers.Authorization,'Bearer jwt-b');
 await assert.rejects(f.client.testPush('owner-a'),/Account changed/);
}finally{f.restore()}});
test('offline disable reports failure but offline sign-out completes and clears local opt-in',async()=>{const f=fixture();try{
 await f.client.enablePush('owner-a');global.fetch=async()=>{throw new Error('offline')};
 await assert.rejects(f.client.disablePush('owner-a'),/offline/);assert.equal(await f.client.pushEnabled('owner-a'),true);
 await f.client.revokePushBeforeSignOut();assert.equal(await f.client.pushEnabled('owner-a'),false);
}finally{f.restore()}});
test('a late account switch cannot mark the old owner enabled',async()=>{const f=fixture();try{
 global.fetch=async()=>{f.setSession({user:{id:'owner-b'},access_token:'jwt-b'});return {ok:true}};
 await assert.rejects(f.client.enablePush('owner-a'),/Account changed/);
 assert.equal(await f.client.pushEnabled('owner-a'),false);
 assert.ok(f.values.get('raialume-push-native-token'));
}finally{f.restore()}});
