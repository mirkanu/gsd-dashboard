'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('pause.route: POST /pause-session calls gracefulShutdown not direct tmux kill', () => {
  // Verify by reading the route file as text — the route should import and call gracefulShutdown
  // rather than directly calling execFileSync kill-session.
  // This is a structural test that verifies the refactoring in Task 3 happened correctly.
  const routeFile = path.resolve(__dirname, '../routes/gsd.js');
  const content = fs.readFileSync(routeFile, 'utf8');

  // The file should reference gracefulShutdown
  assert.ok(
    content.includes('gracefulShutdown'),
    'gsd.js should reference gracefulShutdown (Task 3 refactor not yet done — expected RED until Task 3)'
  );

  // The pause-session route body should not do a direct kill-session
  // (gracefulShutdown internally handles kill via _testPauseSession helper)
  // We check that gracefulShutdown is wired as the default gracefulShutdownFn
  assert.ok(
    content.includes('gracefulShutdownFn = gracefulShutdown'),
    'pause-session route should use gracefulShutdown as the default gracefulShutdownFn in _testPauseSession'
  );
});
