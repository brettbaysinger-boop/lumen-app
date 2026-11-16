import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInsights, validateInsightsMap, isSafeUrl } from '../../lib/project-steward/insights';
import { demoInsights } from '../../lib/project-steward/fixtures-insights';
import { demoSnapshot } from '../../lib/project-steward/fixtures';
import { loadDemoSnapshot, fetchSnapshot } from '../../lib/project-steward/client';
import {
  EMPTY_QUERY,
  attentionQueue,
  attentionReasons,
  cardSignals,
  filterProjects,
  refUrl,
  shortDuration,
} from '../../lib/project-steward/status';

const NOW = Date.parse('2026-11-16T02:30:00Z');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const project = (id: string) => demoSnapshot.projects.find((p) => p.id === id)!;

test('demo insights validate and only reference fixture projects', () => {
  assert.deepEqual(validateInsightsMap(demoInsights), []);
  const ids = new Set(demoSnapshot.projects.map((p) => p.id));
  for (const id of Object.keys(demoInsights)) assert.ok(ids.has(id), `unknown project ${id}`);
});

test('demo insights record no deployment and no passing CI for any real project', () => {
  for (const [id, ins] of Object.entries(demoInsights)) {
    if (id.startsWith('ui-sample-')) continue;
    assert.equal(ins.last_deploy, null, `${id} has a deploy`);
    assert.notEqual(ins.ci?.state, 'passing', `${id} claims passing CI`);
    assert.ok(!ins.links.some((l) => l.kind === 'live'), `${id} has a live URL`);
  }
});

test('demo loader supplies insights; a live v1 snapshot supplies none', async () => {
  const demo = loadDemoSnapshot();
  assert.ok(demo.status === 'ok' && demo.insights !== null);
  const live = await fetchSnapshot({
    url: 'http://127.0.0.1:9/x',
    fetchImpl: (async () => new Response(JSON.stringify(demoSnapshot))) as typeof fetch,
  });
  assert.ok(live.status === 'ok' && live.insights === null);
});

test('insights validator rejects bad shapes', () => {
  const bad = (fn: (i: any) => void) => {
    const i = clone(demoInsights['lumen']) as any;
    fn(i);
    return validateInsights(i).length > 0;
  };
  assert.ok(bad((i) => (i.ci.state = 'green')));
  assert.ok(bad((i) => (i.open_prs.items[0].review = 'merged')));
  assert.ok(bad((i) => (i.open_prs.items[0].ref = 'not-a-ref')));
  assert.ok(bad((i) => (i.links[0].url = 'http://insecure.example')));
  assert.ok(bad((i) => (i.links[0].url = 'javascript:alert(1)')));
  assert.ok(bad((i) => (i.last_commit.at = 'yesterday')));
  assert.ok(bad((i) => (i.token = 'x')));
  assert.ok(bad((i) => delete i.next));
  assert.ok(bad((i) => (i.activity = [{ at: '2026-11-16T00:00:00Z', kind: 'tweet', text: 'x', ref: null }])));
  assert.equal(isSafeUrl('https://github.com/a/b'), true);
  assert.equal(isSafeUrl('https://a b'), false);
});

test('shortDuration and refUrl', () => {
  assert.equal(shortDuration(35 * 60_000), '35m');
  assert.equal(shortDuration(5 * 3_600_000), '5h');
  assert.equal(shortDuration(14 * 86_400_000), '14d');
  assert.equal(refUrl('o/r#3', 'pr'), 'https://github.com/o/r/pull/3');
  assert.equal(refUrl('o/r#3', 'unknown'), 'https://github.com/o/r/issues/3');
  assert.equal(refUrl('synthetic-fixture://x', 'unknown'), null);
  assert.equal(refUrl(null, 'pr'), null);
});

test('card signals: at most two, most urgent first, nothing when healthy or missing', () => {
  assert.deepEqual(cardSignals(null, NOW), []);
  assert.deepEqual(cardSignals(demoInsights['pesttrails'], NOW), []);
  assert.deepEqual(cardSignals(demoInsights['ui-sample-verified'], NOW), []);
  const steward = cardSignals(demoInsights['project-steward'], NOW);
  assert.deepEqual(steward.map((s) => s.key), ['decision', 'prs']);
  assert.equal(steward[1].label, '4 open PRs · oldest 1h');
  const all = clone(demoInsights['project-steward']);
  all.ci!.state = 'failing';
  assert.deepEqual(cardSignals(all, NOW).map((s) => s.key), ['decision', 'ci']);
  assert.match(cardSignals(demoInsights['lumen'], NOW)[0].label, /^17 open PRs · oldest \d+d$/);
});

test('owner decisions and failing CI join the attention queue', () => {
  assert.ok(attentionReasons(project('project-steward'), NOW, demoInsights['project-steward']).includes('owner_decision'));
  assert.ok(attentionReasons(project('ui-sample-reported'), NOW, demoInsights['ui-sample-reported']).includes('ci_failing'));
  // A project that is otherwise clean enters the queue once CI fails.
  const ins = clone(demoInsights);
  assert.ok(!attentionQueue(demoSnapshot.projects, NOW, ins).some((i) => i.project.id === 'pesttrails'));
  ins['pesttrails'].ci = { state: 'failing', branch: 'main', run_ref: null, commit_sha: null, observed_at: '2026-11-16T02:00:00Z' };
  const q = attentionQueue(demoSnapshot.projects, NOW, ins);
  assert.ok(q.some((i) => i.project.id === 'pesttrails'));
  assert.deepEqual(
    filterProjects(demoSnapshot.projects, { ...EMPTY_QUERY, quick: 'attention' }, NOW, ins).map((p) => p.id).sort(),
    q.map((i) => i.project.id).sort(),
  );
});
