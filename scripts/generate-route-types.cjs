// Regenerate Expo Router declarations before tsc, including after branch changes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'app');
const context = require('expo-router/build/testing-library/require-context-ponyfill').default;
const { EXPO_ROUTER_CTX_IGNORE } = require('expo-router/_ctx-shared');
const { getTypedRoutesDeclarationFile } = require('expo-router/build/typed-routes/generate');
const declaration = getTypedRoutesDeclarationFile(context(process.env.EXPO_ROUTER_APP_ROOT, true, EXPO_ROUTER_CTX_IGNORE));
if (!declaration) throw new Error('Expo Router did not generate route declarations.');
const output = path.join(root, '.expo', 'types');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'router.d.ts'), declaration);
