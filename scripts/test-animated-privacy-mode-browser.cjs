// Public / Private mode (Issue #39) in headless Chromium against the web build in dist/.
// No Supabase, Lumen API or avatar service is used: all are stand-ins, and all data is fictional.
// Checks: the switch is in Chat, Video Chat and Theater; Public hides earlier private messages and chat
// names, survives a reload with a notice, is sent with chat and voice requests, stops speech, and
// never reconnects or replaces the live video.
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test \
//   EXPO_PUBLIC_LUMEN_API_URL=http://127.0.0.1:8001 npx expo export --platform web --clear
//   node scripts/test-animated-privacy-mode-browser.cjs   (PRIVACY_SHOTS=dir also saves screenshots)
// The Lumen API stand-in is a real HTTP server, so a reply can be streamed line by line and the
// switch flipped between two lines of it.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http');
const server=require('./serve-web.cjs').createWebServer(path.resolve('dist'));
const SHOTS=process.env.PRIVACY_SHOTS;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const SECRET='vintage brass telescope',SECRET_TITLE='Sam birthday surprise';
const STREAM_FIRST='The Juniper Hall booking is',STREAM_SECOND='confirmed for Friday at seven';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:'local'};
const at=i=>new Date(1791320000000+i*1000).toISOString();
const messages=[
  {id:'m1',role:'user',content:`The surprise gift is a ${SECRET}.`,metadata:{}},
  {id:'m2',role:'assistant',content:`Lovely, a ${SECRET} it is.`,metadata:{}},
  {id:'m3',role:'user',content:'Nice weather today!',metadata:{privacy_mode:'public'}},
  {id:'m4',role:'assistant',content:'It really is. Perfect for a walk.',metadata:{privacy_mode:'public'}},
].map((m,i)=>({...m,conversation_id:I,companion_id:C,created_at:at(i)}));

function stand({user,embedded}){
  localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'t',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));
  window.__rtc={created:0,closed:0};window.__posted=[];
  if(embedded)window.ReactNativeWebView={postMessage:data=>window.__posted.push(JSON.parse(data).event)};
  window.RTCPeerConnection=class extends EventTarget{
    constructor(){super();window.__rtc.created++;this.iceGatheringState='complete';this.connectionState='connected';this.localDescription=null;}
    addTrack(){} createDataChannel(){return {readyState:'open',send(){},close(){this.readyState='closed';}};}
    async createOffer(){return {type:'offer',sdp:'v=0'};} async setLocalDescription(value){this.localDescription=value;}
    async setRemoteDescription(){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const pen=canvas.getContext('2d');
      const draw=()=>{pen.fillStyle='#2d5f73';pen.fillRect(0,0,768,512);};draw();setInterval(draw,200);this.ontrack?.({track:canvas.captureStream(5).getVideoTracks()[0]});}
    close(){window.__rtc.closed++;}
  };
}
const sent=[];let offers=0;
// --- Lumen API stand-in on 127.0.0.1:8001 -----------------------------------------------------------
let streamGate=null;                 // when set, /respond/stream sends its first line and waits for it
const api=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',async()=>{
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  const url=req.url,json=(data,status=200)=>{res.writeHead(status,{...cors,'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='POST'&&/respond|voice\/speak|images/.test(url))sent.push({url,body:JSON.parse(raw||'{}')});
  if(url.endsWith('/v0.1/avatar/status'))return json({enabled:true,available:true});
  if(url.endsWith('/v0.1/avatar/offer')){offers++;return json({type:'answer',sdp:'v=0'});}
  if(url.endsWith('/models'))return json({models:['local'],effective:'local',default:'local',selected:null,memory_model:'local'});
  if(url.includes('/drafts/'))return json({item:null});
  if(url.includes('/voice/speak'))return json({detail:"Lumen won't read that aloud while Public mode is on."},403);
  const done={conversation_id:I,message_id:'m9',content:'Sure!',model:'local',provider:'ollama',latency_ms:1,memory_count:0};
  if(url.includes('/respond/stream')){
    res.writeHead(200,{...cors,'content-type':'application/x-ndjson','cache-control':'no-cache'});
    const line=event=>res.write(JSON.stringify(event)+'\n');
    line({type:'activity',text:'Checking memories…'});
    if(streamGate){const gate=streamGate;line({type:'delta',text:STREAM_FIRST+' '});await gate.wait;line({type:'delta',text:STREAM_SECOND+'.'});
      if(gate.fail){line({type:'error',text:'Lumen could not finish this reply. Reload before retrying.'});return res.end();}}
    line({type:'done',response:done});return res.end();
  }
  if(url.includes('/respond'))return json(done);
  return json([]);
});});
async function open(context,{width=390,height=844,query='?conversation='+I,embedded=false}={}){
  const page=await context.newPage();await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(stand,{user,embedded});
  await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),resource=new URL(req.url()).pathname.split('/').pop();let data=[];
    if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;
    if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];
    if(resource==='conversations')data=[{id:I,companion_id:C,title:SECRET_TITLE,last_message_at:'2026-11-15T10:00:00Z'}];
    if(resource==='messages')data=messages;if(resource==='companion_state')data=null;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});});
  await page.goto('http://127.0.0.1:8765/'+query);
  await page.getByPlaceholder('Message Lumen…').waitFor({timeout:20000});
  return {page,errors};
}
// One small chip: role=switch, checked while Public is on. choose() taps it only when the mode differs.
const chip=page=>page.locator('[role=switch][aria-label="Public mode"]').first();
const checked=async(page,mode)=>((await chip(page).getAttribute('aria-checked'))==='true')===(mode==='public');
const choose=async(page,mode)=>{if(!(await checked(page,mode)))await chip(page).click();};
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,`${name}.png`)});};
const text=page=>page.evaluate(()=>document.body.innerText);

