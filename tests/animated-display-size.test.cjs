const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Display size of the animated companion. No browser and no avatar service are used.
function load(file){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>({}),setTimeout,clearTimeout,DataView,String,Math,JSON,Promise,Set});return mod.exports}
const core=load('lib/animated-companion-core.ts');
const SQUARE=['compact','large','theater'];
const box=(size,width,height)=>{const {width:w,height:h,contain}=core.animatedDisplayBox(size,width,height);return {w,h,contain};};
const edge=(size,width,height)=>core.animatedDisplayEdge(size,width,height);

test('the three options on a desktop window',()=>{
  assert.equal(edge('compact',1920,1000),260);
  assert.equal(edge('large',1920,1000),420);
  assert.equal(edge('theater',1920,1000),560);
});
test('Large is the default on a desktop-width window, Compact on a phone-width one',()=>{
  assert.equal(core.defaultAnimatedSize(1280),'large');
  assert.equal(core.defaultAnimatedSize(600),'large');
  assert.equal(core.defaultAnimatedSize(390),'compact');
});
test('never wider than the window minus its margins, so nothing scrolls sideways',()=>{
  for(const width of [320,360,390,414,599,768]) for(const size of SQUARE) for(const height of [480,667,844,1024]){
    const value=edge(size,width,height);
    assert.ok(value<=width-32,`${size} at ${width}x${height}: ${value}`);
  }
  assert.equal(edge('theater',390,844),358);
});
test('the window height limits it, leaving room for the conversation and the message box',()=>{
  assert.equal(edge('theater',1366,650),403);
  assert.equal(edge('large',1366,650),325);
  for(const size of SQUARE) for(const height of [400,650,768,900,1080]) assert.ok(edge(size,1920,height)<=Math.max(120,height*0.62)+0.5);
  assert.equal(edge('compact',390,420),168);            // phone with the keyboard open
});
test('a larger option is never smaller than a smaller one, and none exceeds its own limit',()=>{
  for(const width of [320,390,800,1366,2560]) for(const height of [300,650,900,1440]){
    const [compact,large,theater]=SQUARE.map(size=>edge(size,width,height));
    assert.ok(compact<=large&&large<=theater,`${width}x${height}: ${compact} ${large} ${theater}`);
    assert.ok(compact<=260&&large<=420&&theater<=560);
    assert.ok(compact>=120);
  }
});
test('Expand and Shrink step through the options and stop at the ends',()=>{
  assert.equal(core.stepAnimatedSize('compact',1),'large');
  assert.equal(core.stepAnimatedSize('large',1),'theater');
  assert.equal(core.stepAnimatedSize('theater',1),'wide');
  assert.equal(core.stepAnimatedSize('wide',1),null);
  assert.equal(core.stepAnimatedSize('wide',-1),'theater');
  assert.equal(core.stepAnimatedSize('theater',-1),'large');
  assert.equal(core.stepAnimatedSize('compact',-1),null);
});
test('only the known names are accepted from storage',()=>{
  assert.equal(core.isAnimatedSize('theater'),true);assert.equal(core.isAnimatedSize('wide'),true);
  for(const value of [null,undefined,'','huge',420,{}]) assert.equal(core.isAnimatedSize(value),false);
});

// --- Wide Theater: the whole 3:2 frame ---------------------------------------
test('the square options are exactly as before and still crop to a square',()=>{
  for(const [size,value] of [['compact',260],['large',420],['theater',560]]) assert.deepEqual(box(size,1920,1000),{w:value,h:value,contain:false});
});
test('Wide Theater is 840 x 560 when there is room, and shows the whole frame',()=>{
  assert.deepEqual(box('wide',1920,1000),{w:840,h:560,contain:true});
  assert.deepEqual(box('wide',1440,900),{w:837,h:558,contain:true});
});
test('Wide Theater keeps the 3:2 shape of the 768 x 512 source at every window size',()=>{
  for(const width of [320,360,390,600,900,1160,1366,1440,2560]) for(const height of [480,568,650,844,900,1440]){
    const {w,h}=box('wide',width,height);
    assert.ok(Math.abs(w/h-1.5)<0.01,`${width}x${height}: ${w}x${h}`);
    assert.ok(w<=width-32,`${width}x${height}: ${w} wide`);                      // never causes sideways scrolling
    assert.ok(h<=Math.max(80,Math.min(height*0.62,height-250))+0.5,`${width}x${height}: ${h} tall`);     // room left for messages and the message box
    assert.ok(w<=840&&h<=560);
  }
  assert.deepEqual(box('wide',1366,650),{w:600,h:400,contain:true});
  assert.deepEqual(box('wide',390,844),{w:358,h:239,contain:true});
  assert.deepEqual(box('wide',320,568),{w:288,h:192,contain:true});
});
test('the column, not the window, limits the width: with the sidebar open the video still fits',()=>{
  assert.deepEqual(box('wide',1440-280,900),{w:837,h:558,contain:true});
  assert.deepEqual(box('wide',1024-280,900),{w:712,h:475,contain:true});
  assert.deepEqual(box('theater',800-280,900),{w:488,h:488,contain:false});
});
