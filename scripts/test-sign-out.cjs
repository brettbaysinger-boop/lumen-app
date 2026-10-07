const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/sign-out.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
async function test(signOut){
 const values=new Map([['sb-100-auth-token','stale'],['sb-100-auth-token-code-verifier','verifier'],['sb-100-auth-token-user','user'],['lumen-theme','gold-dark'],['sb-other-auth-token','other-app']]);
 let destination,stopped=false;
 const sandbox={exports:{},require:()=>({supabase:{auth:{stopAutoRefresh(){stopped=true;},signOut:async options=>{assert.equal(options.scope,'local');return signOut();}}}}),
  window:{location:{replace(value){destination=value;}}},localStorage:{removeItem:key=>values.delete(key)},URL,
  process:{env:{EXPO_PUBLIC_SUPABASE_URL:'http://100.75.227.45:54321'}},
  setTimeout:callback=>setTimeout(callback,5),clearTimeout};
 vm.runInNewContext(code,sandbox);await sandbox.exports.signOutThisBrowser();
 assert.ok(stopped);assert.equal(destination,'/login');
 assert.equal(values.has('sb-100-auth-token'),false);assert.equal(values.has('sb-100-auth-token-code-verifier'),false);assert.equal(values.has('sb-100-auth-token-user'),false);
 assert.equal(values.get('lumen-theme'),'gold-dark');assert.equal(values.get('sb-other-auth-token'),'other-app');
}
(async()=>{
 await test(()=>({error:null}));await test(()=>({error:{message:'Auth session missing!'}}));
 await test(()=>{throw new Error('network offline');});await test(()=>new Promise(()=>{}));
 console.log('Local sign-out clears only this app’s auth keys after success, invalid session, offline failure and timeout.');
})().catch(error=>{console.error(error);process.exit(1)});
