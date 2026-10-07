const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const server=require('./serve-web.cjs').createWebServer(root);
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'test'};
const D='55555555-5555-4555-8555-555555555555';let documents=[{id:D,title:'Warranty.txt',kind:'text',page_count:1}];let saved={}, saves=0, failSave=true;
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(14):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/Phoenix'});page.on('pageerror',e=>console.log('ERROR',e.message));await page.addInitScript(({user})=>!sessionStorage.getItem('seeded') && (sessionStorage.setItem('seeded','yes'),localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}))),{user});
await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let data=[];if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];if(resource==='messages')data=messages;if(resource==='companion_state')data=null;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})});
await page.route('http://127.0.0.1:8001/**',async route=>{
const request=route.request();
if(request.url().includes('/drafts/')){
 const id=new URL(request.url()).pathname.split('/drafts/')[1].split('/')[0];
 if(request.method()==='POST'){
  if(failSave){failSave=false;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'Test save failed'})});return;}
  const body=request.postDataJSON(),draft=messages.find(m=>m.id===id).metadata.document_action_draft;
  if(draft.kind==='reminder'){assert.equal(body.due_at,'2030-01-01T16:00:00.000Z');assert.equal(body.timezone,'America/Phoenix');}
  if(!saved[id]){saves++;saved[id]={...body,id,kind:draft.kind,companion_id:C,status:'open',source_documents:messages.find(m=>m.id===id).metadata.document_sources};}
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(request.method()==='POST'?saved[id]:{item:saved[id]||null})});return;
}
if(request.method()==='PATCH' && request.url().includes('/my-day/')){
 const id=new URL(request.url()).pathname.split('/').pop();Object.assign(saved[id],request.postDataJSON());
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(saved[id])});return;
}
if(request.url().endsWith('/v0.3/my-day/companions/'+C)){
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Object.values(saved))});return;
}
if(request.url().includes('/v0.6/documents/')){
 const pathname=new URL(request.url()).pathname;let result=documents;
 if(pathname.endsWith('/upload')){assert.match(request.headers()['content-type'],/multipart\/form-data/);assert.ok(request.postDataBuffer().includes(Buffer.from('Warranty covers parts for five years.')));documents=[{id:D,title:request.postDataBuffer().includes(Buffer.from('filename="PSU.pdf"'))?'PSU.pdf':'Warranty.txt',kind:'text',page_count:1,created_at:'now'}];result={...documents[0],existing:false};}
 else if(pathname.endsWith('/search'))result=[{document_id:D,title:'Warranty.txt',page:1,content:'Warranty covers parts for five years. Labor is excluded.'}];
 else if(pathname.includes('/pages/'))result={title:'Warranty.txt',page:1,content:'Warranty covers parts for five years. Labor is excluded.'};
 else if(request.method()==='DELETE'){documents=[];result={deleted:true};}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result),headers:{'access-control-allow-origin':'*'}});return;
}
if(request.url().endsWith('/respond/stream')){
const body=request.postDataJSON();assert.equal(body.conversation_id,I,'continue the same thread');
if(body.document_id && /^(Create|Draft)/.test(body.message)){
 const kind=body.message.startsWith('Create')?'list':body.message.includes('follow-up')?'reminder':'note';
 const id=kind==='list'?'77777777-7777-4777-8777-777777777777':kind==='note'?'88888888-8888-4888-8888-888888888888':'99999999-9999-4999-8999-999999999999';
 messages.push({id:'user-'+id,conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
 {id,conversation_id:I,companion_id:C,role:'assistant',content:'Draft prepared for review.',metadata:{document_action_draft:{kind,title:'Review warranty',body:'Parts are covered; labor is excluded. [1]',checklist:kind==='list'?[{text:'Review warranty coverage. [1]',done:false}]:[]},document_sources:[{number:1,document_id:D,title:'Warranty.txt',page:1,excerpt:'Warranty covers parts for five years. Labor is excluded.'}]},created_at:new Date().toISOString()});
 await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:id,content:'Draft prepared for review.'}})+'\n'});return;
}
if(body.document_id || body.message.startsWith('Search my documents:')){
if(body.document_id)assert.equal(body.document_id,D,'selected document ID is sent separately from the natural question');
 messages.push({id:body.document_id?'selected-doc-user':'doc-user',conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
 {id:body.document_id?'selected-doc-answer':'doc-answer',conversation_id:I,companion_id:C,role:'assistant',content:body.document_id?'Attached PSU document explained. [1]':'Parts are covered for five years. [1]',metadata:{document_sources:[{number:1,document_id:D,title:'Warranty.txt',page:1,excerpt:'Warranty covers parts for five years. Labor is excluded.'}]},created_at:new Date().toISOString()});
 await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:messages.at(-1).id,content:messages.at(-1).content}})+'\n',headers:{'access-control-allow-origin':'*'}});return;
}

