// Local image and video generation in headless Chromium against the web build in dist/.
// No Supabase, Lumen API or Heavy service is used: all are stand-ins, and all data is fictional.
// Checks: a video request naming "image" is sent to chat, not the image endpoint; a video job shows live progress in Chat and then plays; a saved video attachment plays;
// job status is only requested in Private; Gallery shows videos in Private and reads nothing in Public.
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test \
//   EXPO_PUBLIC_LUMEN_API_URL=http://127.0.0.1:8001 npx expo export --platform web --clear
//   node scripts/test-animated-media-generation-browser.cjs   (MEDIA_SHOTS=dir also saves screenshots)
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(path.resolve('dist'));
const SHOTS=process.env.MEDIA_SHOTS;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const JOB='44444444-4444-4444-8444-444444444444';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'local'};
const at=i=>new Date(1791320000000+i*1000).toISOString();
const messages=[
  {id:'m1',role:'user',content:'Make a short video of a lantern on a lake',metadata:{}},
  {id:'m2',role:'assistant',content:"I'm making a 5-second video now.",metadata:{media_job:{id:JOB,status:'queued',mode:'t2i2v',seconds:5}}},
  {id:'m3',role:'user',content:'And an older one',metadata:{}},
  {id:'m4',role:'assistant',content:'Here it is.',metadata:{generated_video:true,attachments:[{path:`${U}/old.mp4`,mime_type:'video/mp4'}],media_job:{id:'old',status:'completed'}}},
].map((m,i)=>({...m,conversation_id:I,companion_id:C,created_at:at(i)}));
const gallery=[{id:'g1',companion_id:C,conversation_id:I,source:'companion',category:'companion_sent',media_type:'video',url:`${U}/old.mp4`,caption:'Lantern on a lake',metadata:{storage_path:`${U}/old.mp4`,generated_video:true},created_at:at(9)}];
function stand({user,mode}){
  localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'t',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));
  if(mode)localStorage.setItem('lumen.privacyMode.v1',mode);
}
const jobRequests=[],sends=[];let polls=0;
const api=http.createServer((req,res)=>{const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  const json=(data,status=200)=>{res.writeHead(status,{...cors,'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='POST'&&/\/(respond|images\/generate)/.test(req.url)){sends.push(req.url.split('?')[0]);return json({detail:'test stop'},503);}
  if(req.url.includes('/v0.3/media/jobs/')){jobRequests.push(req.url);polls++;
    if(!req.url.includes('privacy_mode=private'))return json({detail:'hidden'},403);
    return json(polls<2?{id:JOB,status:'running',progress:42,stage:'Animating…',mode:'t2i2v',duration_seconds:5,result_path:null,result_mime_type:null,error:null,message_id:'m2'}
      :{id:JOB,status:'completed',progress:100,stage:'Ready',mode:'t2i2v',duration_seconds:5,result_path:`${U}/new.mp4`,result_mime_type:'video/mp4',error:null,message_id:'m2'});}
  if(req.url.endsWith('/models'))return json({models:['local'],effective:'local',default:'local',selected:null,memory_model:'local'});
  if(req.url.includes('/avatar/status'))return json({enabled:false,available:false});
  return json([]);});
const galleryReads=[];
async function open(context,{mode,url='?conversation='+I,ready='Message Lumen…'}){
  const page=await context.newPage();await page.setViewportSize({width:390,height:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(stand,{user,mode});
  await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),pathname=new URL(req.url()).pathname,resource=pathname.split('/').pop();let data=[];
    if(pathname.includes('/storage/v1/object/sign/'))data={signedURL:pathname.replace('/storage/v1','')+'?token=t'};
    else if(pathname.includes('/storage/v1/object/'))return route.fulfill({status:200,contentType:'video/mp4',body:Buffer.alloc(0)});
    if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;
    if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];
    if(resource==='conversations')data=[{id:I,companion_id:C,title:'Lantern',last_message_at:'2026-11-15T10:00:00Z'}];
    if(resource==='messages')data=messages;if(resource==='companion_state')data=null;
    if(resource==='gallery_items'){galleryReads.push(req.url());data=gallery;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});});
  await page.goto('http://127.0.0.1:8765/'+url);
  return {page,errors};
}
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,`${name}.png`)});};
(async()=>{await new Promise(r=>server.listen(8765,'127.0.0.1',r));await new Promise(r=>api.listen(8001,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
  // --- Private chat: progress, then the finished video plays in the same bubble ----------------------
  let context=await browser.newContext();
  let {page,errors}=await open(context,{mode:'private'});
  await page.getByPlaceholder('Message Lumen…').waitFor({timeout:20000});
  await page.getByText(/Animating… 42%/).waitFor({timeout:10000});
  await shot(page,'chat-video-progress');
  assert.ok(jobRequests.every(u=>u.includes('privacy_mode=private')),'job status asked for Private only');
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.src.includes('new.mp4')),null,{timeout:15000});
  const sources=await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>v.getAttribute('src')));
  assert.ok(sources.some(s=>s.includes('old.mp4')),'a saved video attachment plays in chat');
  assert.ok(sources.every(s=>s.includes('token=')),'videos use signed private links');
  await shot(page,'chat-video-ready');
  assert.deepEqual(errors,[]);await page.close();
  // --- Gallery in Private shows the video ------------------------------------------------------------
  ({page,errors}=await open(context,{mode:'private',url:'gallery'}));
  await page.getByText('Lantern on a lake').waitFor({timeout:20000});
  await page.getByText('Lantern on a lake').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.src.includes('old.mp4')),null,{timeout:10000});
  await shot(page,'gallery-private-video');
  assert.deepEqual(errors,[]);await page.close();
  // --- Live failure 2026-11-16: a video request that names "image" goes to chat, never to the image endpoint
  const LIVE='Make a 3-second video animating the image you just generated. Use gentle, natural movement.';
  for(const [text,expected] of [[LIVE,/\/respond/],['Create an image of a lighthouse at dusk',/\/v0\.2\/images\/generate$/]]){
    sends.length=0;({page,errors}=await open(context,{mode:'private'}));
    const box=page.getByPlaceholder('Message Lumen…');await box.waitFor({timeout:20000});
    await box.fill(text);await box.press('Enter');
    for(let i=0;i<50&&!sends.length;i++)await page.waitForTimeout(100);
    assert.equal(sends.length,1,`one request for: ${text}`);assert.match(sends[0],expected,text);
    if(text===LIVE)assert.ok(!sends.some(u=>u.includes('images/generate')),'a video request never reaches the image endpoint');
    await page.close();
  }
  await context.close();
  // --- Public: Gallery reads nothing; chat never asks for job status ---------------------------------
  galleryReads.length=0;jobRequests.length=0;
  context=await browser.newContext();
  ({page,errors}=await open(context,{mode:'public',url:'gallery'}));
  await page.getByText('Gallery opens in 🔒 Private.').waitFor({timeout:20000});
  assert.ok(!/hidden/i.test(await page.evaluate(()=>document.body.innerText)),'Public Gallery is a quiet empty page');
  await page.waitForTimeout(800);
  assert.deepEqual(galleryReads,[],'Public never reads gallery_items');
  assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Lantern on a lake'));
  await shot(page,'gallery-public-locked');
  await page.close();
  ({page,errors}=await open(context,{mode:'public'}));
  await page.getByPlaceholder('Message Lumen…').waitFor({timeout:20000});await page.waitForTimeout(1500);
  assert.deepEqual(jobRequests,[],'Public never asks for video job status');
  assert.equal(await page.locator('video').count(),0,'no private video is shown in Public');
  assert.deepEqual(errors,[]);
  console.log('media generation browser checks: PASS');
}finally{await browser.close();server.close();api.close();}})().catch(e=>{console.error(e);process.exit(1);});
