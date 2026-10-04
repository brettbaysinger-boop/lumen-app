const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/voice.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
let released = 0;
let revoked = 0;
const fakeStream = { getTracks: () => [{ stop: () => { released++; } }] };
class Recorder {
  static isTypeSupported(type) { return type.startsWith('audio/ogg'); }
  constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable({ data: new Blob(['spoken words']) });
      this.onstop();
    });
  }
}
class Audio {
  constructor(url) { this.url = url; }
  async play() {}
  pause() {}
  removeAttribute() {}
}
const sandbox = {
  exports: {}, window: {}, navigator: { mediaDevices: { getUserMedia: async () => fakeStream } },
  MediaRecorder: Recorder, Blob, FormData, AbortController, Audio,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => { revoked++; } },
  setTimeout, clearTimeout, process: { env: { EXPO_PUBLIC_LUMEN_API_URL: 'http://lumen:8001' } },
  fetch: async (url, init) => ({ ok: true,
    json: async () => ({ text: 'Remember my favorite color is turquoise' }),
    blob: async () => new Blob(['RIFFaudio'], { type: 'audio/wav' }),
  }),
};
vm.runInNewContext(compiled, sandbox);
const voice = sandbox.exports;
(async () => {
  let recording;
  const done = new Promise(resolve => { recording = resolve; });
  const handle = await voice.recordMicrophone(recording, error => { throw error; });
  handle.stop();
  const blob = await done;
  assert.equal(blob.type, 'audio/ogg;codecs=opus');
  assert.ok(released > 0, 'microphone tracks released after stopping');
  assert.equal(await voice.transcribeRecording(blob), 'Remember my favorite color is turquoise');
  let cancelledCallback = false;
  const cancel = await voice.recordMicrophone(() => { cancelledCallback = true; }, () => {});
  cancel.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelledCallback, false, 'cancel must not submit audio');
  let ended = 0;
  const controller = new AbortController();
  const stop = await voice.playReply('Hello', controller.signal, () => { ended++; });
  controller.abort();
  stop();
  assert.equal(revoked, 1, 'playback object URL released once');
  assert.equal(ended, 1);
  sandbox.fetch = async () => ({ ok: false, status: 502, json: async () => ({ detail: 'Helios unavailable' }) });
  await assert.rejects(voice.transcribeRecording(blob), /Helios unavailable/);
  sandbox.navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); };
  await assert.rejects(voice.recordMicrophone(() => {}, () => {}), /Permission denied/);
  console.log('Browser audio lifecycle and error checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