messages.push({id:'message-30',conversation_id:I,companion_id:C,role:'user',content:body.message,metadata:{},created_at:new Date().toISOString()},
{id:'message-31',conversation_id:I,companion_id:C,role:'assistant',content:'Use a hot skillet and rest your steak. [1, 2]',metadata:{web_search:{sources:[{number:1,title:'Recipe source',url:'https://example.com/recipe',snippet:'Dinner ideas',retrieval:{status:'page_excerpt'}},{number:2,title:'Second guide',url:'https://example.org/guide',snippet:'Second source'}]}},created_at:new Date().toISOString()});
await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',response:{conversation_id:I,message_id:'message-31',content:messages.at(-1).content}})+'\n',headers:{'access-control-allow-origin':'*'}});return;
}
await route.fulfill({status:200,contentType:'application/json',body:request.url().endsWith('/models')?JSON.stringify({models:['test'],effective:'test',default:'test',selected:null,memory_model:'test'}):'[]',headers:{'access-control-allow-origin':'*'}});
});await page.goto('http://127.0.0.1:8765/');await page.locator('textarea[placeholder="Message Lumen…"]:visible').waitFor({timeout:15000});await page.waitForTimeout(1000);



await page.getByRole('button',{name:'Attach files',exact:true}).click();
await page.getByRole('button',{name:'Open document library',exact:true}).click();
await page.getByRole('button',{name:'Explain this document',exact:true}).click();
await page.getByText('Using document: Warranty.txt',{exact:true}).waitFor();
const before=messages.length;
await page.getByRole('button',{name:'Draft checklist',exact:true}).click();
assert.equal(messages.length,before,'preparing the prompt never sends or saves');assert.equal(saves,0);
await page.getByLabel('Send message',{exact:true}).click();
await page.getByRole('button',{name:'Review and save',exact:true}).click();
await page.getByLabel('Draft title',{exact:true}).fill('Reviewed warranty checklist');
await page.getByLabel('Draft checklist',{exact:true}).fill('Check covered parts. [1]\nConfirm excluded labor. [1]');
assert.equal(saves,0,'reviewing and editing does not save');
await page.getByRole('button',{name:'Save to My Day',exact:true}).click();
await page.getByRole('alert').waitFor();assert.equal(saves,0,'failed save creates no success card');
await page.getByRole('button',{name:'Save to My Day',exact:true}).click();
await page.getByText('Reviewed warranty checklist',{exact:true}).waitFor();
assert.equal(saves,1);assert.equal(saved['77777777-7777-4777-8777-777777777777'].checklist.length,2);
await page.getByText('Undo',{exact:true}).click();await page.getByText('LIST · ARCHIVED',{exact:true}).waitFor();
await page.reload();await page.getByText('LIST · ARCHIVED',{exact:true}).waitFor();
await page.getByText('Restore',{exact:true}).click();await page.getByText('LIST · SAVED',{exact:true}).waitFor();
assert.equal(saves,1,'reload and Restore reuse the saved item');
await page.getByRole('button',{name:'Attach files',exact:true}).click();
await page.getByRole('button',{name:'Open document library',exact:true}).click();
await page.getByRole('button',{name:'Explain this document',exact:true}).click();
await page.getByRole('button',{name:'Draft note',exact:true}).click();await page.getByLabel('Send message',{exact:true}).click();
await page.getByRole('button',{name:'Review and save',exact:true}).click();
await page.getByLabel('Draft title',{exact:true}).fill('Warranty note');await page.getByRole('button',{name:'Save to My Day',exact:true}).click();
await page.getByText('NOTE · SAVED',{exact:true}).waitFor();assert.equal(saves,2);
await page.getByRole('button',{name:'Draft follow-up',exact:true}).click();await page.getByLabel('Send message',{exact:true}).click();
await page.getByRole('button',{name:'Review and save',exact:true}).click();
await page.getByRole('button',{name:'Save to My Day',exact:true}).click();
await page.getByText('Choose a future reminder date and time.',{exact:true}).waitFor();assert.equal(saves,2,'no reminder is scheduled without a chosen time');
await page.getByLabel('Reminder date and time',{exact:true}).fill('2030-01-01T09:00');
await page.getByRole('button',{name:'Save to My Day',exact:true}).click();await page.getByText('REMINDER · SAVED',{exact:true}).waitFor();assert.equal(saves,3);
const bounds=await page.getByLabel('Send message',{exact:true}).boundingBox();assert.ok(bounds.x+bounds.width<=390);
await page.goto('http://127.0.0.1:8765/my-day');
await page.getByText('Reviewed warranty checklist',{exact:true}).waitFor();
await page.getByRole('button',{name:'Read document source 1: Warranty.txt, page 1',exact:true}).first().click();
await page.getByRole('button',{name:'Close document page',exact:true}).waitFor();
await page.getByRole('button',{name:'Close document page',exact:true}).click();
await page.getByRole('checkbox').first().click();
assert.equal(saved['77777777-7777-4777-8777-777777777777'].source_documents[0].page,1,'editing an item preserves its provenance');
await browser.close();server.close();console.log('Mobile document actions: draft-only prompts, editing, failed save, save/Undo/Restore/reload, notes, explicit reminder timezone and source references passed.');})().catch(e=>{console.error(e);server.close();process.exit(1)});
