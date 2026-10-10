const assert=require('node:assert/strict');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(require('node:path').resolve('dist'));
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333',M='44444444-4444-4444-8444-444444444444',R='55555555-5555-4555-8555-555555555555';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-10T00:00:00Z'};
const companion={id:C,name:'Raialume',portrait_url:null,persona:{},conversation_model:'chosen',created_at:'2026-10-10T00:00:00Z'};
const revision={id:R,kind:'correction',before_content:'My favorite color is red',after_content:'My favorite color is blue',undone_at:null};
const messages=[{id:M,companion_id:C,conversation_id:I,role:'assistant',content:'Thanks for correcting me.',created_at:'2026-10-10T00:00:00Z',metadata:{memory_revision:{id:R,kind:'correction'}}}];
let undoCalls=0,failUndo=false,hideRevision=false;
(async()=>{await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user})),{user});
 await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),url=new URL(req.url()),resource=url.pathname.split('/').pop();let result=[];
  if(resource==='user')result=user;if(resource==='ensure_my_companion')result=C;
  if(resource==='companions')result=req.headers()['accept']?.includes('object')?companion:[companion];
  if(resource==='conversations')result=[{id:I,companion_id:C,title:'Memory correction',last_message_at:'2026-10-10T00:00:00Z'}];
  if(resource==='messages')result=messages;if(resource==='companion_state')result=null;
  if(resource==='memory_revisions')result=hideRevision?null:revision;
  if(resource==='undo_memory_correction'){
   undoCalls++;assert.deepEqual(req.postDataJSON(),{p_id:R});
   if(failUndo){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Memory changed'})});return;}
   revision.undone_at='2026-10-10T19:00:00Z';result=revision;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('http://127.0.0.1:8001/**',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({effort_supported:true,models:['chosen'],effective:'chosen'})}));
 await page.goto('http://127.0.0.1:8765/?conversation='+I);
 await page.getByText('Memory corrected',{exact:true}).waitFor();
 await page.getByRole('button',{name:'View change',exact:true}).click();
 await page.getByText(/Incorrect earlier entry: My favorite color is red/).waitFor();
 failUndo=true;await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.getByText(/Could not undo. The memory may have changed/).waitFor();
 assert.equal(await page.getByText('Memory correction undone',{exact:true}).count(),0);
 failUndo=false;await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.getByText('Memory correction undone',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).count(),0);assert.equal(undoCalls,2);
 await page.reload();await page.getByText('Memory correction undone',{exact:true}).waitFor();
 revision.kind='change';revision.undone_at=null;
 await page.reload();await page.getByText('Memory updated · changed over time',{exact:true}).waitFor();
 await page.getByRole('button',{name:'View change',exact:true}).click();await page.getByText(/Previously: My favorite color is red/).waitFor();
 hideRevision=true;await page.reload();await page.getByText('Thanks for correcting me.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: mobile correction receipt, history labels, failed Undo, confirmed Undo, reload and unavailable revision.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exit(1);});
