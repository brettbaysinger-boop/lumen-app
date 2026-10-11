const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chat-management.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const { chatTitle, reconcileChats, visibleChats } = mod.exports;
test('chat names are trimmed and empty or oversized names are rejected', () => {
  assert.equal(chatTitle('  Trip planning  '), 'Trip planning');
  assert.throws(() => chatTitle('   '));
  assert.throws(() => chatTitle('x'.repeat(201)));
});
test('archived chats remain searchable and can return to the current list', () => {
  const rows = [{ id: 'a', title: 'Trip', is_active: true }, { id: 'b', title: 'Work', is_active: false }];
  assert.equal(visibleChats(rows, false, ' TRIP ')[0].id, 'a');
  assert.equal(visibleChats(rows, true, 'work')[0].id, 'b');
  assert.equal(visibleChats(rows, false, 'work').length, 0);
  rows[1].is_active = true;
  assert.equal(visibleChats(rows, false, 'work')[0].id, 'b');
});
test('server reconciliation removes deleted history and drafts, keeps unrelated and new drafts', () => {
  const snapshot = { conversations: [{ id: 'a' }, { id: 'b' }], messages: { a: ['private'], b: ['keep'] },
    drafts: { a: 'remove', b: 'keep', new: 'unsent' } };
  const result = reconcileChats(snapshot, [{ id: 'b', title: 'Renamed', is_active: false }]);
  assert.equal(result.messages.a, undefined);
  assert.equal(result.drafts.a, undefined);
  assert.equal(result.messages.b[0], 'keep');
  assert.equal(result.drafts.new, 'unsent');
  assert.equal(result.conversations[0].title, 'Renamed');
  assert.equal(snapshot.drafts.a, 'remove');
});
