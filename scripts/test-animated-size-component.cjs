// Resizing the animated companion must not touch the avatar session.
// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
let windowSize={width:1920,height:1000};
const stored=new Map();globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))};
const native={Platform:{OS:'web'},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',useWindowDimensions:()=>windowSize};
const {AnimatedCompanion}=compile('components/AnimatedCompanion.tsx',{'react-native':native,'@/lib/animated-companion-core':compile('lib/animated-companion-core.ts'),'@/lib/animated-companion':{},'@/lib/live-room':compile('lib/live-room.ts')});
// A stand-in for the session that records every call the screen makes on it.
const calls=[];const session=new Proxy({},{get:(_,name)=>(...args)=>{calls.push([name,...args]);}});
const element={tagName:'VIDEO'};
const render=()=>create(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}),{createNodeMock:node=>node.type==='video'?element:null});
const box=root=>root.root.findAllByType('View').find(view=>view.props.accessibilityLabel==='Animated companion').props.style;
const button=(root,label)=>root.root.findAllByType('TouchableOpacity').find(item=>item.props.accessibilityLabel===`${label} animated companion`);
const press=async(root,label)=>{await act(async()=>button(root,label).props.onPress());};
const video=root=>root.root.findByType('video');
const outer=root=>root.root.findAllByType('View').find(view=>view.props.onLayout);
const label=root=>root.root.findAllByType('Text').find(text=>String(text.props.accessibilityLabel||'').startsWith('Animated companion size')).props.accessibilityLabel;
(async()=>{
  let root;await act(async()=>{root=render();});
  assert.deepEqual(calls,[['attach',element]]);                                   // attached once, when shown
  assert.equal(box(root).width,420);assert.equal(box(root).height,420);           // Large by default on a desktop window
  assert.equal(button(root,'Expand').props.disabled,false);assert.equal(button(root,'Shrink').props.disabled,false);
  const first=video(root).instance??video(root);
  assert.equal(video(root).props.style.objectFit,'cover');                        // square box, cropped, never stretched

  await press(root,'Expand');
  assert.equal(box(root).width,560);assert.equal(box(root).height,560);assert.equal(button(root,'Expand').props.disabled,false);
  // Square Theater to Wide Theater: the box becomes 3:2 and the picture is shown whole instead of cropped.
  await press(root,'Expand');
  assert.equal(box(root).width,840);assert.equal(box(root).height,560);assert.equal(video(root).props.style.objectFit,'contain');
  assert.equal(box(root).borderRadius,0);                                         // square corners: a rounded corner would cut off frame pixels
  assert.equal(label(root),'Animated companion size: Wide Theater');assert.equal(button(root,'Expand').props.disabled,true);
  // The sidebar opens: the column is narrower than the window, and the video follows the column.
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:1920-280}}}));
  assert.equal(box(root).width,840);
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:744}}}));
  assert.equal(box(root).width,712);assert.equal(box(root).height,475);
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:1920}}}));
  await press(root,'Shrink');
  assert.equal(box(root).width,560);assert.equal(box(root).height,560);assert.equal(video(root).props.style.objectFit,'cover');assert.equal(box(root).borderRadius,560*0.12);   // the square sizes keep their rounded corners
  await press(root,'Shrink');await press(root,'Shrink');
  assert.equal(box(root).width,260);assert.equal(button(root,'Shrink').props.disabled,true);
  await press(root,'Shrink');                                                      // at the end: nothing happens
  assert.equal(box(root).width,260);
  await press(root,'Expand');await press(root,'Expand');await press(root,'Expand');
  assert.equal(box(root).width,840);

  // The window changes (phone width, then a short window): the box follows, still square.
  windowSize={width:390,height:844};await act(async()=>{root.update(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}));});
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:390}}}));
  assert.equal(box(root).width,358);assert.equal(box(root).height,239);
  windowSize={width:1366,height:650};await act(async()=>{root.update(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}));});
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:1366}}}));
  assert.equal(box(root).width,600);assert.equal(box(root).height,400);

  // Through all of that: the same video element, and not one further call on the session
  // (no attach, no connect, no close), so the WebRTC session and its stream were never touched.
  assert.equal(video(root).instance??video(root),first);
  assert.deepEqual(calls,[['attach',element]]);

  // The choice is remembered for the next time the panel appears; the session is released once.
  await act(async()=>root.unmount());
  assert.deepEqual(calls,[['attach',element],['attach',null]]);
  assert.equal(stored.get('lumen.animated.size'),'wide');
  calls.length=0;windowSize={width:1920,height:1000};
  await act(async()=>{root=render();});
  assert.equal(box(root).width,840);assert.deepEqual(calls,[['attach',element]]);
  await act(async()=>root.unmount());

  // Storage that throws or holds something else falls back to the default.
  globalThis.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  await act(async()=>{root=render();});assert.equal(box(root).width,420);await press(root,'Shrink');assert.equal(box(root).width,260);
  await act(async()=>root.unmount());
  windowSize={width:390,height:844};await act(async()=>{root=render();});assert.equal(box(root).width,260);  // Compact by default on a phone
  await act(async()=>root.unmount());
  // Full screen: offered for the uncropped size only, and only where the browser can do it. It asks the
  // browser to show the same element; the session is not touched. A phone held sideways gets the whole frame.
  const full=root=>root.root.findAllByType('TouchableOpacity').find(item=>item.props.accessibilityLabel==='Show animated companion full screen');
  windowSize={width:780,height:360};globalThis.localStorage={getItem:()=>'wide',setItem(){}};
  await act(async()=>{root=render();});assert.equal(full(root),undefined);          // a browser without full screen: no control
  assert.equal(video(root).props.style.objectFit,'contain');assert.ok(box(root).width<=780-32&&box(root).height<=360);
  await act(async()=>root.unmount());
  globalThis.document={fullscreenEnabled:true};let asked=0;element.requestFullscreen=()=>{asked++;return Promise.reject(new Error('refused'));};
  calls.length=0;await act(async()=>{root=render();});
  await act(async()=>full(root).props.onPress());assert.equal(asked,1);              // a refusal by the browser is swallowed
  assert.deepEqual(calls,[['attach',element]]);
  await press(root,'Shrink');assert.equal(full(root),undefined);                     // square, cropped sizes: not offered
  await act(async()=>root.unmount());delete globalThis.document;

  // --- The Live Room: Video Chat <-> Companion Theater is again only a different box ---
  const room=view=>React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222',room:view});
  const controls=root=>root.root.findAllByType('TouchableOpacity').length;
  windowSize={width:360,height:660};calls.length=0;
  await act(async()=>{root=create(room('chat'),{createNodeMock:node=>node.type==='video'?element:null});});
  await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:360,height:248}}}));
  const roomFirst=video(root).instance??video(root);
  assert.equal(box(root).width,360);assert.equal(box(root).height,240);              // Video Chat: the whole 3:2 frame, 36% of the height
  assert.equal(video(root).props.style.objectFit,'contain');assert.equal(box(root).borderRadius,0);assert.equal(controls(root),0);   // no size choices in the room
  for(let round=0;round<3;round++){
    await act(async()=>{root.update(room('theater'));});
    await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:360,height:612}}}));
    assert.equal(box(root).width,360);assert.equal(box(root).height,240);            // portrait Theater: letterboxed, never cropped or stretched
    assert.equal(outer(root).props.style.some(part=>part&&part.flex===1),true);       // and centred in the whole space
    await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:360,height:200}}}));
    assert.equal(box(root).width,300);assert.equal(box(root).height,200);            // a short space (messages panel open): limited by its height
    assert.equal(video(root).props.style.objectFit,'contain');
    await act(async()=>{root.update(room('chat'));});
    await act(async()=>outer(root).props.onLayout({nativeEvent:{layout:{width:360,height:248}}}));
    assert.equal(box(root).height,240);
  }
  windowSize={width:360,height:343};await act(async()=>{root.update(room('chat'));});   // the keyboard opens
  assert.equal(box(root).width,195);assert.equal(box(root).height,130);
  assert.equal(video(root).instance??video(root),roomFirst);                         // the same element throughout
  assert.deepEqual(calls,[['attach',element]]);                                      // and the session was never touched
  await act(async()=>root.unmount());
  console.log('animated size component: all checks passed');
})().catch(error=>{console.error(error);process.exit(1);});
