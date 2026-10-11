const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/companion-creation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const { suggestNames, describeAppearance, PERSONALITIES } = mod.exports;
test('name suggestions provide distinct selectable names without overwriting a user draft', () => {
  for (const style of ['soft', 'cosmic', 'grounded']) {
    const names = suggestNames(style, () => 0.5);
    assert.equal(names.length, 4); assert.equal(new Set(names).size, 4);
    assert.ok(names.every(name => typeof name === 'string' && name.length > 0));
  }
});
test('appearance helper uses supplied features and omits empty details', () => {
  const description = describeAppearance({ features: ' Adult, freckles ', hair: 'silver waves', eyes: '', clothing: 'blue jacket', style: 'Anime' });
  assert.match(description, /Adult, freckles/); assert.match(description, /Hair: silver waves/);
  assert.match(description, /Clothing: blue jacket/); assert.equal(description.includes('Eyes:'), false);
});
test('romantic style is an optional editable preset and does not replace the warm default', () => {
  assert.equal(PERSONALITIES[0].name, 'Warm & thoughtful');
  assert.ok(PERSONALITIES.some(style => style.name === 'Romantic & affectionate'));
});
