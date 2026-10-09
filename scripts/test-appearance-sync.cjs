const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raialume-sync-test-'));

try {
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), [
    path.join(root, 'lib/appearance-sync-queue.ts'),
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--skipLibCheck',
    '--outDir', tmp,
  ], { stdio: 'pipe' });
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  throw error;
}

const { AppearanceSyncQueue } = require(
  path.join(tmp, 'appearance-sync-queue.js')
);

test('rapid changes save the latest value', async () => {
  const saved = [];
  const queue = new AppearanceSyncQueue(async value => {
    saved.push(value);
  });

  queue.enqueue('navy');
  queue.enqueue('gold');
  queue.enqueue('purple');

  assert.equal(queue.pending, true);
  assert.equal(await queue.flush(), true);
  assert.deepEqual(saved, ['purple']);
  assert.equal(queue.pending, false);
});

test('failed saves remain pending and can retry', async () => {
  let attempts = 0;
  const saved = [];

  const queue = new AppearanceSyncQueue(async value => {
    attempts++;

    if (attempts === 1) {
      throw new Error('Connection unavailable');
    }

    saved.push(value);
  });

  queue.enqueue('champagne');

  assert.equal(await queue.flush(), false);
  assert.equal(queue.pending, true);

  assert.equal(await queue.flush(), true);
  assert.deepEqual(saved, ['champagne']);
  assert.equal(queue.pending, false);
});

test('changes made during a save are not lost', async () => {
  let release;
  const firstSave = new Promise(resolve => {
    release = resolve;
  });

  const saved = [];
  const queue = new AppearanceSyncQueue(async value => {
    if (value === 'first') await firstSave;
    saved.push(value);
  });

  queue.enqueue('first');

  const flushing = queue.flush();

  queue.enqueue('second');
  release();

  assert.equal(await flushing, true);
  assert.deepEqual(saved, ['first', 'second']);
  assert.equal(queue.pending, false);
});

test('an empty queue does not write', async () => {
  let writes = 0;

  const queue = new AppearanceSyncQueue(async () => {
    writes++;
  });

  assert.equal(await queue.flush(), true);
  assert.equal(writes, 0);
});

test('concurrent flush calls share the active operation', async () => {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });

  const saved = [];
  const queue = new AppearanceSyncQueue(async value => {
    await gate;
    saved.push(value);
  });

  queue.enqueue('navy');

  const first = queue.flush();
  const second = queue.flush();

  assert.equal(first, second);

  release();

  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(saved, ['navy']);
});

test('cancelling pending changes prevents future writes', async () => {
  const saved = [];

  const queue = new AppearanceSyncQueue(async value => {
    saved.push(value);
  });

  queue.enqueue('account-a');
  queue.cancel();

  assert.equal(queue.pending, false);
  assert.equal(await queue.flush(), true);
  assert.deepEqual(saved, []);
});

test('cancellation during an active save invalidates the operation', async () => {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });

  const saved = [];
  const queue = new AppearanceSyncQueue(async value => {
    await gate;
    saved.push(value);
  });

  queue.enqueue('account-a');

  const operation = queue.flush();

  queue.cancel();
  release();

  assert.equal(await operation, false);
  assert.equal(queue.pending, false);

  // An already-started request may still complete. Cancellation must
  // prevent further queued writes, not pretend to abort the network.
  assert.deepEqual(saved, ['account-a']);
});

test('a cancelled queue can accept fresh work', async () => {
  const saved = [];
  const queue = new AppearanceSyncQueue(async value => {
    saved.push(value);
  });

  queue.enqueue('old');
  queue.cancel();
  queue.enqueue('new');

  assert.equal(await queue.flush(), true);
  assert.deepEqual(saved, ['new']);
});
