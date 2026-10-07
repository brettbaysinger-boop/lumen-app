const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const server=require('./serve-web.cjs').createWebServer(root);
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'test'};
const D='55555555-5555-4555-8555-555555555555';let documents=[];
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(14):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>console.log('ERROR',e.message));await page.addInitScript(({user})=>!sessionStorage.getItem('seeded') && (sessionStorage.setItem('seeded','yes'),localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}))),{user});
await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let data=[];if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];if(resource==='messages')data=messages;if(resource==='companion_state')data=null;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})});
await page.route('http://127.0.0.1:8001/**',async route=>{
const request=route.request();
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


await page.getByLabel('Search the web',{exact:true}).click();
assert.equal(await page.locator('textarea[placeholder="Message Lumen…"]:visible').inputValue(),'Search the web: ');
await page.locator('textarea[placeholder="Message Lumen…"]:visible').fill('Search the web: quick dinner');
await page.locator('[aria-label="Send message"]:visible').click();
await page.getByRole('link',{name:'Open source 1: Recipe source',exact:true}).waitFor();
await page.getByRole('link',{name:'Read source 1: Recipe source',exact:true}).waitFor();
await page.getByText('example.com · Page excerpt read',{exact:true}).waitFor();
await page.reload();await page.getByRole('link',{name:'Open source 1: Recipe source',exact:true}).waitFor();
await page.getByRole('link',{name:'Read source 1: Recipe source',exact:true}).waitFor();
await page.getByText('example.com · Page excerpt read',{exact:true}).waitFor();
await page.setViewportSize({width:390,height:844});
const bounds=await page.locator('[aria-label="Send message"]:visible').boundingBox();assert.ok(bounds.x+bounds.width<=390,'mobile send control stays within viewport');

await page.getByRole('link',{name:'Read source 2: Second guide',exact:true}).waitFor();
await page.getByLabel('Open your documents',{exact:true}).click();
await page.getByText('Your documents',{exact:true}).waitFor();
const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import document',exact:true}).click();
await(await picker).setFiles({name:'Warranty.txt',mimeType:'text/plain',buffer:Buffer.from('Warranty covers parts for five years. Labor is excluded.')});
await page.getByText('Imported text · 1',{exact:true}).waitFor();
await page.getByLabel('Search document text',{exact:true}).fill('refrigerator warranty');
await page.getByRole('button',{name:'Search documents',exact:true}).click();
await page.getByRole('button',{name:'Read document source 1: Warranty.txt, page 1',exact:true}).click();
await page.getByRole('button',{name:'Close document page',exact:true}).click();
await page.getByRole('button',{name:'Ask companion',exact:true}).click();
await page.waitForURL(url => url.pathname === '/' && !url.searchParams.get('draft'));
await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some(e => e.value === 'Search my documents: refrigerator warranty'));
assert.equal(await page.locator('textarea[placeholder="Message Lumen…"]:visible').inputValue(),'Search my documents: refrigerator warranty');
assert.equal(messages.some(m=>m.id==='doc-answer'),false,'document question stays in draft until Send');
await page.locator('[aria-label="Send message"]:visible').click();
await page.getByText('Parts are covered for five years. [1]',{exact:true}).waitFor();
await page.reload();await page.getByRole('button',{name:'Read document source 1: Warranty.txt, page 1',exact:true}).waitFor();
assert.equal(await page.locator('textarea[placeholder="Message Lumen…"]:visible').inputValue(),'','sent document draft does not return on reload');
const chatPicker=page.waitForEvent('filechooser');
await page.getByRole('button',{name:'Attach document',exact:true}).click();
await(await chatPicker).setFiles({name:'PSU.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nWarranty covers parts for five years.')});
await page.getByText('Using document: PSU.pdf',{exact:true}).waitFor();
const beforeDirect=messages.length;
await page.getByRole('button',{name:'Explain document',exact:true}).click();
assert.equal(messages.length,beforeDirect,'attaching and preparing explanation never sends a message');
assert.equal(await page.locator('textarea[placeholder="Message Lumen…"]:visible').inputValue(),'Explain this document in plain language.');
await page.locator('[aria-label="Send message"]:visible').click();
await page.getByText('Attached PSU document explained. [1]',{exact:true}).waitFor();
assert.equal(messages.at(-2).content,'Explain this document in plain language.');
await page.getByRole('button',{name:'Remove document from prompt',exact:true}).click();
await page.getByText('Using document: PSU.pdf',{exact:true}).waitFor({state:'detached'});
await page.getByRole('button',{name:'Open document library',exact:true}).click();
await page.getByRole('button',{name:'Explain this document',exact:true}).click();
await page.getByText('Using document: PSU.pdf',{exact:true}).waitFor();
await page.getByRole('button',{name:'Remove document from prompt',exact:true}).click();
await page.getByRole('button',{name:'Open document library',exact:true}).click();
await page.getByRole('button',{name:'Delete PSU.pdf',exact:true}).click();
await page.getByRole('button',{name:'Keep document',exact:true}).waitFor();
await page.getByRole('button',{name:'Delete extracted text',exact:true}).click();
await page.getByText('Imported text · 0',{exact:true}).waitFor();
await page.route('http://127.0.0.1:54321/auth/v1/logout**',async route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Auth offline'})}));
await page.goto('http://127.0.0.1:8765/settings');
await page.getByText('Sign out',{exact:true}).click();
await page.waitForURL('**/login');
assert.equal(await page.evaluate(()=>localStorage.getItem('sb-127-auth-token')),null,'expired/offline logout clears browser token');
await browser.close();server.close();console.log('Prompt PDF attachment, natural document explanation, selected ID transport, removal, grouped web citations, document upload/search/page inspection, draft-only chat question, saved document citations, deletion and mobile logout passed.');})().catch(e=>{console.log(e);server.close();process.exit(1)});
