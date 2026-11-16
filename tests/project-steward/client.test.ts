import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSnapshot, loadDemoSnapshot, type SnapshotResult } from '../../lib/project-steward/client';
import { demoSnapshot } from '../../lib/project-steward/fixtures';

const URL = 'http://127.0.0.1:9/project-steward/snapshot';

function respond(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as typeof fetch;
}

const liveSnapshot = { ...demoSnapshot, generated_at: '2026-11-16T01:00:00Z' };

function assertNoFixture(r: SnapshotResult) {
  // A failure must never carry data, and never come back as the demo fixture.
  assert.notEqual(r.status, 'ok');
  assert.equal('snapshot' in r, false);
}

test('not configured -> missing/not_configured, no network call', async () => {
  let called = false;
  const r = await fetchSnapshot({
    url: '  ',
    fetchImpl: (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch,
  });
  assert.deepEqual(r, { status: 'missing', reason: 'not_configured' });
  assert.equal(called, false);
});

test('200 + valid snapshot -> ok, origin live-api', async () => {
  const r = await fetchSnapshot({
    url: URL,
    fetchImpl: respond(200, JSON.stringify(liveSnapshot)),
    now: () => new Date('2026-11-16T01:05:00Z'),
  });
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') {
    assert.equal(r.origin, 'live-api');
    assert.equal(r.receivedAt, '2026-11-16T01:05:00.000Z');
    assert.equal(r.snapshot.projects.length, demoSnapshot.projects.length);
  }
});

for (const [code, expected] of [
  [401, { status: 'unauthorized', httpStatus: 401 }],
  [403, { status: 'unauthorized', httpStatus: 403 }],
  [404, { status: 'missing', reason: 'not_found' }],
  [500, { status: 'http_error', httpStatus: 500 }],
  [503, { status: 'http_error', httpStatus: 503 }],
] as const) {
  test(`HTTP ${code} -> ${expected.status}`, async () => {
    const r = await fetchSnapshot({ url: URL, fetchImpl: respond(code, 'nope') });
    assert.deepEqual(r, expected);
    assertNoFixture(r);
  });
}

test('network failure -> offline', async () => {
  const r = await fetchSnapshot({
    url: URL,
    fetchImpl: (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
  });
  assert.deepEqual(r, { status: 'offline', detail: 'Failed to fetch' });
  assertNoFixture(r);
});

test('no answer within timeout -> timeout', async () => {
  const hang = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    })) as typeof fetch;
  const r = await fetchSnapshot({ url: URL, fetchImpl: hang, timeoutMs: 30 });
  assert.deepEqual(r, { status: 'timeout', timeoutMs: 30 });
  assertNoFixture(r);
});

test('caller abort propagates instead of reporting offline', async () => {
  const ac = new AbortController();
  const hang = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    })) as typeof fetch;
  const p = fetchSnapshot({ url: URL, fetchImpl: hang, signal: ac.signal, timeoutMs: 5000 });
  ac.abort();
  await assert.rejects(p);
});

test('non-JSON body -> invalid', async () => {
  const r = await fetchSnapshot({ url: URL, fetchImpl: respond(200, '<html>login</html>') });
  assert.deepEqual(r, { status: 'invalid', errors: ['response is not valid JSON'] });
});

test('schema-invalid body -> invalid with errors, nothing shown', async () => {
  const bad = { ...liveSnapshot, projects: [{ ...liveSnapshot.projects[0], deployment: 'deployed' }] };
  const r = await fetchSnapshot({ url: URL, fetchImpl: respond(200, JSON.stringify(bad)) });
  assert.equal(r.status, 'invalid');
  if (r.status === 'invalid') assert.ok(r.errors[0].includes('deployment'));
  assertNoFixture(r);
});

test('empty body -> missing/empty_body', async () => {
  const r = await fetchSnapshot({ url: URL, fetchImpl: respond(200, '   ') });
  assert.deepEqual(r, { status: 'missing', reason: 'empty_body' });
});

test('sends Accept header and optional Authorization, GET only', async () => {
  let seen: RequestInit | undefined;
  await fetchSnapshot({
    url: URL,
    fetchImpl: (async (_u: unknown, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify(liveSnapshot));
    }) as typeof fetch,
    getAuthorization: async () => 'Bearer owner-session',
  });
  const h = seen?.headers as Record<string, string>;
  assert.equal(seen?.method, 'GET');
  assert.equal(h.Accept, 'application/json');
  assert.equal(h.Authorization, 'Bearer owner-session');
});

test('demo loader validates the fixture and labels origin demo-fixture', () => {
  const r = loadDemoSnapshot(() => new Date('2026-11-16T00:00:00Z'));
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') assert.equal(r.origin, 'demo-fixture');
});
