// Live Room UI regression (Video Chat + Companion Theater), in headless Chromium against the web
// build in dist/. No device, avatar service, Supabase or Lumen API is used: WebRTC, the account and
// the API are stand-ins. What is checked is layout and continuity: one connection and one <video>
// element across every view change, the whole 3:2 frame, a reachable message box, no tab bar.
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test \
//   EXPO_PUBLIC_LUMEN_API_URL=http://127.0.0.1:8001 npx expo export --platform web
//   node scripts/test-live-room-browser.cjs            (LIVE_ROOM_SHOTS=dir also saves screenshots)
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.LUMEN_PLAYWRIGHT_MODULE||'playwright');
const server=require('./serve-web.cjs').createWebServer(path.resolve('dist'));
const SHOTS=process.env.LIVE_ROOM_SHOTS;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const LONG_MODEL='a-very-long-model-identifier-that-used-to-crowd-the-header:latest';
const user={id:U,aud:'authenticated',role:'authenticated',email:'test@example.test',user_metadata:{display_name:'Test'},app_metadata:{provider:'email'},created_at:'2026-10-06T00:00:00Z'};
const companion={id:C,name:'Lumen',created_at:'2026-10-06T00:00:00Z',portrait_url:null,persona:{},conversation_model:LONG_MODEL};
const messages=Array.from({length:30},(_,i)=>({id:`message-${i}`,conversation_id:I,companion_id:C,role:i%2?'assistant':'user',content:`Message ${i}. `+(i%2?'A complete answer that should stay inside the conversation window. '.repeat(8):'Please continue our conversation.'),metadata:{},created_at:new Date(1791320000000+i*1000).toISOString()}));
// The account's own appearance: charcoal and amber, not the default navy.
const appearance={scheme_id:'gold-dark',appearance:{background:'#1c1c1e',text:'#f2f2f2',accent:'#ffb000'}};
const CHARCOAL='rgb(28, 28, 30)',AMBER='rgb(255, 176, 0)';

// A stand-in for WebRTC that counts connections and hands the page a real 768x512 (3:2) picture.
function fakeRtc({user,embedded}){
  localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'t',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));
  window.__rtc={created:0,closed:0};window.__posted=[];
  if(embedded)window.ReactNativeWebView={postMessage:data=>window.__posted.push(JSON.parse(data).event)};
  window.RTCPeerConnection=class extends EventTarget{
    constructor(){super();window.__rtc.created++;this.iceGatheringState='complete';this.connectionState='connected';this.localDescription=null;}
    addTrack(){} createDataChannel(){return {readyState:'open',send(){},close(){this.readyState='closed';}};}
    async createOffer(){return {type:'offer',sdp:'v=0'};} async setLocalDescription(value){this.localDescription=value;}
    async setRemoteDescription(){
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const pen=canvas.getContext('2d');
      const draw=()=>{pen.fillStyle='#6a4fb3';pen.fillRect(0,0,768,512);pen.fillStyle='#ffe9a8';pen.fillRect(0,0,24,24);pen.fillRect(744,488,24,24);pen.fillRect(744,0,24,24);pen.fillRect(0,488,24,24);};
      draw();setInterval(draw,200);const stream=canvas.captureStream(5);this.ontrack?.({track:stream.getVideoTracks()[0]});
    }
    close(){window.__rtc.closed++;}
  };
}
let offers=0;
async function open(browser,{width,height,query='?room=live&conversation='+I,embedded=true}){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(fakeRtc,{user,embedded});
  await page.route('http://127.0.0.1:54321/**',async route=>{const req=route.request(),resource=new URL(req.url()).pathname.split('/').pop();let data=[];
    if(resource==='user')data=user;if(resource==='ensure_my_companion')data=C;
    if(resource==='companions')data=req.headers()['accept']?.includes('object')?companion:[companion];
    if(resource==='conversations')data=[{id:I,companion_id:C,title:'Long chat',last_message_at:'2026-10-06T00:00:00Z'}];
    if(resource==='messages')data=messages;if(resource==='companion_state')data=null;
    if(resource==='user_appearance_preferences')data=req.method()==='GET'?appearance:[];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});});
  await page.route('http://127.0.0.1:8001/**',async route=>{const url=route.request().url();let data=[];
    if(url.endsWith('/v0.1/avatar/status'))data={enabled:true,available:true};
    if(url.endsWith('/v0.1/avatar/offer')){offers++;data={type:'answer',sdp:'v=0'};}
    if(url.endsWith('/models'))data={models:[LONG_MODEL],effective:LONG_MODEL,default:LONG_MODEL,selected:null,memory_model:LONG_MODEL};
    if(url.includes('/drafts/'))data={item:null};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});});
  await page.goto('http://127.0.0.1:8765/'+query);
  await page.getByPlaceholder('Message Lumen…').waitFor({timeout:20000});
  return {page,errors};
}
// Everything measured in one pass, in CSS pixels.
const measure=page=>page.evaluate(()=>{
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return r.width&&r.height?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null;};
  const video=document.querySelector('video');const composer=document.querySelector('textarea');
  const list=[...document.querySelectorAll('[data-testid=conversation-panel] div')].find(e=>getComputedStyle(e).overflowY==='auto');
  const named=label=>rect(document.querySelector(`[aria-label="${label}"]`));
  return {width:innerWidth,height:innerHeight,pageWidth:document.scrollingElement.scrollWidth,pageHeight:document.scrollingElement.scrollHeight,
    video:rect(video),fit:video?getComputedStyle(video).objectFit:null,source:video?[video.videoWidth,video.videoHeight]:null,tag:video?video.__tag:null,sameStream:video?video.srcObject===window.__stream:null,
    composer:rect(composer),list:rect(list),listScrolls:list?list.scrollHeight>list.clientHeight:false,
    back:named('Close live video and return to the chat'),theater:named('Switch to Companion Theater'),more:named('More actions'),live:named('Live video'),
    documents:named('Open your documents'),practice:named('Open goals and practice'),leave:named('Leave Companion Theater and return to Video Chat'),
    tabs:document.querySelectorAll('[role=tab]').length,rtc:{...window.__rtc}};});
