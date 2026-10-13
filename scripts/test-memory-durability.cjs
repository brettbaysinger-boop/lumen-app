const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const js = ts.transpileModule(
  fs.readFileSync('lib/memory-durability.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(js, sandbox);
const { memoryDurabilityWarning } = sandbox.exports;

for (const source of [
  'Tell me a silly joke.',
  'Good morning. How are you?',
  'Can you show me a picture of yourself?',
  'Nova, can you hear me clearly?',
  'Will you call me captain?',
  "Did you know I'm your creator?",
  "I'm exhausted.",
]) {
  assert.equal(typeof memoryDurabilityWarning('Some normalized fact.', source), 'string', source);
}
for (const source of [
  'My favorite color is turquoise.',
  "I'm building a farmers almanac.",
  'The user identifies as a creator.',
  'The companion has an interest in gardening.',
]) {
  assert.equal(memoryDurabilityWarning(source), null, source);
}
assert.equal(memoryDurabilityWarning(''), null);
console.log('Generic memory durability warning checks passed.');
