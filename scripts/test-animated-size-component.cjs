// Resizing the animated companion must not touch the avatar session.
// Optional test-only dependency: react-test-renderer@19.1.0.
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,stubs={}){const mod=new Module(require('node:path').resolve(file),module);mod.paths=module.paths;mod.require=name=>stubs[name]||require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);return mod.exports;}
let windowSize={width:1920,height:1000};
const stored=new Map();globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))};
const native={Platform:{OS:'web'},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',useWindowDimensions:()=>windowSize};
const {AnimatedCompanion}=compile('components/AnimatedCompanion.tsx',{'react-native':native,'@/lib/animated-companion-core':compile('lib/animated-companion-core.ts'),'@/lib/animated-companion':{}});
// A stand-in for the session that records every call the screen makes on it.
const calls=[];const session=new Proxy({},{get:(_,name)=>(...args)=>{calls.push([name,...args]);}});
const element={tagName:'VIDEO'};
const render=()=>create(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}),{createNodeMock:node=>node.type==='video'?element:null});
const box=root=>root.root.findAllByType('View').find(view=>view.props.accessibilityLabel==='Animated companion').props.style;
const button=(root,label)=>root.root.findAllByType('TouchableOpacity').find(item=>item.props.accessibilityLabel===`${label} animated companion`);
const press=async(root,label)=>{await act(async()=>button(root,label).props.onPress());};
const video=root=>root.root.findByType('video');
(async()=>{
  let root;await act(async()=>{root=render();});
  assert.deepEqual(calls,[['attach',element]]);                                   // attached once, when shown
  assert.equal(box(root).width,420);assert.equal(box(root).height,420);           // Large by default on a desktop window
  assert.equal(button(root,'Expand').props.disabled,false);assert.equal(button(root,'Shrink').props.disabled,false);
  const first=video(root).instance??video(root);
  assert.equal(video(root).props.style.objectFit,'cover');                        // square box, cropped, never stretched

  await press(root,'Expand');
  assert.equal(box(root).width,560);assert.equal(box(root).height,560);assert.equal(button(root,'Expand').props.disabled,true);
  await press(root,'Shrink');await press(root,'Shrink');
  assert.equal(box(root).width,260);assert.equal(button(root,'Shrink').props.disabled,true);
  await press(root,'Shrink');                                                      // at the end: nothing happens
  assert.equal(box(root).width,260);
  await press(root,'Expand');await press(root,'Expand');
  assert.equal(box(root).width,560);

  // The window changes (phone width, then a short window): the box follows, still square.
  windowSize={width:390,height:844};await act(async()=>{root.update(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}));});
  assert.equal(box(root).width,358);assert.equal(box(root).height,358);
  windowSize={width:1366,height:650};await act(async()=>{root.update(React.createElement(AnimatedCompanion,{session,borderColor:'#111',controlColor:'#222'}));});
  assert.equal(box(root).width,403);

  // Through all of that: the same video element, and not one further call on the session
  // (no attach, no connect, no close), so the WebRTC session and its stream were never touched.
  assert.equal(video(root).instance??video(root),first);
  assert.deepEqual(calls,[['attach',element]]);

  // The choice is remembered for the next time the panel appears; the session is released once.
  await act(async()=>root.unmount());
  assert.deepEqual(calls,[['attach',element],['attach',null]]);
  assert.equal(stored.get('lumen.animated.size'),'theater');
  calls.length=0;windowSize={width:1920,height:1000};
  await act(async()=>{root=render();});
  assert.equal(box(root).width,560);assert.deepEqual(calls,[['attach',element]]);
  await act(async()=>root.unmount());

  // Storage that throws or holds something else falls back to the default.
  globalThis.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  await act(async()=>{root=render();});assert.equal(box(root).width,420);await press(root,'Shrink');assert.equal(box(root).width,260);
  await act(async()=>root.unmount());
  windowSize={width:390,height:844};await act(async()=>{root=render();});assert.equal(box(root).width,260);  // Compact by default on a phone
  await act(async()=>root.unmount());
  console.log('animated size component: all checks passed');
})().catch(error=>{console.error(error);process.exit(1);});
