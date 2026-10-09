const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const screen = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
const list = fs.readFileSync('components/ConversationList.tsx', 'utf8');

test('chat messages use a stable callback', () => {
  assert.match(screen, /const renderMessage = useCallback\(/);
  assert.match(screen, /renderItem=\{renderMessage\}/);
});

test('web message rows are memoized', () => {
  assert.match(list, /const MemoizedWebMessage = memo\(/);
  assert.match(list, /previous\.item === next\.item/);
  assert.match(list, /previous\.renderItem === next\.renderItem/);
});

test('message renderer retains interactive dependencies', () => {
  const start = screen.indexOf('const renderMessage = useCallback(');
  const end = screen.indexOf('\n  useEffect(', start);

  assert.ok(start >= 0 && end > start);

  const callback = screen.slice(start, end);

  for (const dependency of [
    'styles', 'colors', 'companionState', 'speakingId',
    'expandedActivity', 'playingId', 'voiceBusy', 'togglePlayback'
  ]) {
    assert.ok(callback.includes(dependency), 'Missing dependency: ' + dependency);
  }
});
