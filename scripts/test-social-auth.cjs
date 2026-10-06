const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const loaded = { exports: {} };
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/social-auth-policy.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(loaded, loaded.exports);
const { enabledSocialProviders, socialRedirect, callbackError, nativeSessionTokens } = loaded.exports;
assert.deepEqual(enabledSocialProviders({ external: {google:true,x:true,github:false,facebook:'true',twitter:true} }).map(x=>x.id),['google','x']);
assert.deepEqual(enabledSocialProviders({}), []);
assert.deepEqual(enabledSocialProviders({external:{google:true,apple:true,azure:true}}).map(x=>x.label), ['Google','Apple','Microsoft']);
assert.equal(socialRedirect('http://localhost:8081/login?next=https://evil.test#access_token=secret'),'http://localhost:8081/login');
assert.equal(socialRedirect('https://desktop.example.ts.net:8081/settings'),'https://desktop.example.ts.net:8081/login');
assert.throws(()=>socialRedirect('javascript:alert(1)'));
assert.equal(callbackError('http://localhost/login#error=access_denied&error_description=secret'), 'Sign-in was canceled or could not be completed. Please try again.');
assert.equal(callbackError('http://localhost/login?error=access_denied'), 'Sign-in was canceled or could not be completed. Please try again.');
assert.equal(callbackError('http://localhost/login#access_token=token'), '');
assert.deepEqual(nativeSessionTokens('myapp://login#access_token=access&refresh_token=refresh','myapp://login'),{access_token:'access',refresh_token:'refresh'});
assert.throws(()=>nativeSessionTokens('myapp://login.evil#access_token=a&refresh_token=b','myapp://login'));
assert.throws(()=>nativeSessionTokens('myapp://login#access_token=a','myapp://login'));
assert.throws(()=>nativeSessionTokens('myapp://login#error=denied&access_token=a&refresh_token=b','myapp://login'));
console.log('Social provider discovery, modern X, same-origin redirects, cancellation and native callback guards passed.');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const client = createClient('http://127.0.0.1:54321','test-anon', {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const { data, error } = await client.auth.signInWithOAuth({provider:'x',options:{redirectTo:'http://localhost:8081/login',skipBrowserRedirect:true}});
  assert.equal(error,null);
  const url = new URL(data.url);
  assert.equal(url.pathname,'/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'),'x');
  assert.equal(url.searchParams.get('redirect_to'),'http://localhost:8081/login');
  console.log('Pinned Supabase SDK forwards modern X OAuth provider and exact callback correctly.');
})().catch(error=>{console.error(error);process.exitCode=1});
