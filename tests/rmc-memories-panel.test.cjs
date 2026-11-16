const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('RMC panel compiles as TSX and is gated behind confirmed RMC mode', () => {
  const panel = source('components/RmcMemoriesPanel.tsx');
  const entry = source('app/(tabs)/memories.tsx');
  const transpiled = ts.transpileModule(panel, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics?.length || 0, 0);
  assert.match(entry, /backendState\.kind === 'rmc'/);
  assert.match(entry, /<RmcMemoriesPanel companion=\{companion\}/);
  assert.match(panel, /complete_inventory/);
  assert.match(panel, /not every saved memory/);
});

test('RMC panel uses authenticated RMC endpoints; no direct Supabase memory table', () => {
  const panel = source('components/RmcMemoriesPanel.tsx');
  assert.match(panel, /\/v0\.2\/rmc\/memories/);
  assert.match(panel, /\/v0\.2\/rmc\/receipts/);
  assert.match(panel, /supabase\.auth\.getSession\(\)/);
  assert.match(panel, /currentUser\.current !== expected/);
  assert.doesNotMatch(panel, /supabase\.from\(['"]memories['"]\)/);
  assert.doesNotMatch(panel, /supabase\.rpc\(/);
});

test('RMC save is idempotent on network uncertainty and avoids false success', () => {
  const panel = source('components/RmcMemoriesPanel.tsx');
  assert.match(panel, /const operation = pendingSave \?\? \{ text: content, id: requestKey\(\) \}/);
  assert.match(panel, /request_id: operation\.id/);
  assert.match(panel, /if \(pendingSave && pendingSave\.text !== content\)/);
  assert.match(panel, /Check search before retrying/);
  assert.match(panel, /reply\.confirmed/);
  assert.match(panel, /Automatic long-term learning: ON for eligible lasting facts/);
  assert.match(panel, /Automatic memory activity/);
  assert.match(panel, /auto_receipts/);
  assert.doesNotMatch(panel, /Automatic long-term extraction from ordinary conversations is currently off/);
});

test('backend receipts are tagged RMC-only and no list-all is claimed', () => {
  const routes = source('backend/lumen/rmc/memory_routes.py');
  const runtime = source('backend/lumen/runtime.py');
  const main = source('backend/lumen/main.py');
  assert.match(main, /app\.include_router\(rmc_memory_router\)/);
  assert.match(routes, /"complete_inventory": False/);
  assert.match(routes, /metadata\.get\("memory_backend"\) != "rmc"/);
  assert.match(routes, /"_request"|"messages"/);
  assert.match(runtime, /"memory_backend": \("rmc" if rmc_memory is not None else "supabase"\)/);
});
