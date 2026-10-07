const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURI(req.url.split('?')[0]));if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));});
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'test'};
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(14):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>console.log('ERROR',e.message));await page.addInitScript(({user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user})),{user});
await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let data=[];if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];if(resource==='messages')data=messages;if(resource==='companion_state')data=null;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})});
await page.route('http://127.0.0.1:8001/**',async route=>{
const request=route.request();
if(request.url().endsWith('/respond/stream')){
const body=request.postDataJSON();assert.equal(body.conversation_id,I,'continue the same thread');
messages.push({id:'message-30',conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
{id:'message-31',conversation_id:I,companion_id:C,role:'assistant',content:'Message 31. We can keep talking in the same conversation.',metadata:{},created_at:new Date().toISOString()});
await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:'message-31',content:messages.at(-1).content}})+'\n',headers:{'access-control-allow-origin':'*'}});return;
}
await route.fulfill({status:200,contentType:'application/json',body:request.url().endsWith('/models')?JSON.stringify({models:['test'],effective:'test',default:'test',selected:null,memory_model:'test'}):'[]',headers:{'access-control-allow-origin':'*'}});
});await page.goto('http://127.0.0.1:8765/');await page.getByPlaceholder('Message Lumen…').waitFor({timeout:15000});await page.waitForTimeout(1000);

async function checkViewport(){
const metrics=await page.evaluate(()=>{const composer=document.querySelector('textarea').getBoundingClientRect();const list=[...document.querySelectorAll('div')].find(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight);return {height:innerHeight,body:document.body.scrollHeight,composerTop:composer.top,composerBottom:composer.bottom,listHeight:list.clientHeight,listScroll:list.scrollHeight,scrollTop:list.scrollTop};});
assert.ok(metrics.composerTop>=0&&metrics.composerBottom<=metrics.height,'composer remains accessible');
assert.ok(metrics.body<=metrics.height+1,'conversation does not push page beyond viewport');
assert.ok(metrics.listScroll>metrics.listHeight,'long history scrolls inside the list');
console.log('Viewport checks:',metrics);
}
await page.getByText('Message 29.',{exact:false}).waitFor();await checkViewport();
assert.equal(await page.getByText(/^Message \d+\./).count(),30,'every loaded message renders');
await page.getByPlaceholder('Message Lumen…').fill('Keep going past the original limit');await page.getByLabel('Send message',{exact:true}).click();
await page.getByText('Message 31.',{exact:false}).waitFor();await page.waitForTimeout(100);await checkViewport();
await page.reload();await page.getByText('Message 31.',{exact:false}).waitFor();await page.waitForTimeout(100);await checkViewport();
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await checkViewport();
await page.evaluate(()=>{const list=[...document.querySelectorAll('div')].find(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight);list.scrollTop=0;});
assert.ok(await page.getByText('Message 0.',{exact:false}).isVisible(),'earliest message remains available');
await browser.close();server.close();console.log('Long conversation rendering, continued sending, reload and mobile scrolling passed.');})().catch(e=>{console.log(e);server.close();process.exit(1)});
