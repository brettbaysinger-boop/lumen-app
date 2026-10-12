const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(
  fs.readFileSync('lib/memory-subject.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { memorySubjectIssue } = sandbox.exports;

for (const companion of ['Nova', 'Aria', 'Atlas']) {
  assert.match(
    memorySubjectIssue(
      `The user wants ${companion} to learn coding.`,
      'companion',
      companion,
      'preference',
    ),
    /describes you/i,
  );

  assert.match(
    memorySubjectIssue(
      `${companion}'s birthday is October 3.`,
      'user',
      companion,
    ),
    new RegExp(`describes ${companion}`, 'i'),
  );

  assert.equal(
    memorySubjectIssue(
      `${companion}'s learning queue includes Python.`,
      'companion',
      companion,
    ),
    null,
  );
}

assert.match(
  memorySubjectIssue(
    "The user's next step is testing memory.",
    'unknown',
    'Nova',
    'episodic',
  ),
  /clearly describes you/i,
);

assert.equal(
  memorySubjectIssue(
    'The user refers to Nova as captain.',
    'shared',
    'Nova',
    'relationship',
  ),
  null,
);

console.log('Generic end-user + companion memory subject checks passed.');
