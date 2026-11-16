import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSnapshot } from '../../lib/project-steward/validate';
import { fetchSnapshot } from '../../lib/project-steward/client';
import { isSafeUrl, safeText, sanitizeDeep } from '../../lib/project-steward/text';
import {
  STALE_AFTER_MS,
  attentionReasons,
  filterProjects,
  EMPTY_QUERY,
  freshness,
  refNumber,
  refUrl,
  sourceUrl,
} from '../../lib/project-steward/status';
import { demoSnapshot } from '../../lib/project-steward/fixtures';
import { CONTRACT_CASES_V11 } from './cases';

const respond = (body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body))) as typeof fetch;
const URL_ = 'http://127.0.0.1:9/v0.1/project-steward/snapshot';

for (const c of CONTRACT_CASES_V11) {
  test(`v1.1 case: ${c.name} -> ${c.valid ? 'valid' : 'invalid'}`, () => {
    const r = validateSnapshot(c.data);
    assert.equal(r.ok, c.valid, r.ok ? 'accepted' : r.errors.join('; '));
  });
}

test('write v1.1 cases for schema_crosscheck.py', () => {
  writeFileSync(join(__dirname, 'contract-cases-v11.json'), JSON.stringify(CONTRACT_CASES_V11));
});

test('v1.1 live response: insights and stale window reach the UI, projects stay v1-shaped', async () => {
  const r = await fetchSnapshot({ url: URL_, fetchImpl: respond(CONTRACT_CASES_V11[0].data) });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.equal(r.origin, 'live-api');
  assert.equal(r.snapshot.version, '1.1');
  assert.equal(r.staleAfterMs, 259200 * 1000);
  assert.equal(r.insights?.['lumen'].open_prs?.items.length, 17);
  assert.equal(r.insights?.['chorusfall'], undefined, 'no insights sent -> not collected');
  assert.ok(r.snapshot.projects.every((p) => !('insights' in p)));
});

test('v1.0 live response still works and carries no insights', async () => {
  const r = await fetchSnapshot({ url: URL_, fetchImpl: respond(demoSnapshot) });
  assert.ok(r.status === 'ok' && r.insights === null && r.staleAfterMs === null);
});

test('one bad insights record rejects the whole v1.1 snapshot (nothing partial)', async () => {
  const bad = CONTRACT_CASES_V11.find((c) => c.name === 'v1.1 bad ci state')!;
  const r = await fetchSnapshot({ url: URL_, fetchImpl: respond(bad.data) });
  assert.equal(r.status, 'invalid');
  assert.equal('snapshot' in r, false);
});

test('default stale window is 72h (backend default); a server window overrides it', () => {
  assert.equal(STALE_AFTER_MS, 72 * 3_600_000);
  const now = Date.parse('2026-11-16T00:00:00Z');
  const at60h = '2026-11-13T12:00:00Z';
  assert.equal(freshness(at60h, now), 'fresh');
  assert.equal(freshness(at60h, now, 48 * 3_600_000), 'stale');
  const p = { ...demoSnapshot.projects[0], observed_at: at60h };
  assert.deepEqual(attentionReasons(p, now, null), []);
  assert.deepEqual(attentionReasons(p, now, null, 48 * 3_600_000), ['stale']);
  assert.equal(filterProjects([p], { ...EMPTY_QUERY, quick: 'stale' }, now, null).length, 0);
  assert.equal(filterProjects([p], { ...EMPTY_QUERY, quick: 'stale' }, now, null, 48 * 3_600_000).length, 1);
});

test('URL safety: only clean https URLs are ever opened', () => {
  for (const ok of ['https://github.com/o/r/pull/3', 'https://example.com/a?b=c#d']) {
    assert.equal(isSafeUrl(ok), true, ok);
  }
  for (const bad of [
    'http://example.com/',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>1</script>',
    'file:///etc/passwd',
    'intent://x#Intent;end',
    'myapp://settings',
    '//example.com/x',
    'https://user:pass@example.com/',
    'https://github.com@evil.example/',
    'https://',
    'https://localhost/x',
    'https://example.com/a b',
    'https://example.com/‮gpj.exe',
    'https://example.com/' + 'a'.repeat(600),
  ]) {
    assert.equal(isSafeUrl(bad), false, bad);
    assert.equal(sourceUrl({ kind: 'other', ref: bad, observed_at: '2026-11-15T00:00:00Z' }), null, bad);
    assert.equal(refUrl(bad, 'unknown'), null, bad);
  }
  assert.equal(isSafeUrl(' https://example.com/'), false);
  assert.equal(refUrl('o/r#3', 'pr'), 'https://github.com/o/r/pull/3');
  assert.equal(refUrl('o/r/../x#3', 'pr'), null);
  assert.equal(refNumber('o/r#12'), '#12');
  assert.equal(refNumber('https://github.com/o/r/pull/12'), '#12');
  assert.equal(refNumber('no number'), '');
});

test('names and metadata: control and bidi characters never reach the screen', async () => {
  assert.equal(safeText('Pest‮Trails\u0000​'), 'PestTrails');
  assert.equal(safeText('line one\nline two\ttab'), 'line one\nline two\ttab');
  assert.deepEqual(sanitizeDeep({ a: ['x⁦y', 1, null], b: { c: '\u0007z' } }), { a: ['xy', 1, null], b: { c: 'z' } });
  const dirty = JSON.parse(JSON.stringify(demoSnapshot));
  dirty.projects[0].name = '<img src=x onerror=alert(1)>‮';
  dirty.projects[0].blocked_by = ['rm\u0000 -rf'];
  const r = await fetchSnapshot({ url: URL_, fetchImpl: respond(dirty) });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  // Markup is kept as literal text (the UI renders text nodes only); hidden chars are gone.
  assert.equal(r.snapshot.projects[0].name, '<img src=x onerror=alert(1)>');
  assert.equal(r.snapshot.projects[0].blocked_by[0], 'rm -rf');
});
