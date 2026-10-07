const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURI(req.url.split('?')[0]));if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));});
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'test'};
let supportEnabled=false,listed=0,recoveries=0,unlocks=0,passwordUpdated=false;
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(14):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>console.log('ERROR',e.message));await page.addInitScript(({user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user})),{user});
await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let data=[];if(resource==='user'){data=user;if(req.method()==='PUT'){passwordUpdated=typeof req.postDataJSON().password==='string';}}if(resource==='ensure_my_companion')data=C;if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];if(resource==='messages')data=messages;if(resource==='companion_state')data=null;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})});
await page.route('http://127.0.0.1:8001/**',async route=>{
const request=route.request();
if(request.url().includes('/v0.4/support/')){
let data;
if(request.url().endsWith('/me'))data={user_id:U,enabled:supportEnabled};
else if(!supportEnabled){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({detail:'Account support access is required.'})});return;}
else if(request.url().includes('/accounts?page=')){listed++;data={accounts:[{id:C,email:'member@example.test',last_sign_in_at:null,email_confirmed_at:'2026-10-06',banned_until:null}],page:1};}
else if(request.url().endsWith('/audit'))data=[];
else if(request.url().endsWith('/recovery')){recoveries++;data={accepted:true};}
else if(request.url().endsWith('/unlock')){unlocks++;data={accepted:true};}
await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});return;
}

if(request.url().endsWith('/respond/stream')){
const body=request.postDataJSON();assert.equal(body.conversation_id,I,'continue the same thread');
messages.push({id:'message-30',conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
{id:'message-31',conversation_id:I,companion_id:C,role:'assistant',content:'Message 31. We can keep talking in the same conversation.',metadata:{},created_at:new Date().toISOString()});
await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:'message-31',content:messages.at(-1).content}})+'\n',headers:{'access-control-allow-origin':'*'}});return;
}
await route.fulfill({status:200,contentType:'application/json',body:request.url().endsWith('/models')?JSON.stringify({models:['test'],effective:'test',default:'test',selected:null,memory_model:'test'}):'[]',headers:{'access-control-allow-origin':'*'}});
});await page.goto('http://127.0.0.1:8765/');await page.getByPlaceholder('Message Lumen…').waitFor({timeout:15000});await page.waitForTimeout(1000);


await page.goto('http://127.0.0.1:8765/support');
await page.getByText('This account is not authorized for account support.',{exact:true}).waitFor();
assert.equal(listed,0,'unauthorized screen never loads account details');
supportEnabled=true;
await page.reload();await page.getByText('member@example.test',{exact:true}).waitFor();
await page.getByRole('button',{name:'Send recovery email',exact:true}).click();
await page.getByText('Recovery email requested.',{exact:false}).waitFor();assert.equal(recoveries,1);
await page.getByRole('button',{name:'Remove account ban',exact:true}).click();
await page.getByText('Account ban removed.',{exact:false}).waitFor();assert.equal(unlocks,1);
await page.setViewportSize({width:390,height:844});
assert.ok(await page.getByText('member@example.test',{exact:true}).isVisible());
await page.goto('http://127.0.0.1:8765/recover');
await page.getByLabel('New password',{exact:true}).fill('mock-user-selected-password');
await page.getByLabel('Confirm new password',{exact:true}).fill('mock-user-selected-password');
await page.getByRole('button',{name:'Update password',exact:true}).click();
await page.getByText('Password updated. Sign in with your new password.',{exact:true}).waitFor();
assert.ok(passwordUpdated,'user chooses their own password through authenticated Auth API');
await browser.close();server.close();console.log('Support screen authorization, recovery, unlock, mobile layout, and user password update passed.');})().catch(e=>{console.log(e);server.close();process.exit(1)});
