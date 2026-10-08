const assert=require('node:assert/strict');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(require('node:path').resolve('dist'));
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',G='33333333-3333-4333-8333-333333333333',I='44444444-4444-4444-8444-444444444444';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-07T00:00:00Z'};
const companion={id:C,name:'Lumen',portrait_url:null,persona:{},conversation_model:'local',created_at:'2026-10-07T00:00:00Z'};
let goals=[],sessions=[],messages=[],conversations=[{id:I,companion_id:C,title:'Ordinary chat',last_message_at:'2026-10-07T00:00:00Z'}],failFinish=true,created=0;
(async()=>{await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/Phoenix'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({user})=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','yes');localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));}},{user});
 await page.route('http://127.0.0.1:54321/**',async route=>{
  const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let result=[];
  if(resource==='user')result=user;if(resource==='ensure_my_companion')result=C;
  if(resource==='companions')result=req.headers()['accept']?.includes('object')?companion:[companion];
  if(resource==='conversations')result=conversations;
  if(resource==='messages')result=messages.filter(m=>m.conversation_id===(url.searchParams.get('conversation_id')||'').replace('eq.',''));
  if(resource==='companion_state')result=null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('http://127.0.0.1:8001/**',async route=>{
  const req=route.request(),url=new URL(req.url());let result=[];
  if(url.pathname.endsWith('/models'))result={models:['local'],effective:'local',default:'local',selected:null,memory_model:'local'};
  if(url.pathname.includes('/v0.3/my-day/')&&req.method()==='POST'){
   const body=req.postDataJSON();assert.equal(body.kind,'goal');
   if(!goals.length)goals.push({...body,id:G,companion_id:C,status:'open',goal_profile:{},checklist:[],created_at:'2026-10-07T00:00:00Z'});result=goals[0];
  }
  if(url.pathname.includes('/v0.7/goals/')){
   const suffix=url.pathname.split('/companions/'+C)[1];result=goals;
   if(suffix.endsWith('/profile')){goals[0].goal_profile=req.postDataJSON();result=goals[0];}
   else if(req.method()==='PATCH' && suffix.includes('/sessions/')){const id=suffix.split('/sessions/')[1];result=sessions.find(s=>s.id===id);Object.assign(result,req.postDataJSON());}
   else if(suffix.endsWith('/finish')){
    if(failFinish){failFinish=false;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'Test save failed'})});return;}
    const id=suffix.split('/sessions/')[1].split('/')[0];const session=sessions.find(s=>s.id===id);Object.assign(session,req.postDataJSON(),{status:'completed',ended_at:'2026-10-08T03:00:00Z'});result=session;
   }else if(suffix.endsWith('/sessions')){
    if(req.method()==='GET')result=sessions;
    else{let session=sessions.find(s=>s.status==='open');if(!session){created++;const id=created===1?'55555555-5555-4555-8555-555555555555':'66666666-6666-4666-8666-666666666666';const chat=created===1?'77777777-7777-4777-8777-777777777777':'88888888-8888-4888-8888-888888888888';session={id,item_id:G,companion_id:C,conversation_id:chat,status:'open',profile:{...goals[0].goal_profile},summary:'',practice_notes:'',vocabulary:'',next_step:'',started_at:'2026-10-08T03:00:00Z',ended_at:null};sessions.unshift(session);conversations.unshift({id:chat,companion_id:C,title:'Practice: Learn Spanish',goal_item_id:G,last_message_at:new Date().toISOString()});}result=session;}
   }
  }
  if(url.pathname.endsWith('/respond/stream')){
   const body=req.postDataJSON();assert.ok(sessions.some(s=>s.conversation_id===body.conversation_id),'practice sends into the linked conversation');
   if(body.message==='save our session'){
    const session=sessions.find(s=>s.conversation_id===body.conversation_id);
    Object.assign(session,{status:'completed',summary:'Practiced introductions',practice_notes:'Review me llamo',vocabulary:'hola; buenos días',next_step:'Practice greeting a customer',ended_at:'2026-10-08T03:00:00Z'});
    messages.push({id:'save-user',companion_id:C,conversation_id:body.conversation_id,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},{id:'save-receipt',companion_id:C,conversation_id:body.conversation_id,role:'assistant',content:'Saved this practice session.',metadata:{goal_session:{...session}},created_at:new Date().toISOString()});
    await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:body.conversation_id,message_id:'save-receipt',content:'Saved this practice session.'}})+'\n'});return;
   }
   messages.push({id:'u-'+messages.length,companion_id:C,conversation_id:body.conversation_id,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},{id:'a-'+messages.length,companion_id:C,conversation_id:body.conversation_id,role:'assistant',content:'Hola. Try introducing yourself.',metadata:{},created_at:new Date().toISOString()});
   await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:body.conversation_id,message_id:messages.at(-1).id,content:messages.at(-1).content}})+'\n'});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('http://127.0.0.1:8765/goals');await page.getByRole('button',{name:'New goal',exact:true}).click();
 await page.getByRole('textbox',{name:'Goal name',exact:true}).fill('Learn Spanish');await page.getByRole('button',{name:'Create goal',exact:true}).click();
 await page.getByRole('textbox',{name:'Practice focus',exact:true}).waitFor();assert.equal(goals.length,1);
 await page.getByRole('button',{name:'Customer Spanish',exact:true}).click();await page.getByRole('button',{name:'daily',exact:true}).click();
 await page.getByRole('button',{name:'Start practice',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/');await page.locator('textarea[placeholder="Message Lumen…"]:visible').waitFor();
 assert.equal(messages.length,0,'starting prepares a chat draft and does not send it');assert.equal(created,1);assert.match(sessions[0].profile.focus,/pest-control/);
 await page.locator('[aria-label="Send message"]:visible').click();await page.getByText('Hola. Try introducing yourself.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Open goals and practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');await page.getByText('Save this session',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Resume practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/');await page.locator('textarea[placeholder="Message Lumen…"]:visible').waitFor();assert.equal(created,1,'resume does not create another session');
 await page.getByRole('button',{name:'Open goals and practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');
 await page.getByRole('textbox',{name:'Session progress',exact:true}).fill('Practiced introductions');await page.getByRole('textbox',{name:'Practice corrections',exact:true}).fill('Review me llamo');await page.getByRole('textbox',{name:'Practice vocabulary',exact:true}).fill('hola; buenos días');await page.getByRole('textbox',{name:'Next practice step',exact:true}).fill('Practice greeting a customer');
 await page.getByRole('button',{name:'Finish and save session',exact:true}).click();await page.getByText('Test save failed',{exact:true}).waitFor();assert.equal(sessions[0].status,'open');
 await page.getByRole('button',{name:'Finish and save session',exact:true}).click();await page.getByText('Practiced introductions',{exact:true}).waitFor();assert.equal(sessions[0].status,'completed');
 await page.reload();await page.getByText('Practiced introductions',{exact:true}).waitFor();await page.getByText('Vocabulary: hola; buenos días',{exact:true}).waitFor();
 await page.getByRole('button',{name:'10 minutes',exact:true}).click();await page.getByRole('button',{name:'Start practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/');await page.locator('textarea[placeholder="Message Lumen…"]:visible').waitFor();assert.equal(created,2);assert.equal(sessions[0].profile.minutes,10);assert.equal(sessions[1].profile.minutes,5);
 await page.getByRole('button',{name:'Open goals and practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');
 await page.getByRole('button',{name:'Edit session notes',exact:true}).click();
 await page.getByRole('textbox',{name:'Session progress',exact:true}).fill('Edited introductions');
 await page.getByRole('button',{name:'Save session edits',exact:true}).click();await page.getByText('Edited introductions',{exact:true}).waitFor();
 assert.equal(sessions[1].summary,'Edited introductions');assert.equal(sessions[1].status,'completed');
 await page.getByRole('button',{name:'Resume practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/');
 await page.locator('textarea[placeholder="Message Lumen…"]:visible').fill('save our session');await page.locator('[aria-label="Send message"]:visible').click();
 await page.getByText('PRACTICE SESSION · SAVED',{exact:true}).waitFor();
 await page.reload();await page.getByText('PRACTICE SESSION · SAVED',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Review saved practice',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');
 assert.equal(sessions[0].status,'completed');
 await page.getByRole('button',{name:'Back to conversation',exact:true}).click();await page.waitForURL(url=>url.pathname==='/');
 const bounds=await page.locator('[aria-label="Send message"]:visible').boundingBox();assert.ok(bounds.x+bounds.width<=390,'mobile send stays inside viewport');
 assert.deepEqual(errors,[]);console.log('Goal mobile browser: creation/preferences, linked chat draft, resume, failed finish/retry, saved progress reload and new-session profile snapshots, saved-note editing and chat receipt persistence passed.');
 }finally{await browser.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exit(1)});
