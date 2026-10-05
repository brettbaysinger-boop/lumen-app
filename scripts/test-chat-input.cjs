const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('lib/chat-input.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function('module','exports',source)(loaded, loaded.exports);
const { shouldSendOnEnter } = loaded.exports;
assert.equal(shouldSendOnEnter({key:'Enter'}),true);
assert.equal(shouldSendOnEnter({key:'Enter',shiftKey:true}),false);
assert.equal(shouldSendOnEnter({key:'Enter',isComposing:true}),false);
assert.equal(shouldSendOnEnter({key:'Enter',nativeEvent:{isComposing:true}}),false);
assert.equal(shouldSendOnEnter({key:'Enter',nativeEvent:{keyCode:229}}),false);
assert.equal(shouldSendOnEnter({key:'Enter',keyCode:229}),false);
assert.equal(shouldSendOnEnter({key:'a'}),false);
console.log('Enter send, Shift+Enter newline and IME composition safeguards passed.');
