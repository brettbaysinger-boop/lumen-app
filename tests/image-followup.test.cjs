const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('lib/image-followup.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const compiledModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: compiledModule,
  exports: compiledModule.exports,
  require,
});

const resolve = compiledModule.exports.imagePromptFromConfirmation;

test('resolves a descriptive Sonoran sunrise offer', () => {
  const result = resolve('Yes please do', [
    { role: 'user', content: 'Paint me a Sonoran sunrise.' },
    {
      role: 'assistant',
      content: 'Would you like me to create an image of that Sonoran sunrise?',
    },
  ]);

  assert.match(result, /Sonoran sunrise/i);
});

test('ignores unrelated reminder confirmations', () => {
  const result = resolve('Sure', [
    { role: 'user', content: 'I need to finish paperwork tomorrow.' },
    {
      role: 'assistant',
      content: 'Would you like me to create a reminder for tomorrow?',
    },
  ]);

  assert.equal(result, null);
});

test('prefers explicit mountain lake over unrelated earlier message', () => {
  const result = resolve('Yes please do', [
    { role: 'user', content: 'I need to finish paperwork tomorrow.' },
    {
      role: 'assistant',
      content: 'Would you like me to create an image of a mountain lake?',
    },
  ]);

  assert.match(result, /mountain lake/i);
  assert.doesNotMatch(result, /paperwork/i);
});

test('requires an explicit image offer', () => {
  const result = resolve('Yes please do', [
    { role: 'user', content: 'Paint me a Sonoran sunrise.' },
    {
      role: 'assistant',
      content: 'The desert sky would look beautiful in gold and pink.',
    },
  ]);

  assert.equal(result, null);
});

test('rejects ambiguous offer with unrelated context', () => {
  const result = resolve('Sure', [
    { role: 'user', content: 'I need to finish paperwork tomorrow.' },
    {
      role: 'assistant',
      content: 'Would you like me to create an image of that?',
    },
  ]);

  assert.equal(result, null);
});

test('rejects unrelated confirmations', () => {
  const result = resolve('No thanks', [
    { role: 'user', content: 'Paint me a Sonoran sunrise.' },
    {
      role: 'assistant',
      content: 'Would you like me to create an image of that Sonoran sunrise?',
    },
  ]);

  assert.equal(result, null);
});
