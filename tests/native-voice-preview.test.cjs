const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function setup({ failPlayer = false, pending = false } = {}) {
  const stats = { played: 0, removed: 0, deleted: 0, ended: 0, lifecycleRemoved: 0, files: 0 };
  let status, lifecycle, resolveRequest;
  class File {
    constructor() { this.uri = 'file://private-cache/sample.wav'; this.exists = false; }
    create() { this.exists = true; stats.files++; }
    write(bytes) { assert.ok(bytes.length); }
    delete() { this.exists = false; stats.deleted++; }
  }
  const player = { addListener: (_, fn) => { status = fn; return { remove() {} }; },
    play: () => stats.played++, pause() {}, remove: () => stats.removed++ };
  const stubs = { 'react-native': { AppState: { addEventListener: (_, fn) => { lifecycle = fn; return { remove: () => stats.lifecycleRemoved++ }; } } },
    'expo-audio': { setAudioModeAsync: async () => {}, createAudioPlayer: () => { if (failPlayer) throw Error('Player unavailable'); return player; } },
    'expo-file-system': { File, Paths: { cache: {} } }, './auth': { authHeaders: async () => ({ Authorization: 'Bearer test' }) } };
  const response = { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/voice-preview.native.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: mod, exports: mod.exports, require: name => stubs[name],
    process: { env: { EXPO_PUBLIC_LUMEN_API_URL: 'https://test.invalid' } }, AbortController, Uint8Array,
    fetch: async () => pending ? new Promise(resolve => resolveRequest = resolve) : response,
    setTimeout: () => 1, clearTimeout() {} });
  const signal = new AbortController();
  return { stats, signal, start: () => mod.exports.previewVoice('c', 'Sol', 'voice', signal.signal, () => stats.ended++),
    finish: () => status({ didJustFinish: true }), background: () => lifecycle('background'), resolve: () => resolveRequest(response) };
}
test('native voice sample completes once and removes player and private temporary audio', async () => {
  const run = setup(); const stop = await run.start(); assert.equal(run.stats.played, 1);
  run.finish(); stop(); assert.equal(run.stats.removed, 1); assert.equal(run.stats.deleted, 1);
  assert.equal(run.stats.ended, 1); assert.equal(run.stats.lifecycleRemoved, 1);
});
test('backgrounding stops native sample and cleans up its file', async () => {
  const run = setup(); await run.start(); run.background(); assert.equal(run.stats.deleted, 1); assert.equal(run.stats.removed, 1);
});
test('player initialization failure still deletes the sample', async () => {
  const run = setup({ failPlayer: true }); await assert.rejects(run.start(), /Player unavailable/);
  assert.equal(run.stats.deleted, 1); assert.equal(run.stats.ended, 1);
});
test('a cancelled late speech response cannot create a file or player', async () => {
  const run = setup({ pending: true }); const result = run.start(); await new Promise(resolve => setImmediate(resolve));
  run.signal.abort(); run.resolve(); await assert.rejects(result, /cancelled/);
  assert.equal(run.stats.files, 0); assert.equal(run.stats.played, 0); assert.equal(run.stats.ended, 1);
});
