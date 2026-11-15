const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Display size of the animated companion. No browser and no avatar service are used.
function load(file){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>({}),setTimeout,clearTimeout,DataView,String,Math,JSON,Promise,Set});return mod.exports}
const core=load('lib/animated-companion-core.ts');
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
  for(const width of [320,360,390,414,599,768]) for(const size of core.ANIMATED_SIZES) for(const height of [480,667,844,1024]){
    const value=edge(size,width,height);
    assert.ok(value<=width-32,`${size} at ${width}x${height}: ${value}`);
  }
  assert.equal(edge('theater',390,844),358);
});
test('the window height limits it, leaving room for the conversation and the message box',()=>{
  assert.equal(edge('theater',1366,650),403);
  assert.equal(edge('large',1366,650),325);
  for(const size of core.ANIMATED_SIZES) for(const height of [400,650,768,900,1080]) assert.ok(edge(size,1920,height)<=Math.max(120,height*0.62)+0.5);
  assert.equal(edge('compact',390,420),168);            // phone with the keyboard open
});
test('a larger option is never smaller than a smaller one, and none exceeds its own limit',()=>{
  for(const width of [320,390,800,1366,2560]) for(const height of [300,650,900,1440]){
    const [compact,large,theater]=core.ANIMATED_SIZES.map(size=>edge(size,width,height));
    assert.ok(compact<=large&&large<=theater,`${width}x${height}: ${compact} ${large} ${theater}`);
    assert.ok(compact<=260&&large<=420&&theater<=560);
    assert.ok(compact>=120);
  }
});
test('Expand and Shrink step through the options and stop at the ends',()=>{
  assert.equal(core.stepAnimatedSize('compact',1),'large');
  assert.equal(core.stepAnimatedSize('large',1),'theater');
  assert.equal(core.stepAnimatedSize('theater',1),null);
  assert.equal(core.stepAnimatedSize('theater',-1),'large');
  assert.equal(core.stepAnimatedSize('compact',-1),null);
});
test('only the three known names are accepted from storage',()=>{
  assert.equal(core.isAnimatedSize('theater'),true);
  for(const value of [null,undefined,'','huge',420,{}]) assert.equal(core.isAnimatedSize(value),false);
});
