'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests import from ../gsd/idleDetector which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Plan 03 creates it.
const { isSessionIdle, forceKillIfOverdue } = require('../gsd/idleDetector');

test('idle.detect: waiting + pane unchanged > threshold → isSessionIdle returns true', async () => {
  const result = await isSessionIdle('test-session', {
    sessionState: 'waiting',
    lastChangedAt: Date.now() - 120_000, // 2 minutes ago
    threshold: 60_000,                    // 1 minute threshold
    isAutopilot: false,
  });
  assert.strictEqual(result, true);
});

test('idle.detect: working + pane unchanged > threshold → isSessionIdle returns false', async () => {
  const result = await isSessionIdle('test-session', {
    sessionState: 'working',
    lastChangedAt: Date.now() - 120_000,
    threshold: 60_000,
    isAutopilot: false,
  });
  assert.strictEqual(result, false);
});

test('idle.detect: waiting + pane changed within threshold → isSessionIdle returns false', async () => {
  const result = await isSessionIdle('test-session', {
    sessionState: 'waiting',
    lastChangedAt: Date.now() - 10_000, // 10 seconds ago
    threshold: 60_000,
    isAutopilot: false,
  });
  assert.strictEqual(result, false);
});

test('idle.autopilot: autopilot session uses 2× threshold', async () => {
  // Autopilot doubles the idle threshold — a session idle for 1.5× base threshold
  // should NOT be idle when it IS autopilot (2× threshold applies)
  const baseThreshold = 60_000;
  const idleFor = 90_000; // 1.5× base — idle under 2× but over 1×

  const notIdleAutopilot = await isSessionIdle('test-session', {
    sessionState: 'waiting',
    lastChangedAt: Date.now() - idleFor,
    threshold: baseThreshold,
    isAutopilot: true, // uses 2× = 120s threshold, so 90s is not idle
  });
  assert.strictEqual(notIdleAutopilot, false, 'autopilot session should not be idle at 1.5× base threshold');

  const idleNonAutopilot = await isSessionIdle('test-session', {
    sessionState: 'waiting',
    lastChangedAt: Date.now() - idleFor,
    threshold: baseThreshold,
    isAutopilot: false, // uses 1× = 60s threshold, so 90s IS idle
  });
  assert.strictEqual(idleNonAutopilot, true, 'non-autopilot session should be idle at 1.5× base threshold');
});

test('force.kill: working session > 6h → forceKill without gracefulShutdown', async () => {
  const killed = [];
  const gracefulCalls = [];

  const result = await forceKillIfOverdue('test-session', 'test-project', {
    sessionState: 'working',
    stateEnteredAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), // 7h ago
    forceKillThresholdMs: 6 * 60 * 60 * 1000, // 6h
    killFn: (s) => { killed.push(s); },
    gracefulShutdownFn: (s, p) => { gracefulCalls.push({ s, p }); },
    notifyFn: async () => {},
  });

  assert.strictEqual(result.forceKilled, true, 'should force-kill working session over 6h');
  assert.ok(killed.includes('test-session'), 'should call kill');
  assert.strictEqual(gracefulCalls.length, 0, 'should NOT call gracefulShutdown for force kill');
});
