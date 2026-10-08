const assert=require('node:assert/strict');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(require('node:path').resolve('dist'));
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333',M='44444444-4444-4444-8444-444444444444',P='55555555-5555-4555-8555-555555555555';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-08T00:00:00Z'};
const companion={id:C,name:'Lumen',portrait_url:null,persona:{},conversation_model:'local',created_at:'2026-10-08T00:00:00Z'};
const conversations=[{id:I,companion_id:C,title:'Desk plan',last_message_at:'2026-10-08T00:00:00Z'}];
const draft={title:'Desk plan',body:'Keep it manageable.',steps:['Pick one paper.','Put it in a folder.']};
const messages=[{id:M,companion_id:C,conversation_id:I,role:'assistant',content:'Review your draft.',created_at:'2026-10-08T00:00:00Z',metadata:{unstuck_draft:draft}}];
let saved=null,saveCalls=0,failStep=true;
(async()=>{await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/Phoenix'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({user})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));},{user});
 await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let result=[];
  if(resource==='user')result=user;if(resource==='ensure_my_companion')result=C;
  if(resource==='companions')result=req.headers()['accept']?.includes('object')?companion:[companion];
  if(resource==='conversations')result=conversations;if(resource==='messages')result=messages;
  if(resource==='companion_state')result=null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('http://127.0.0.1:8001/**',async route=>{const req=route.request(),url=new URL(req.url());let result=[];
  if(url.pathname.endsWith('/models'))result={models:['local'],effective:'local',default:'local',selected:null,memory_model:'local'};
  if(url.pathname.includes('/v0.8/unstuck/')){
   if(req.method()==='POST'){saveCalls++;const value=req.postDataJSON();saved=saved||{id:P,companion_id:C,kind:'project',step_mode:true,status:'open',title:value.title,body:value.body,checklist:value.steps.map(text=>({text,done:false})),due_at:null,timezone:'UTC',source_conversation_id:I,created_at:'2026-10-08T00:00:00Z'};result=saved;}else result={item:saved};
  }
  if(url.pathname.includes('/v0.3/my-day/')){
   if(url.pathname.endsWith('/due'))result=[];
   else if(url.pathname.endsWith('/step')){
    if(failStep){failStep=false;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({detail:'Could not confirm progress. Reload this plan before retrying.'})});return;}
    const value=req.postDataJSON();assert.equal(saved.checklist[value.index].text,value.text);saved.checklist[value.index].done=true;result=saved;
   }else if(req.method()==='PATCH'){Object.assign(saved,req.postDataJSON());result=saved;}
   else if(url.pathname.includes('/items/'))result=saved;
   else result=saved?[saved]:[];
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('http://127.0.0.1:8765/?conversation='+I);
 await page.getByRole('textbox',{name:'Small-step plan title'}).waitFor();assert.equal(saved,null,'draft never saves itself');
 await page.getByRole('textbox',{name:'Small-step plan title'}).fill('A manageable desk');
 await page.getByRole('textbox',{name:'Small-step plan steps'}).fill('Pick one paper.\nPut it in a folder.');
 await page.getByRole('button',{name:'Save small-step plan',exact:true}).click();
 await page.getByRole('button',{name:'I did this step',exact:true}).waitFor();assert.equal(saveCalls,1);
 assert.equal(await page.getByText('Put it in a folder.',{exact:true}).count(),0,'only the current step is shown');
 await page.getByRole('button',{name:'I did this step',exact:true}).click();await page.getByText('Could not confirm progress. Reload this plan before retrying.',{exact:true}).waitFor();assert.equal(saved.checklist[0].done,false);
 await page.getByRole('button',{name:'Refresh progress',exact:true}).click();
 await page.getByRole('button',{name:'I did this step',exact:true}).click();await page.getByText('Put it in a folder.',{exact:true}).waitFor();
 await page.reload();await page.getByText('Put it in a folder.',{exact:true}).waitFor();assert.equal(saveCalls,1,'reload finds saved plan without another save');
 await page.getByRole('button',{name:'I did this step',exact:true}).click();await page.getByRole('button',{name:'Finish plan',exact:true}).waitFor();
 await page.getByRole('button',{name:'Finish plan',exact:true}).click();await page.getByText('ONE SMALL STEP · DONE',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:8765/my-day');await page.getByText('Show completed / archived',{exact:true}).click();await page.getByText('ONE SMALL STEP · DONE',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Mobile small-step browser: edited draft, explicit save, one step at a time, failed update/retry, reload continuity, finish and My Day passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exit(1);});
