// Small client contract test. The PostgreSQL RPC behavior is tested separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync('app/(tabs)/memories.tsx', 'utf8');
assert.match(source, /supabase\.rpc\('review_memory_suggestion_v2'/);
assert.match(source, /p_confirm_durability:\s*confirmDurability/);
assert.match(source, /data === 'durability_confirmation_required'/);
assert.match(source, /approvalSignature\(item,\s*content,\s*subject\)/);
assert.match(source, /reviewWarning\?\.id === item\.id/);
assert.match(source, /reviewWarning\.signature === approvalKey/);
assert.doesNotMatch(source, /supabase\.rpc\('review_memory_suggestion',/);

const output = ts.transpileModule(
  fs.readFileSync('lib/memory-durability.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}},
).outputText;
const box={exports:{}};
vm.runInNewContext(output,box);
const fn=box.exports.memoryDurabilityWarning;
for(const name of ['Nova','Atlas','Aria']) {
  assert.equal(typeof fn(`The user asked ${name} to call them captain.`,
    'Will you call me captain?'),'string');
}
assert.equal(fn('The user prefers turquoise.', 'My favorite color is turquoise.'),null);
console.log('Phase 1b UI-to-RPC confirmation contract passed.');
