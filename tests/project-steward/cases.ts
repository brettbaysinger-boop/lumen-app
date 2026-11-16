// Shared contract cases: each is checked by our validator (validate.test.ts) AND by an
// independent JSON-schema implementation (schema_crosscheck.py) so the two cannot drift.
import { demoSnapshot } from '../../lib/project-steward/fixtures';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ContractCase {
  name: string;
  valid: boolean;
  data: Json;
}

function clone(): Json {
  return JSON.parse(JSON.stringify(demoSnapshot));
}

function mutate(fn: (s: Json) => void): Json {
  const s = clone();
  fn(s);
  return s;
}

export const CONTRACT_CASES: ContractCase[] = [
  { name: 'demo fixture', valid: true, data: clone() },
  { name: 'empty project list', valid: true, data: mutate((s) => (s.projects = [])) },
  {
    name: 'null observed_at and null commit_sha',
    valid: true,
    data: mutate((s) => {
      s.projects[0].observed_at = null;
      s.projects[0].sources[0].commit_sha = null;
    }),
  },
  { name: 'summary omitted', valid: true, data: mutate((s) => delete s.projects[0].summary) },
  { name: 'wrong version', valid: false, data: mutate((s) => (s.version = '2.0')) },
  { name: 'extra top-level key', valid: false, data: mutate((s) => (s.demo = true)) },
  { name: 'missing generated_at', valid: false, data: mutate((s) => delete s.generated_at) },
  { name: 'bad generated_at', valid: false, data: mutate((s) => (s.generated_at = 'yesterday')) },
  { name: 'extra project key', valid: false, data: mutate((s) => (s.projects[0].health = 'green')) },
  { name: 'missing deployment', valid: false, data: mutate((s) => delete s.projects[0].deployment) },
  {
    name: 'deployment "deployed" is not a v1 value',
    valid: false,
    data: mutate((s) => (s.projects[0].deployment = 'deployed')),
  },
  { name: 'bad state', valid: false, data: mutate((s) => (s.projects[0].state = 'done')) },
  { name: 'bad priority', valid: false, data: mutate((s) => (s.projects[0].priority = 'P0')) },
  { name: 'bad id', valid: false, data: mutate((s) => (s.projects[0].id = 'Pest Trails')) },
  { name: 'empty name', valid: false, data: mutate((s) => (s.projects[0].name = '')) },
  { name: 'name too long', valid: false, data: mutate((s) => (s.projects[0].name = 'x'.repeat(101))) },
  {
    name: 'summary too long',
    valid: false,
    data: mutate((s) => (s.projects[0].summary = 'x'.repeat(1001))),
  },
  {
    name: 'bad repository',
    valid: false,
    data: mutate((s) => (s.projects[0].repositories = ['https://github.com/a/b'])),
  },
  {
    name: 'duplicate repositories',
    valid: false,
    data: mutate((s) => (s.projects[0].repositories = ['a/b', 'a/b'])),
  },
  {
    name: 'blocker too long',
    valid: false,
    data: mutate((s) => (s.projects[0].blocked_by = ['x'.repeat(241)])),
  },
  {
    name: 'observed_at missing (required even though nullable)',
    valid: false,
    data: mutate((s) => delete s.projects[0].observed_at),
  },
  {
    name: 'bad source kind',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].kind = 'slack')),
  },
  {
    name: 'empty source ref',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].ref = '')),
  },
  {
    name: 'uppercase commit sha',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].commit_sha = 'ABC1234')),
  },
  {
    name: 'short commit sha',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].commit_sha = 'abc12')),
  },
  {
    name: 'extra source key',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].token = 'x')),
  },
  {
    name: 'source observed_at without offset',
    valid: false,
    data: mutate((s) => (s.projects[0].sources[0].observed_at = '2026-11-15T21:00:00')),
  },
  { name: 'projects not an array', valid: false, data: mutate((s) => (s.projects = {})) },
  { name: 'not an object', valid: false, data: [] },
];

// ---------- proposed v1.1 ----------
import { demoInsights } from '../../lib/project-steward/fixtures-insights';

function v11(fn: (s: Json) => void = () => {}): Json {
  const s = clone();
  s.version = '1.1';
  s.stale_after_seconds = 259200;
  for (const p of s.projects) {
    const ins = (demoInsights as Json)[p.id];
    if (ins) p.insights = JSON.parse(JSON.stringify(ins));
  }
  fn(s);
  return s;
}
const lumen = (s: Json) => s.projects.find((p: Json) => p.id === 'lumen');

export const CONTRACT_CASES_V11: ContractCase[] = [
  { name: 'v1.1 with insights and stale_after_seconds', valid: true, data: v11() },
  { name: 'v1.1 without stale_after_seconds', valid: true, data: v11((s) => delete s.stale_after_seconds) },
  { name: 'v1.1 with no insights anywhere', valid: true, data: v11((s) => s.projects.forEach((p: Json) => delete p.insights)) },
  { name: 'v1.1 all insight groups null/empty', valid: true, data: v11((s) => (lumen(s).insights = { observed_at: '2026-11-16T02:00:00Z', open_prs: null, last_commit: null, last_deploy: null, ci: null, next: [], activity: [], links: [] })) },
  { name: 'v1.1 PR ref as https URL', valid: true, data: v11((s) => (lumen(s).insights.open_prs.items[0].ref = 'https://github.com/o/r/pull/3')) },
  { name: 'v1.1 stale_after_seconds too small', valid: false, data: v11((s) => (s.stale_after_seconds = 60)) },
  { name: 'v1.1 stale_after_seconds not integer', valid: false, data: v11((s) => (s.stale_after_seconds = 3600.5)) },
  { name: 'v1.1 unknown top-level key', valid: false, data: v11((s) => (s.demo = true)) },
  { name: 'v1.1 unknown insights key', valid: false, data: v11((s) => (lumen(s).insights.health = 'green')) },
  { name: 'v1.1 insights missing a group', valid: false, data: v11((s) => delete lumen(s).insights.ci) },
  { name: 'v1.1 bad ci state', valid: false, data: v11((s) => (lumen(s).insights.ci.state = 'green')) },
  { name: 'v1.1 bad review state', valid: false, data: v11((s) => (lumen(s).insights.open_prs.items[0].review = 'merged')) },
  { name: 'v1.1 http link', valid: false, data: v11((s) => (lumen(s).insights.links[0].url = 'http://example.com/')) },
  { name: 'v1.1 javascript link', valid: false, data: v11((s) => (lumen(s).insights.links[0].url = 'javascript:alert(1)')) },
  { name: 'v1.1 bad PR ref', valid: false, data: v11((s) => (lumen(s).insights.open_prs.items[0].ref = 'not a ref')) },
  { name: 'v1.1 bad last_commit time', valid: false, data: v11((s) => (lumen(s).insights.last_commit.at = 'yesterday')) },
  { name: 'v1.1 bad head sha', valid: false, data: v11((s) => (lumen(s).insights.open_prs.items[0].head_sha = 'XYZ')) },
  { name: 'v1.1 insights is null', valid: false, data: v11((s) => (lumen(s).insights = null)) },
  { name: 'v1.0 carrying insights (not allowed in 1.0)', valid: false, data: v11((s) => { s.version = '1.0'; delete s.stale_after_seconds; }) },
];
