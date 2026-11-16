import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { projectSnapshotUrl } from '../../lib/project-steward/snapshot-url';

test('PS-06: canonical v1.1 URL uses configured Lumen API only', () => {
  assert.equal(
    projectSnapshotUrl('https://lumen.example.test:8446/'),
    'https://lumen.example.test:8446/v0.1/project-steward/snapshot/v1.1',
  );
  assert.equal(
    projectSnapshotUrl('http://127.0.0.1:8765'),
    'http://127.0.0.1:8765/v0.1/project-steward/snapshot/v1.1',
  );
});

test('PS-06: no bearer to arbitrary snapshot, embedded credentials, or unsafe URL', () => {
  for (const value of [
    undefined, '', 'http://example.com', 'https://user:secret@example.com',
    'https://example.com/malicious', 'https://example.com?to=evil',
    'https://example.com/#fragment', 'javascript:alert(1)',
    'file:///etc/passwd', 'http://0.0.0.0:8000', 'https://example.com@evil.test',
  ]) assert.equal(projectSnapshotUrl(value), undefined, String(value));
});
