const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { SCHEMES } = require('../lib/theme.ts');
const { DEFAULT_APPEARANCE, appearanceColors, contrast, readAppearance } = require('../lib/appearance.ts');
for (const scheme of SCHEMES) {
  const colors = appearanceColors(scheme.id, DEFAULT_APPEARANCE);
  assert.ok(contrast(colors.neutral[950], colors.neutral[100]) >= 4.5, `${scheme.id} body text contrast`);
  assert.ok(contrast(colors.neutral[950], colors.primary[300]) >= 3, `${scheme.id} accent contrast`);
}
const invalid = readAppearance({ background: 'bad', text: '#fff', frame: 'broken', portraitOpacity: 15 });
assert.equal(invalid.background, ''); assert.equal(invalid.text, ''); assert.equal(invalid.frame, 'rounded'); assert.equal(invalid.portraitOpacity, 1);
const prefs = readAppearance({ ...DEFAULT_APPEARANCE, background: '#000000', text: '#ffffff', accent: '#d8bb78', frame: 'oval', motion: false });
const roundtrip = readAppearance(JSON.parse(JSON.stringify(prefs)));
assert.deepEqual(roundtrip, prefs);
const custom = appearanceColors('gold-dark', roundtrip);
assert.equal(custom.neutral[950], '#000000'); assert.equal(custom.neutral[100], '#ffffff'); assert.equal(custom.primary[400], '#d8bb78');
assert.ok(contrast(custom.neutral[900], custom.neutral[400]) >= 4.5, 'custom secondary text contrast on surfaces');
assert.equal(contrast('#121212', '#121212'), 1, 'low contrast detectable');
console.log('Appearance presets, custom contrast, preference validation, and persistence roundtrip passed.');
