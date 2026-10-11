const assert=require('node:assert/strict');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(require('node:path').resolve('dist'));
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333',J='55555555-5555-4555-8555-555555555555';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-08T00:00:00Z'};
const companion={id:C,owner_user_id:U,name:'Test Companion',portrait_url:null,persona:'Friendly',conversation_model:'local',created_at:'2026-10-08T00:00:00Z'};
const conversations=[{id:I,companion_id:C,title:'First chat',last_message_at:'2026-10-08T00:00:00Z'},{id:J,companion_id:C,title:'Second chat',last_message_at:'2026-10-07T00:00:00Z'}];
let offline=false;
(async()=>{const browser=await chromium.launch({executablePath:process.env.LUMEN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});await new Promise(r=>server.listen(8766,'127.0.0.1',r));try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({user})=>{if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));},{user});
 await page.route('http://127.0.0.1:54321/**',async route=>{
  const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();
  if(offline && resource!=='user'){await route.abort('internetdisconnected');return;}
  let result=[];
  if(resource==='user')result=user;if(resource==='ensure_my_companion')result=C;
  if(resource==='companions')result=req.headers()['accept']?.includes('object')?companion:[companion];
  if(resource==='conversations')result=conversations;
  if(resource==='messages'){const id=url.searchParams.get('conversation_id')?.replace('eq.','')||I;result=[{id:'message-'+id,companion_id:C,conversation_id:id,role:'assistant',content:id===I?'Cached first conversation':'Cached second conversation',metadata:{},created_at:'2026-10-08T00:00:00Z'}];}
  if(resource==='companion_state')result=null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('http://127.0.0.1:8001/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({models:['local'],effective:'local',default:'local',selected:null,memory_model:'local'})}));
 await page.goto('http://127.0.0.1:8766/');
 await page.getByText('Cached first conversation',{exact:true}).waitFor();
 const input=page.getByPlaceholder(/Message/);await input.fill('Unsent draft for first chat');
 await page.waitForFunction(()=>{const v=JSON.parse(localStorage.getItem('raialume-private-chat-v1:11111111-1111-4111-8111-111111111111')||'null');return Object.values(v?.drafts||{}).includes('Unsent draft for first chat');});
 await page.getByLabel('Open conversation history').click();await page.getByText('Second chat',{exact:true}).click();
 await page.getByText('Cached second conversation',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');
 await input.fill('Second draft');
 await page.getByLabel('Open conversation history').click();await page.getByText('First chat',{exact:true}).click();
 await page.getByText('Cached first conversation',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Unsent draft for first chat');
 offline=true;await page.reload();
 await page.getByText('Cached first conversation',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Unsent draft for first chat');
 await page.getByLabel('Retry connection').waitFor();
 await page.getByLabel('Open conversation history').click();await page.getByText('Second chat',{exact:true}).click();
 await page.getByText('Cached second conversation',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Second draft');
 offline=false;await page.getByLabel('Retry connection').click();await page.waitForFunction(()=>!document.body.innerText.includes('Showing saved chats'));
 assert.deepEqual(errors,[]);console.log('PASS: 390px chat cache, separate drafts, backend-unavailable reload and retry.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
