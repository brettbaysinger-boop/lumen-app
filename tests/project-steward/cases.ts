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
