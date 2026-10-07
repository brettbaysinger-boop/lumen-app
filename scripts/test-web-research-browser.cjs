const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const server=require('./serve-web.cjs').createWebServer(root);
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'test'};
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(14):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>console.log('ERROR',e.message));await page.addInitScript(({user})=>!sessionStorage.getItem('seeded') && (sessionStorage.setItem('seeded','yes'),localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}))),{user});
await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let data=[];if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];if(resource==='messages')data=messages;if(resource==='companion_state')data=null;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})});
await page.route('http://127.0.0.1:8001/**',async route=>{
const request=route.request();
if(request.url().endsWith('/respond/stream')){
const body=request.postDataJSON();assert.equal(body.conversation_id,I,'continue the same thread');
messages.push({id:'message-30',conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
{id:'message-31',conversation_id:I,companion_id:C,role:'assistant',content:'Use a hot skillet and rest your steak. [1]',metadata:{web_search:{sources:[{number:1,title:'Recipe source',url:'https://example.com/recipe',snippet:'Dinner ideas',retrieval:{status:'page_excerpt'}}]}},created_at:new Date().toISOString()});
await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:'message-31',content:messages.at(-1).content}})+'\n',headers:{'access-control-allow-origin':'*'}});return;
}
await route.fulfill({status:200,contentType:'application/json',body:request.url().endsWith('/models')?JSON.stringify({models:['test'],effective:'test',default:'test',selected:null,memory_model:'test'}):'[]',headers:{'access-control-allow-origin':'*'}});
});await page.goto('http://127.0.0.1:8765/');await page.getByPlaceholder('Message Lumen…').waitFor({timeout:15000});await page.waitForTimeout(1000);


await page.getByLabel('Search the web',{exact:true}).click();
assert.equal(await page.getByPlaceholder('Message Lumen…').inputValue(),'Search the web: ');
await page.getByPlaceholder('Message Lumen…').fill('Search the web: quick dinner');
await page.getByLabel('Send message',{exact:true}).click();
await page.getByRole('link',{name:'Open source 1: Recipe source',exact:true}).waitFor();
await page.getByRole('link',{name:'Read source 1: Recipe source',exact:true}).waitFor();
await page.getByText('example.com · Page excerpt read',{exact:true}).waitFor();
await page.reload();await page.getByRole('link',{name:'Open source 1: Recipe source',exact:true}).waitFor();
await page.getByRole('link',{name:'Read source 1: Recipe source',exact:true}).waitFor();
await page.getByText('example.com · Page excerpt read',{exact:true}).waitFor();
await page.setViewportSize({width:390,height:844});
const bounds=await page.getByLabel('Send message',{exact:true}).boundingBox();assert.ok(bounds.x+bounds.width<=390,'mobile send control stays within viewport');
await page.route('http://127.0.0.1:54321/auth/v1/logout**',async route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Auth offline'})}));
await page.goto('http://127.0.0.1:8765/settings');
await page.getByText('Sign out',{exact:true}).click();
await page.waitForURL('**/login');
assert.equal(await page.evaluate(()=>localStorage.getItem('sb-127-auth-token')),null,'expired/offline logout clears browser token');
await browser.close();server.close();console.log('Research answer, inline citations, retrieval labels, persisted sources, mobile controls and logout passed.');})().catch(e=>{console.log(e);server.close();process.exit(1)});
