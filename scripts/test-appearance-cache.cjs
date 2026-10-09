const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raialume-cache-test-'));

try {
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), [
    path.join(root, 'lib/appearance-cache.ts'),
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--skipLibCheck',
    '--outDir', tmp,
  ], { stdio: 'pipe' });
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  throw error;
}

const { AppearanceCache } = require(
  path.join(tmp, 'appearance-cache.js')
);

function createStorage() {
  const values = new Map();

  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

test('new local edits remain pending until acknowledged', async () => {
  const storage = createStorage();
  const cache = new AppearanceCache(storage);

  const revision = await cache.update('user-a', { accent: 'blue' });

  assert.equal(cache.current('user-a').pending, true);
  assert.equal(await cache.acknowledge('user-a', revision), true);
  assert.equal(cache.current('user-a').pending, false);
});

test('an old cloud acknowledgement cannot clear a newer edit', async () => {
  const storage = createStorage();
  const cache = new AppearanceCache(storage);

  const blue = await cache.update('user-a', { accent: 'blue' });
  const purple = await cache.update('user-a', { accent: 'purple' });

  assert.equal(await cache.acknowledge('user-a', blue), false);
  assert.equal(cache.current('user-a').pending, true);

  assert.equal(await cache.acknowledge('user-a', purple), true);
  assert.equal(cache.current('user-a').pending, false);
});

test('pending preferences survive a simulated restart', async () => {
  const storage = createStorage();
  const first = new AppearanceCache(storage);

  await first.update('user-a', { accent: 'purple' });

  const restarted = new AppearanceCache(storage);
  const loaded = await restarted.load('user-a', value => value);

  assert.deepEqual(loaded.preferences, { accent: 'purple' });
  assert.equal(loaded.pending, true);
});

test('a pending local edit rejects older cloud preferences', async () => {
  const storage = createStorage();
  const cache = new AppearanceCache(storage);

  await cache.update('user-a', { accent: 'purple' });

  assert.equal(
    await cache.acceptCloud('user-a', { accent: 'blue' }),
    false
  );

  assert.equal(cache.current('user-a').preferences.accent, 'purple');
});

test('different accounts have independent caches', async () => {
  const storage = createStorage();
  const cache = new AppearanceCache(storage);

  await cache.update('user-a', { accent: 'gold' });
  await cache.update('user-b', { accent: 'blue' });

  assert.equal(cache.current('user-a').preferences.accent, 'gold');
  assert.equal(cache.current('user-b').preferences.accent, 'blue');
});

test('older account cache format remains readable', async () => {
  const storage = createStorage();

  storage.values.set(
    'lumen-account-appearance-v1-user-a',
    JSON.stringify({ schemeId: 'gold-dark', appearance: {} })
  );

  const cache = new AppearanceCache(storage);
  const loaded = await cache.load('user-a', value => value);

  assert.equal(loaded.preferences.schemeId, 'gold-dark');
  assert.equal(loaded.pending, false);
});

test('serialized writes preserve the newest preference', async () => {
  const storage = createStorage();
  const cache = new AppearanceCache(storage);

  const first = cache.update('user-a', { accent: 'blue' });
  const second = cache.update('user-a', { accent: 'purple' });

  await Promise.all([first, second]);

  const restarted = new AppearanceCache(storage);
  const loaded = await restarted.load('user-a', value => value);

  assert.equal(loaded.preferences.accent, 'purple');
  assert.equal(loaded.pending, true);
});


test('a concurrent edit wins over a delayed storage read', async () => {
  let releaseRead;
  let beginRead;

  const started = new Promise(resolve => {
    beginRead = resolve;
  });

  const gate = new Promise(resolve => {
    releaseRead = resolve;
  });

  const values = new Map([
    [
      'lumen-account-appearance-v1-user-a',
      JSON.stringify({
        preferences: { accent: 'blue' },
        pending: false,
        revision: 1,
      }),
    ],
  ]);

  const storage = {
    async getItem(key) {
      const oldValue = values.get(key) ?? null;
      beginRead();
      await gate;
      return oldValue;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };

  const cache = new AppearanceCache(storage);

  const loading = cache.load('user-a', value => value);
  await started;

  await cache.update('user-a', { accent: 'purple' });
  releaseRead();

  const loaded = await loading;

  assert.equal(loaded.preferences.accent, 'purple');
  assert.equal(loaded.pending, true);
  assert.equal(cache.current('user-a').preferences.accent, 'purple');
});
