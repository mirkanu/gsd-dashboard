'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { _testPauseSession } = require('../gsd');

// ---------------------------------------------------------------------------
// _testPauseSession: verify-before-gracefulShutdown chain (Phase 53 ATV-04)
// ---------------------------------------------------------------------------

test('gsd-pause-session: active session → runVerify called before gracefulShutdown', async () => {
  const calls = [];
  const project = { name: 'proj-a', tmux_session: 'proj-a-sess' };

  const result = await _testPauseSession(project, {
    isTmuxActiveFn: () => true,
    runVerifyFn: async (p, b, opts) => {
      calls.push({ fn: 'runVerify', project: p.name });
      return { ok: true, passed: true };
    },
    gracefulShutdownFn: async (session, name) => {
      calls.push({ fn: 'gracefulShutdown', session, name });
      return { pauseWorkCompleted: true };
    },
    broadcastFn: () => {},
  });

  assert.strictEqual(calls.length, 2, 'both runVerify and gracefulShutdown must be called');
  assert.strictEqual(calls[0].fn, 'runVerify', 'runVerify must run first');
  assert.strictEqual(calls[1].fn, 'gracefulShutdown', 'gracefulShutdown must run second');
  assert.deepStrictEqual(result.verifyResult, { ok: true, passed: true });
  assert.strictEqual(result.pauseWorkCompleted, true);
});

test('gsd-pause-session: inactive session → runVerify skipped, gracefulShutdown still runs', async () => {
  const calls = [];
  const project = { name: 'proj-b', tmux_session: 'proj-b-sess' };

  const result = await _testPauseSession(project, {
    isTmuxActiveFn: () => false,
    runVerifyFn: async () => {
      calls.push('runVerify');
      return { ok: true };
    },
    gracefulShutdownFn: async (session, name) => {
      calls.push('gracefulShutdown');
      return { pauseWorkCompleted: false };
    },
    broadcastFn: () => {},
  });

  assert.strictEqual(calls.includes('runVerify'), false, 'runVerify must NOT be called when session inactive');
  assert.strictEqual(calls.includes('gracefulShutdown'), true, 'gracefulShutdown must still run');
  assert.strictEqual(result.verifyResult, null, 'verifyResult must be null when skipped');
});

test('gsd-pause-session: runVerify failure → gracefulShutdown still runs (never skipped on verify error)', async () => {
  const calls = [];
  const project = { name: 'proj-c', tmux_session: 'proj-c-sess' };

  const result = await _testPauseSession(project, {
    isTmuxActiveFn: () => true,
    runVerifyFn: async () => {
      calls.push('runVerify');
      // Simulate verify returning failure (not throwing)
      return { ok: false, reason: 'timeout' };
    },
    gracefulShutdownFn: async (session, name) => {
      calls.push('gracefulShutdown');
      return { pauseWorkCompleted: true };
    },
    broadcastFn: () => {},
  });

  assert.strictEqual(calls[0], 'runVerify');
  assert.strictEqual(calls[1], 'gracefulShutdown', 'gracefulShutdown must run even when verify fails');
  assert.deepStrictEqual(result.verifyResult, { ok: false, reason: 'timeout' });
  assert.strictEqual(result.pauseWorkCompleted, true);
});