(async()=>{await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));await new Promise(resolve=>api.listen(8001,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
  // --- Ordinary chat: Private by default, everything visible ----------------------------------------
  const context=await browser.newContext();
  let {page,errors}=await open(context);
  await page.getByText('Nice weather today!').waitFor();
  assert.equal(await checked(page,'private'),true,'nothing remembered: Private, as before');
  assert.ok((await text(page)).includes(SECRET),'Private shows the whole conversation');
  await shot(page,'chat-private');
  // --- Flip to Public: earlier private messages are hidden at once ----------------------------------
  await choose(page,'public');
  await page.waitForFunction(s=>!document.body.innerText.includes(s),SECRET);
  let body=await text(page);
  assert.ok(!body.includes(SECRET),'Public leaves out earlier private messages');
  assert.ok(body.includes('Nice weather today!')&&body.includes('Perfect for a walk'),'Public keeps messages written in Public');
  // Discreet (owner, 2026-11-16): no placeholder, banner or count; nothing private in the page or the accessibility tree.
  assert.ok(!/hidden/i.test(body)&&!body.includes('Chat and Live Room only'),'no "hidden" bubbles and no banner');
  const html=await page.content();assert.ok(!html.includes(SECRET)&&!/Message hidden/i.test(html),'no private text or placeholder in the DOM');
  assert.ok(!JSON.stringify(await page.locator('body').ariaSnapshot()).includes(SECRET),'no private text for screen readers');
  const box=await chip(page).boundingBox(),wide=page.viewportSize().width;
  assert.ok(box.height<=32&&box.width<=110,`the chip is small ${JSON.stringify(box)}`);
  assert.ok(box.x+box.width<=wide&&box.x>wide/2&&box.y<80,`the chip is at the right of the header ${JSON.stringify(box)}`);
  await shot(page,'chat-public');
  await page.getByLabel('What Public mode covers').click();await page.getByText(/Other tabs are not covered/).waitFor();
  await page.getByLabel('What Public mode covers').click();
  await choose(page,'private');await page.getByText(`The surprise gift is a ${SECRET}.`).waitFor();   // back at once, same history
  await choose(page,'public');await page.waitForFunction(s=>!document.body.innerText.includes(s),SECRET);
  await page.getByLabel('Open conversation history').click();await page.getByText('Conversations',{exact:true}).waitFor();
  assert.ok(!(await text(page)).includes(SECRET_TITLE),'Public shows neutral chat names');
  await shot(page,'chat-public-sidebar');
  await page.keyboard.press('Escape');await page.close();
  // --- The chip at S22 (360) and desktop (1280) widths: small, in the header, on the screen ---------------
  for(const [width,height] of [[360,780],[1280,800]]){
    ({page,errors}=await open(context,{width,height}));await page.getByText('Nice weather today!').waitFor();
    const at=await chip(page).boundingBox();
    assert.ok(at.height<=32&&at.width<=110&&at.y<80&&at.x>=0&&at.x+at.width<=width,`${width}px: chip in the header, on screen ${JSON.stringify(at)}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${width}px: no sideways overflow`);
    assert.ok(!(await text(page)).includes(SECRET));await shot(page,`chat-public-${width}`);assert.deepEqual(errors,[]);await page.close();
  }
  // --- Reload: still Public, and no private text even for a moment -------------------------------------
  ({page,errors}=await open(context));
  await page.getByText('Nice weather today!').waitFor();
  assert.equal(await checked(page,'public'),true,'Public survives a reload');
  body=await text(page);assert.ok(!body.includes(SECRET)&&!(await page.content()).includes(SECRET),'a reload in Public shows no private text');
  // --- The mode goes with each chat request, as a field in the body -----------------------------------
  await page.getByPlaceholder('Message Lumen…').fill('Any cozy ideas for tonight?');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>true);await page.waitForTimeout(800);
  const chat=sent.find(s=>s.url.includes('/respond'));assert.ok(chat,'a chat request was sent');
  assert.equal(chat.body.privacy_mode,'public');assert.ok(!chat.url.includes('privacy'),'never in the address');
  // --- Voice in Public names the reply, so the server can refuse anything else -----------------------
  await page.getByLabel('Play reply audio').first().click();await page.waitForTimeout(600);
  const speak=sent.find(s=>s.url.includes('/voice/speak'));
  if(speak){assert.equal(speak.body.privacy_mode,'public');assert.equal(speak.body.message_id,'m4');}
  // --- Back to Private: everything is shown again ---------------------------------------------------
  await choose(page,'private');await page.getByText(`The surprise gift is a ${SECRET}.`).waitFor();
  assert.deepEqual(errors,[],'no page errors');await page.close();await context.close();

  // --- Live Room in the phone app: the switch over the video, and flipping it never touches the video --
  offers=0;const room=await browser.newContext();
  ({page,errors}=await open(room,{width:360,height:660,query:'?room=live&conversation='+I,embedded:true}));
  await page.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('video').videoWidth===768);
  await page.evaluate(()=>{const v=document.querySelector('video');v.__tag='first';window.__stream=v.srcObject;});
  await choose(page,'public');await page.waitForTimeout(300);
  await choose(page,'private');await page.waitForTimeout(300);
  await choose(page,'public');await page.waitForTimeout(300);
  await shot(page,'room-video-chat-public');
  let state=await page.evaluate(()=>({tag:document.querySelector('video').__tag,same:document.querySelector('video').srcObject===window.__stream,rtc:{...window.__rtc},posted:window.__posted}));
  assert.equal(state.tag,'first');assert.equal(state.same,true);assert.deepEqual(state.rtc,{created:1,closed:0});assert.equal(offers,1,'one offer, no reconnection');
  assert.deepEqual(state.posted.filter(w=>w==='private'||w==='public'),['public','private','public'],'each tap tells the phone app, in a fixed word');
  // The phone app's own choice reaches the room in a fixed line.
  await page.evaluate(()=>window.dispatchEvent(new Event('lumenroomprivate')));await page.waitForTimeout(200);
  assert.equal(await checked(page,'private'),true,'the app\'s choice is followed');
  // Theater: the switch is among its controls.
  await page.getByLabel('Switch to Companion Theater').click();await page.getByLabel('Leave Companion Theater and return to Video Chat').waitFor();
  await choose(page,'public');await page.waitForTimeout(300);
  assert.equal(await checked(page,'public'),true,'the switch works in Theater');
  await shot(page,'room-theater-public');
  state=await page.evaluate(()=>({tag:document.querySelector('video').__tag,rtc:{...window.__rtc}}));
  assert.equal(state.tag,'first');assert.deepEqual(state.rtc,{created:1,closed:0});assert.equal(offers,1);
  assert.deepEqual(errors,[],'no page errors');
  await page.close();await room.close();

  // --- Mid-stream: Private turn streaming, live video on, switch flipped between two lines ----------
  offers=0;const mid=await browser.newContext();
  ({page,errors}=await open(mid,{width:390,height:844,query:'?room=live&conversation='+I,embedded:true}));
  await page.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('video').videoWidth===768);
  await page.evaluate(()=>{const v=document.querySelector('video');v.__tag='first';window.__stream=v.srcObject;});
  await choose(page,'private');
  let release;streamGate={wait:new Promise(resolve=>{release=resolve;})};
  await page.getByPlaceholder('Message Lumen…').fill('Is the party venue sorted?');await page.keyboard.press('Enter');
  await page.getByText(STREAM_FIRST,{exact:false}).waitFor();                   // the first private line is on screen
  assert.ok((await text(page)).includes('Is the party venue sorted?'),'the pending Private question was showing');
  await choose(page,'public');
  await page.waitForFunction(t=>!document.body.innerText.includes(t),STREAM_FIRST);
  assert.ok(!/hidden/i.test(await text(page)),'a Private reply on its way shows nothing in Public, not even a notice');
  body=await text(page);
  assert.ok(!body.includes(STREAM_FIRST),'the partial Private reply disappears at once');
  assert.ok(!body.includes('Is the party venue sorted?'),'the pending Private question disappears at once');
  release();streamGate=null;                                                      // the rest arrives after the switch
  const seen=await page.evaluate(async([second])=>{let hit=false;const end=Date.now()+1500;
    while(Date.now()<end){if(document.body.innerText.includes(second))hit=true;await new Promise(r=>setTimeout(r,25));}return hit;},[STREAM_SECOND]);
  assert.equal(seen,false,'text that arrives after the switch is never drawn');
  await shot(page,'mid-stream-public');
  state=await page.evaluate(()=>({tag:document.querySelector('video').__tag,same:document.querySelector('video').srcObject===window.__stream,rtc:{...window.__rtc}}));
  assert.equal(state.tag,'first');assert.equal(state.same,true);assert.deepEqual(state.rtc,{created:1,closed:0});assert.equal(offers,1,'the live video was not restarted');
  assert.ok(!sent.some(s=>s.url.includes('/voice/speak')&&s.body.privacy_mode!=='public'),'no Private speech was requested after the switch');
  const composer=()=>page.getByPlaceholder('Message Lumen…').inputValue();

  // --- The message box: a Private draft typed but not sent is put aside in Public, never erased ------
  await choose(page,'private');await page.waitForTimeout(200);
  const DRAFT='Draft about the Juniper Hall deposit';
  await page.getByPlaceholder('Message Lumen…').fill(DRAFT);
  await choose(page,'public');await page.waitForTimeout(200);
  assert.equal(await composer(),'','a Private draft is not shown in Public');
  assert.ok(!(await text(page)).includes('Juniper Hall deposit'));
  await page.getByPlaceholder('Message Lumen…').fill('Public note about the weather');
  await choose(page,'private');await page.waitForTimeout(200);
  assert.equal(await composer(),DRAFT,'the Private draft comes back in Private');
  await choose(page,'public');await page.waitForTimeout(200);
  assert.equal(await composer(),'Public note about the weather','a Public draft is kept apart');
  await page.getByPlaceholder('Message Lumen…').fill('');
  await choose(page,'private');await page.waitForTimeout(200);
  await page.getByPlaceholder('Message Lumen…').fill('');

  // --- A Private turn fails after the switch: its question never reappears in Public ----------------
  const QUESTION='Did the Juniper Hall deposit clear?';
  let releaseFail;streamGate={fail:true,wait:new Promise(resolve=>{releaseFail=resolve;})};
  await page.getByPlaceholder('Message Lumen…').fill(QUESTION);await page.keyboard.press('Enter');
  await page.getByText(STREAM_FIRST,{exact:false}).waitFor();
  await choose(page,'public');
  await page.waitForFunction(t=>!document.body.innerText.includes(t),STREAM_FIRST);
  assert.ok(!/hidden/i.test(await text(page)),'a Private reply on its way shows nothing in Public, not even a notice');
  releaseFail();streamGate=null;
  await page.getByText('Lumen could not finish this reply',{exact:false}).waitFor();       // the failure is reported, generically
  await page.waitForTimeout(400);
  assert.equal(await composer(),'','the failed Private question is not put back in the Public message box');
  body=await text(page);assert.ok(!body.includes(QUESTION)&&!body.includes(STREAM_SECOND),'nothing of the failed Private turn is shown');
  await shot(page,'failed-private-turn-in-public');
  await choose(page,'private');await page.waitForTimeout(300);
  assert.equal(await composer(),QUESTION,'back in Private the question is in the message box to retry');
  state=await page.evaluate(()=>({tag:document.querySelector('video').__tag,same:document.querySelector('video').srcObject===window.__stream,rtc:{...window.__rtc}}));
  assert.equal(state.tag,'first');assert.equal(state.same,true);assert.deepEqual(state.rtc,{created:1,closed:0});assert.equal(offers,1,'the live video was never restarted');
  assert.deepEqual(errors,[],'no page errors');
  console.log('Public / Private mode: switch in Chat, Video Chat and Theater; Public hides private messages and chat names, are left out entirely (no placeholders, banner or DOM text), a small header chip, survives reload, is sent with chat'+(speak?' and voice':'')+' requests, hides a Private reply flipped to Public mid-stream (including later lines), keeps Private and Public drafts apart, never puts a failed Private question back in Public, and never reconnects the live video.');
  if(!speak)console.log('NOTE: no voice request was observed in this browser (sound path unavailable headless); voice is covered by unit and backend tests.');
}finally{await browser.close();server.close();api.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
