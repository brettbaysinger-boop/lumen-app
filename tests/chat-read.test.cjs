const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chat-read.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,AbortController,setTimeout,clearTimeout});
const {chatRead}=mod.exports;
test('successful read returns without aborting its signal',async()=>{let signal;assert.equal(await chatRead(s=>{signal=s;return Promise.resolve('ok')},10),'ok');await new Promise(r=>setTimeout(r,20));assert.equal(signal.aborted,false);});
test('a stalled abort-aware read reaches a retryable failure',async()=>{await assert.rejects(chatRead(signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Timed out')))),5),/Timed out/);});
