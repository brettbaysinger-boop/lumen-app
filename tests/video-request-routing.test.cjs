// Live failure 2026-11-16: "Make a 3-second video animating the image you just generated." took
// the still-image shortcut (POST /v0.2/images/generate) because it names "image". A video ask
// must go to chat, where the server plans the video job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { test } = require('node:test');

const compiled = ts.transpileModule(fs.readFileSync('lib/cognition.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, {
  module: mod, exports: mod.exports, process: { env: {} },
  require: () => ({ Platform: { OS: 'web' } }),
});
const { isImageRequest, VIDEO_REQUEST } = mod.exports;

const LIVE = 'Make a 3-second video animating the image you just generated. Use gentle, natural movement.';

test('the exact live video request is not an image request', () => {
  assert.equal(VIDEO_REQUEST.test(LIVE), true);
  assert.equal(isImageRequest(LIVE), false);
});

test('other video asks that name an image stay out of the image shortcut', () => {
  for (const text of [
    'Animate this picture',
    'Create a short clip from the last image',
    'Can you make a video of that photo?',
    'Bring this picture to life',
    'Generate a 5 second animation of the portrait you sent',
  ]) assert.equal(isImageRequest(text), false, text);
});

test('plain still-image requests still take the image shortcut', () => {
  for (const text of [
    'Create an image of a lighthouse at dusk',
    'Draw a fox in the snow',
    'Send me a picture of you',
  ]) assert.equal(isImageRequest(text), true, text);
});

const SERVER = 'backend/lumen/media_jobs.py';
test('the client video pattern matches the server video_request pattern',
  { skip: !fs.existsSync(SERVER) && 'the frontend-only release has no video backend file' }, () => {
  const server = fs.readFileSync(SERVER, 'utf8');
  const noun = server.match(/_VIDEO_NOUN = r"\(\?:([^)]+)\)"/)[1];
  assert.match(VIDEO_REQUEST.source, new RegExp(noun.replace(/\|/g, '\\|')));
  assert.match(server, /\{\{0,90\}\}/);
  assert.match(VIDEO_REQUEST.source, /\{0,90\}/);
});

test('Chat decides the image shortcut only through isImageRequest or an image-offer "yes"', () => {
  const chat = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(chat, /const wantsImage = !document && !images\.length &&\s+\(isImageRequest\(text\) \|\| followupImagePrompt !== null\);/);
  assert.equal((chat.match(/generateImage\(/g) || []).length, 1);
});
