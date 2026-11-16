import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QUERY,
  absoluteUtc,
  attentionQueue,
  attentionReasons,
  filterProjects,
  freshness,
  knownAndUnknown,
  relativeAge,
  sourceUrl,
} from '../../lib/project-steward/status';
import { demoSnapshot } from '../../lib/project-steward/fixtures';
import type { Project } from '../../lib/project-steward/types';

const NOW = Date.parse('2026-11-16T02:00:00Z');
const projects = demoSnapshot.projects;
const byId = (id: string) => projects.find((p) => p.id === id) as Project;

test('fixture includes every project the brief requires', () => {
  const names = projects.map((p) => p.name).join(' | ');
  for (const n of [
    'PestTrails',
    'Chorusfall',
    'DreamVault',
    'Wisdom of the Crowd',
    "Brett's Games",
    'Forge',
    'Lumen',
    'Brother Memory',
  ]) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('fixture claims no current production health for any real project', () => {
  for (const p of projects) {
    if (p.id.startsWith('ui-sample-')) {
      assert.ok(p.name.startsWith('UI sample'), 'synthetic rows must say so in their name');
      assert.match(p.summary ?? '', /Synthetic row, not a real project/);
      continue;
    }
    assert.notEqual(p.deployment, 'verified_current', `${p.id} claims verified_current`);
    assert.notEqual(p.evidence_level, 'host_verified', `${p.id} claims host_verified`);
    assert.notEqual(p.deployment, 'reported', `${p.id} claims a reported deployment`);
  }
});

test('freshness: fresh / stale / unknown', () => {
  assert.equal(freshness('2026-11-16T01:00:00Z', NOW), 'fresh');
  assert.equal(freshness('2026-11-13T01:00:00Z', NOW), 'stale');
  assert.equal(freshness(null, NOW), 'unknown');
  assert.equal(freshness('garbage', NOW), 'unknown');
});

test('relativeAge and absoluteUtc are honest about odd inputs', () => {
  assert.equal(relativeAge('2026-11-16T01:30:00Z', NOW), '30m ago');
  assert.equal(relativeAge('2026-11-15T20:00:00Z', NOW), '6h ago');
  assert.equal(relativeAge('2026-11-08T12:00:00Z', NOW), '8d ago');
  assert.equal(relativeAge(null, NOW), 'never checked');
  assert.match(relativeAge('2026-11-17T00:00:00Z', NOW), /future/);
  assert.equal(absoluteUtc('2026-11-15T21:00:00Z'), '2026-11-15 21:00 UTC');
  assert.equal(absoluteUtc('2026-11-15T14:00:00-07:00'), '2026-11-15 21:00 UTC');
});

test('attention reasons', () => {
  assert.deepEqual(attentionReasons(byId('lumen'), NOW), ['blocked']);
  assert.deepEqual(attentionReasons(byId('forge'), NOW), ['stale']);
  assert.deepEqual(attentionReasons(byId('dreamvault'), NOW), ['never_checked', 'no_sources']);
  assert.deepEqual(attentionReasons(byId('pesttrails'), NOW), []);
});

test('attention queue: blocked first, then by priority; on-hold excluded', () => {
  const q = attentionQueue(projects, NOW).map((i) => i.project.id);
  assert.deepEqual(q.slice(0, 2), ['project-steward', 'lumen']); // same priority, sorted by name
  assert.ok(q.includes('forge') && q.includes('dreamvault'));
  assert.ok(!q.includes('ui-sample-reported'), 'on_hold project should not nag');
  assert.ok(q.indexOf('dreamvault') < q.indexOf('wisdom-of-the-crowd'), 'p2 before p3');
});

test('search matches name, repo, blocker and source refs; terms are ANDed', () => {
  const ids = (text: string) =>
    filterProjects(projects, { ...EMPTY_QUERY, text }, NOW).map((p) => p.id);
  assert.deepEqual(ids('pesttrails'), ['pesttrails']);
  assert.deepEqual(ids('pest-control-platform'), ['pesttrails']);
  assert.deepEqual(ids('gold master'), ['lumen']);
  assert.deepEqual(ids('bm_chat'), ['brother-memory']);
  assert.deepEqual(ids('zzz-no-match'), []);
});

test('quick filters and priority filter', () => {
  const ids = (q: Partial<typeof EMPTY_QUERY>) =>
    filterProjects(projects, { ...EMPTY_QUERY, ...q }, NOW).map((p) => p.id);
  assert.deepEqual(ids({ quick: 'blocked' }), ['project-steward', 'lumen']); // same priority, sorted by name
  assert.deepEqual(ids({ quick: 'stale' }).sort(), ['dreamvault', 'forge', 'wisdom-of-the-crowd']);
  assert.deepEqual(ids({ quick: 'deployed_evidence' }), ['lumen', 'ui-sample-verified']);
  assert.deepEqual(ids({ priority: 'p0' }), ['pesttrails']);
  // Filter count must equal the sidebar queue.
  assert.deepEqual(ids({ quick: 'attention' }).sort(), attentionQueue(projects, NOW).map((i) => i.project.id).sort());
  // Sorted by priority then name.
  assert.equal(ids({})[0], 'pesttrails');
  assert.equal(ids({}).at(-1), 'ui-sample-reported');
});

test('sourceUrl links only safe, unambiguous refs', () => {
  const s = (kind: any, ref: string) => sourceUrl({ kind, ref, observed_at: '2026-11-15T00:00:00Z' });
  assert.equal(s('git_pr', 'o/r#10'), 'https://github.com/o/r/pull/10');
  assert.equal(s('git_issue', 'o/r#6'), 'https://github.com/o/r/issues/6');
  assert.equal(s('git_repo', 'o/r'), 'https://github.com/o/r');
  assert.equal(s('other', 'https://example.com/x'), 'https://example.com/x');
  assert.equal(s('other', 'http://example.com/x'), null);
  assert.equal(s('other', 'javascript:alert(1)'), null);
  assert.equal(s('owner_report', 'o/r#3'), null);
  assert.equal(s('other', 'synthetic-fixture://ui-sample/x'), null);
});

test('known vs unknown never turns unknown deployment into a claim', () => {
  const f = knownAndUnknown(byId('pesttrails'), NOW);
  assert.ok(f.unknown.some((u) => u.startsWith('Deployment status is unknown')));
  assert.ok(!f.known.some((k) => /deploy/i.test(k)));
  const lumen = knownAndUnknown(byId('lumen'), NOW);
  assert.ok(lumen.unknown.some((u) => u.includes('still running now')));
  const dv = knownAndUnknown(byId('dreamvault'), NOW);
  assert.ok(dv.unknown.some((u) => u.includes('never been checked')));
  assert.ok(dv.unknown.some((u) => u.includes('No sources')));
});
