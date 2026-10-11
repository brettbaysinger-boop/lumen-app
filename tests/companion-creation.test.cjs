const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/companion-creation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const { companionDraft, validateCompanionDraft } = mod.exports;
const existing = { name: 'Lumen', persona: 'Existing custom personality', description: 'Existing description',
  gender: 'female', portrait_url: '/lumen-original.jpg', speech_voice: 'af_heart', setup_completed_at: '2026-10-10' };
test('existing companions retain identity and derive legacy pronouns', () => {
  const draft = companionDraft(existing);
  assert.equal(draft.name, 'Lumen'); assert.equal(draft.persona, existing.persona);
  assert.equal(draft.pronouns, 'she/her'); assert.equal(draft.speech_voice, 'af_heart');
  assert.equal(companionDraft({ ...existing, setup_completed_at: undefined }).name, 'Lumen');
});
test('new companion setup asks for a chosen name instead of accepting the provisioned name', () => {
  const draft = companionDraft({ ...existing, setup_completed_at: null });
  assert.equal(draft.name, ''); assert.throws(() => validateCompanionDraft(draft));
  assert.equal(validateCompanionDraft({ ...draft, name: '  Sol  ', pronouns: '  they/them ' }).name, 'Sol');
});
test('required fields and limits fail before saving; optional appearance and voice remain optional', () => {
  const draft = companionDraft(existing);
  for (const change of [{ name: ' ' }, { pronouns: ' ' }, { persona: ' ' }, { name: 'x'.repeat(101) },
    { persona: 'x'.repeat(4001) }, { visual_identity: 'x'.repeat(3001) }, { gender: 'invalid' }])
    assert.throws(() => validateCompanionDraft({ ...draft, ...change }));
  const result = validateCompanionDraft({ ...draft, visual_identity: ' ', speech_voice: null });
  assert.equal(result.visual_identity, ''); assert.equal(result.speech_voice, null);
});