const inside=(box,m,what)=>{assert.ok(box,`${what} is shown`);assert.ok(box.top>=-0.5&&box.bottom<=m.height+0.5&&box.left>=-0.5&&box.right<=m.width+0.5,`${what} is inside the window: ${JSON.stringify(box)} in ${m.width}x${m.height}`);};
const whole32=(m,what)=>{assert.ok(Math.abs(m.video.width/m.video.height-1.5)<0.01,`${what}: the box is 3:2 (${m.video.width}x${m.video.height})`);assert.equal(m.fit,'contain',`${what}: the picture is shown whole, never cropped`);assert.deepEqual(m.source,[768,512]);};
const oneSession=(m,what)=>{assert.equal(m.tag,'first',`${what}: still the very same <video> element`);assert.equal(m.sameStream,true,`${what}: still the same stream`);assert.deepEqual(m.rtc,{created:1,closed:0},`${what}: one connection, never closed`);assert.equal(offers,1,`${what}: one offer to the server, no reconnection`);};

(async()=>{await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
  for(const [width,height] of [[320,568],[360,660],[390,844],[412,915]]){
    offers=0;const {page,errors}=await open(browser,{width,height});const at=`${width}x${height}`;
    const shot=async name=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,`${width}-${name}.png`)});};
    // --- Video Chat: opened by the room itself, once ---
    await page.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('video').videoWidth===768);
    await page.getByText('Message 29.',{exact:false}).waitFor();await page.waitForTimeout(400);
    await page.evaluate(()=>{const video=document.querySelector('video');video.__tag='first';window.__stream=video.srcObject;});
    let m=await measure(page);
    assert.equal(m.tabs,0,`${at}: no website tab bar inside the room`);
    assert.equal(m.pageWidth<=m.width&&m.pageHeight<=m.height+1,true,`${at}: the page itself never scrolls`);
    for(const name of ['back','theater','more','live','documents','practice'])inside(m[name],m,`${at} ${name}`);
    inside(m.video,m,`${at} video`);inside(m.composer,m,`${at} message box`);whole32(m,`${at} Video Chat`);
    assert.ok(m.video.height<=m.height*0.38+1,`${at}: the video leaves most of the height to the conversation`);
    assert.ok(m.listScrolls&&m.list.height>=90,`${at}: the conversation scrolls in its own region (${m.list?.height}px)`);
    // Top to bottom, nothing on top of anything else: header, buttons, video, conversation, message box.
    assert.ok(m.back.bottom<=m.live.top+0.5&&m.live.bottom<=m.video.top+0.5&&m.video.bottom<=m.list.top+0.5&&m.list.bottom<=m.composer.top+0.5,`${at}: header, buttons, video, conversation and message box do not overlap`);
    // Real buttons: a visible outline and a comfortable target, not adjacent words.
    for(const label of ['Live video','Open your documents','Open goals and practice']){
      const look=await page.locator(`[aria-label="${label}"]`).evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {border:parseFloat(s.borderTopWidth),radius:parseFloat(s.borderTopLeftRadius),height:r.height};});
      assert.ok(look.border>=1&&look.radius>=12&&look.height>=40,`${at}: ${label} is a real button ${JSON.stringify(look)}`);}
    assert.equal(await page.getByRole('switch',{name:'Live video'}).getAttribute('aria-checked'),'true');
    await page.getByText('Live · On',{exact:true}).waitFor();
    for(const gone of ['Conversation','A conversation that stays with you.','Shrink','Expand','Animated: on',LONG_MODEL])assert.equal(await page.getByText(gone,{exact:true}).count(),0,`${at}: "${gone}" is not in the room`);
    // The account's appearance, read through the existing synchronization.
    assert.equal(await page.evaluate(()=>{let node=document.querySelector('textarea');while(node){const colour=getComputedStyle(node).backgroundColor;if(colour!=='rgba(0, 0, 0, 0)'&&node.getBoundingClientRect().height>=innerHeight-1)return colour;node=node.parentElement;}return null;}),CHARCOAL,`${at}: the room uses the account's background`);
    assert.equal(await page.locator('[aria-label="Live video"]').evaluate(node=>getComputedStyle(node).backgroundColor),AMBER,`${at}: the room uses the account's accent`);
    assert.deepEqual(await page.evaluate(()=>window.__posted.filter(word=>word!=='chat')),['ready']);
    oneSession(m,`${at} Video Chat`);await shot('1-video-chat');

    // --- The keyboard takes half the window: video shrinks, message box stays ---
    await page.setViewportSize({width,height:Math.round(height*0.52)});await page.waitForTimeout(300);
    m=await measure(page);inside(m.composer,m,`${at} keyboard: message box`);inside(m.video,m,`${at} keyboard: video`);whole32(m,`${at} keyboard`);
    assert.ok(m.video.bottom<=m.composer.top+0.5&&m.pageHeight<=m.height+1,`${at} keyboard: nothing overlaps, nothing scrolls away`);
    inside(m.back,m,`${at} keyboard: back`);inside(m.theater,m,`${at} keyboard: Theater`);
    oneSession(m,`${at} keyboard`);await shot('2-keyboard');
    await page.setViewportSize({width,height});await page.waitForTimeout(300);

    // --- Companion Theater ---
    await page.getByRole('button',{name:'Switch to Companion Theater'}).click();await page.getByRole('button',{name:'Leave Companion Theater and return to Video Chat'}).waitFor();await page.waitForTimeout(300);
    m=await measure(page);whole32(m,`${at} Theater`);inside(m.video,m,`${at} Theater video`);oneSession(m,`${at} Theater`);
    assert.ok(m.video.width>=m.width-2,`${at} Theater: the frame is as wide as the window (${m.video.width})`);
    for(const name of ['back','theater','more','live','documents','practice','composer'])assert.equal(m[name],null,`${at} Theater: ${name} is out of the way`);
    assert.equal(m.tabs,0);inside(m.leave,m,`${at} Theater: back to Video Chat`);assert.ok(m.leave.height>=44);
    const toggle=page.getByRole('button',{name:'Show the conversation'});assert.equal(await toggle.getAttribute('aria-expanded'),'false');await shot('3-theater');
    // The messages panel opens under the picture, not over it, with the same message box.
    await toggle.click();await page.getByRole('button',{name:'Hide the conversation'}).waitFor();await page.waitForTimeout(300);
    m=await measure(page);whole32(m,`${at} Theater + messages`);inside(m.video,m,`${at} Theater + messages video`);inside(m.composer,m,`${at} Theater + messages: message box`);
    assert.ok(m.video.bottom<=m.list.top+0.5&&m.listScrolls,`${at} Theater + messages: the conversation is below the picture and scrolls`);
    oneSession(m,`${at} Theater + messages`);await shot('4-theater-messages');
    await page.getByRole('button',{name:'Hide the conversation'}).click();await page.waitForTimeout(200);
    assert.equal((await measure(page)).composer,null,`${at} Theater: the panel collapses again`);
    // Full screen is the whole page in the browser's own full screen (in the phone app that is what hides
    // Android's bars and frees rotation). The phone turned sideways: the frame fills the height, uncropped.
    const full=()=>page.evaluate(()=>document.fullscreenElement===document.documentElement);
    for(const name of ['Leave Companion Theater and return to Video Chat','Show the conversation','Show the video full screen']){
      const box=await page.getByRole('button',{name}).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+0.5&&box.height>=44,`${at} Theater: "${name}" is inside the window`);}
    // The phone turned sideways (what full screen allows in the phone app): the frame fills the height, uncropped.
    await page.setViewportSize({width:height,height:width});await page.waitForTimeout(300);
    m=await measure(page);whole32(m,`${at} sideways`);inside(m.video,m,`${at} sideways video`);oneSession(m,`${at} sideways`);
    assert.ok(m.video.height>=m.height-2,`${at} sideways: the frame is as tall as the screen (${m.video.height} of ${m.height})`);
    inside(m.leave,m,`${at} sideways: back to Video Chat`);await shot('5-sideways');
    await page.getByRole('button',{name:'Show the conversation'}).click();await page.waitForTimeout(300);
    m=await measure(page);whole32(m,`${at} sideways + messages`);inside(m.composer,m,`${at} sideways + messages: message box`);assert.ok(m.video.bottom<=m.composer.top+0.5);
    await page.getByRole('button',{name:'Hide the conversation'}).click();
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    await page.getByRole('button',{name:'Show the video full screen'}).click();await page.getByRole('button',{name:'Leave full screen'}).waitFor();assert.equal(await full(),true);
    m=await measure(page);whole32(m,`${at} full screen`);inside(m.video,m,`${at} full screen video`);oneSession(m,`${at} full screen`);
    // Android Back: first out of full screen (still Theater), and only then to Video Chat.
    await page.evaluate(()=>window.dispatchEvent(new Event('lumenroomback')));await page.getByRole('button',{name:'Show the video full screen'}).waitFor();assert.equal(await full(),false);
    await page.waitForTimeout(300);m=await measure(page);assert.ok(m.leave,`${at}: Back from full screen stays in Theater`);oneSession(m,`${at} out of full screen`);
    // Leaving Theater while full screen leaves full screen too.
    await page.getByRole('button',{name:'Show the video full screen'}).click();await page.getByRole('button',{name:'Leave full screen'}).waitFor();
    await page.getByRole('button',{name:'Leave Companion Theater and return to Video Chat'}).click();await page.getByRole('button',{name:'Switch to Companion Theater'}).waitFor();
    await page.waitForFunction(()=>!document.fullscreenElement);oneSession(await measure(page),`${at} Video Chat from full screen`);
    await page.getByRole('button',{name:'Switch to Companion Theater'}).click();await page.getByRole('button',{name:'Leave Companion Theater and return to Video Chat'}).waitFor();
    // Android Back in Theater (the phone app's one fixed line) returns to Video Chat.
    await page.evaluate(()=>window.dispatchEvent(new Event('lumenroomback')));await page.getByRole('button',{name:'Switch to Companion Theater'}).waitFor();await page.waitForTimeout(300);
    m=await measure(page);oneSession(m,`${at} back in Video Chat`);whole32(m,`${at} back in Video Chat`);inside(m.composer,m,`${at} back: message box`);
    // And again by the on-screen control, several times: still one session.
    for(let round=0;round<3;round++){await page.getByRole('button',{name:'Switch to Companion Theater'}).click();await page.getByRole('button',{name:'Leave Companion Theater and return to Video Chat'}).click();}
    await page.waitForTimeout(200);oneSession(await measure(page),`${at} after repeated switching`);
    // Sending a message does not disturb the video.
    await page.getByPlaceholder('Message Lumen…').fill('Still here?');assert.equal(await page.getByPlaceholder('Message Lumen…').inputValue(),'Still here?');
    // The menu holds the rest: conversations, the browser, the model.
    await page.getByRole('button',{name:'More actions'}).click();await page.getByRole('button',{name:'Conversations',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open in browser ↗',exact:true}).click();
    await page.getByRole('button',{name:'Close live video and return to the chat'}).click();
    assert.deepEqual(await page.evaluate(()=>window.__posted),['chat','ready','theater','chat','theater','chat','theater','chat','theater','chat','theater','chat','browser','close'],`${at}: only the fixed words reach the phone app`);
    // Live off is a real, distinct state; Theater is then unavailable.
    await page.getByRole('switch',{name:'Live video'}).click();await page.getByText('Live · Off',{exact:true}).waitFor();
    m=await measure(page);assert.equal(m.video,null);assert.equal(m.rtc.closed,1);inside(m.composer,m,`${at} live off: message box`);
    assert.equal(await page.getByRole('button',{name:'Companion Theater opens once live video is on'}).isDisabled(),true);
    assert.deepEqual(errors,[],`${at}: no page errors`);await page.close();
  }
  // Outside the room the website is as it was: its tabs, its header, its size choices.
  offers=0;const {page,errors}=await open(browser,{width:390,height:844,query:'?conversation='+I,embedded:false});
  assert.ok(await page.locator('[role=tab]').count()>=3,'the ordinary website keeps its tab bar');
  assert.equal(await page.getByRole('button',{name:'More actions'}).count(),0);
  await page.getByRole('switch',{name:'Animated companion'}).click();await page.getByText('Animated: on',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Expand animated companion'}).waitFor();assert.equal(offers,1);
  assert.deepEqual(errors,[]);await page.close();
  console.log('Live Room: Video Chat, keyboard, Theater, messages panel, sideways full screen and Back passed at 320, 360, 390 and 412 px with one video element and one connection; the ordinary website is unchanged.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exit(1);});
