import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSnapshot } from '../../lib/project-steward/validate';
import {
  DEPLOYMENT_STATES,
  DEV_STATES,
  EVIDENCE_LEVELS,
  PRIORITIES,
  SOURCE_KINDS,
} from '../../lib/project-steward/types';
import { CONTRACT_CASES } from './cases';

// run-unit.sh runs from the repo root.
const ROOT = process.cwd();
const schema = JSON.parse(
  readFileSync(join(ROOT, 'contracts/project-steward/project-snapshot.v1.schema.json'), 'utf8'),
);

for (const c of CONTRACT_CASES) {
  test(`contract case: ${c.name} -> ${c.valid ? 'valid' : 'invalid'}`, () => {
    const r = validateSnapshot(c.data);
    assert.equal(r.ok, c.valid, r.ok ? 'accepted' : r.errors.join('; '));
  });
}

test('UI enums match the schema enums exactly (drift guard)', () => {
  const p = schema.$defs.project.properties;
  assert.deepEqual([...PRIORITIES], p.priority.enum);
  assert.deepEqual([...DEV_STATES], p.state.enum);
  assert.deepEqual([...DEPLOYMENT_STATES], p.deployment.enum);
  assert.deepEqual([...EVIDENCE_LEVELS], p.evidence_level.enum);
  assert.deepEqual([...SOURCE_KINDS], schema.$defs.source.properties.kind.enum);
  assert.deepEqual(schema.required, ['version', 'generated_at', 'projects']);
});

test('invalid snapshot reports readable paths', () => {
  const r = validateSnapshot({ version: '1.0', generated_at: 'x', projects: [{ id: 'A' }] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.startsWith('snapshot.generated_at')));
    assert.ok(r.errors.some((e) => e.startsWith('projects[0].id')));
    assert.ok(r.errors.some((e) => e.includes('missing required "deployment"')));
  }
});

test('duplicate project ids are rejected (UI routing guard, stricter than schema)', () => {
  const r = validateSnapshot({
    version: '1.0',
    generated_at: '2026-11-15T00:00:00Z',
    projects: [0, 1].map(() => ({
      id: 'dup',
      name: 'Dup',
      priority: 'p1',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      repositories: [],
      blocked_by: [],
      sources: [],
      observed_at: null,
    })),
  });
  assert.equal(r.ok, false);
});

// Export the cases for the independent Python JSON-schema cross-check.
test('write contract cases for schema_crosscheck.py', () => {
  const out = join(__dirname, 'contract-cases.json');
  writeFileSync(out, JSON.stringify(CONTRACT_CASES, null, 2));
  assert.ok(readFileSync(out, 'utf8').length > 0);
});
