'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests import from ../gsd/idleDetector which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Plan 03 creates it.
const { isSessionIdle, _testCheckAndCloseSession } = require('../gsd/idleDetector');

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

// ---------------------------------------------------------------------------
// Plan 49-02: busy-marker awareness in _testCheckAndCloseSession
// ---------------------------------------------------------------------------

function _makeBusyFns({
  hasMarkers,
  markers = { count: 0, kinds: [] },
  detectState = 'waiting',
  paneAgeMs = 120_000,
  thresholdMs = 60_000,
  skipLog,
} = {}) {
  const session = 'gsd-prc';
  const nowMs = Date.now();
  const paneCache = new Map();
  // For waiting: seed lastChangedAt so elapsed > threshold
  const lastChangedAt = nowMs - paneAgeMs;
  paneCache.set(session, { hash: 'x', lastChangedAt });
  return {
    session,
    nowMs,
    paneCache,
    fns: {
      detectFn: async () => detectState,
      paneCache,
      nowMs,
      gracefulShutdownFn: async () => ({ pauseWorkCompleted: true }),
      getCostFn: () => ({ dailyCostUsd: 0, rssGb: 0 }),
      logCostFn: () => {},
      isAutopilotFn: () => false,
      getThresholdFn: () => thresholdMs,
      hasBusyMarkersFn: () => hasMarkers,
      getBusyMarkersFn: () => markers,
      logSkipFn: (entry) => { if (skipLog) skipLog.push(entry); },
    },
  };
}

test('idle.busy-markers: pane-waiting + threshold exceeded + markers present → skipped, no shutdown, skip logged', async () => {
  const skipLog = [];
  const { fns, session } = _makeBusyFns({
    hasMarkers: true,
    markers: { count: 2, kinds: ['bash_bg', 'wakeup'] },
    skipLog,
  });
  const shutdownGuard = async () => { throw new Error('should not be called'); };
  fns.gracefulShutdownFn = shutdownGuard;

  const result = await _testCheckAndCloseSession(
    { name: 'prc', tmux_session: session },
    fns,
  );

  assert.deepStrictEqual(result, {
    action: 'skipped',
    reason: 'busy-markers-present',
    project: 'prc',
    markers: { count: 2, kinds: ['bash_bg', 'wakeup'] },
  });
  assert.strictEqual(skipLog.length, 1, 'exactly one skip log entry');
  const entry = skipLog[0];
  assert.strictEqual(entry.session, session);
  assert.strictEqual(entry.project, 'prc');
  assert.strictEqual(entry.reason, 'busy-markers-present');
  assert.deepStrictEqual(entry.markers, { count: 2, kinds: ['bash_bg', 'wakeup'] });
  assert.ok(!isNaN(Date.parse(entry.ts)), 'ts is valid ISO-8601');
});

test('idle.busy-markers: pane-waiting + threshold exceeded + markers absent → graceful shutdown still runs', async () => {
  const skipLog = [];
  const { fns, session } = _makeBusyFns({ hasMarkers: false, skipLog });
  const shutdownCalls = [];
  fns.gracefulShutdownFn = async (s, p) => { shutdownCalls.push({ s, p }); return { pauseWorkCompleted: true }; };

  const result = await _testCheckAndCloseSession(
    { name: 'prc', tmux_session: session },
    fns,
  );

  assert.strictEqual(result.action, 'graceful-shutdown');
  assert.strictEqual(shutdownCalls.length, 1);
  assert.strictEqual(skipLog.length, 0, 'no skip logged when no markers');
});

test('khw.pivot: pane-working → _testCheckAndCloseSession returns null (no auto-close)', async () => {
  const skipLog = [];
  const { fns, session } = _makeBusyFns({
    hasMarkers: true,
    detectState: 'working',
    skipLog,
  });
  fns.gracefulShutdownFn = async () => { throw new Error('should not be called'); };

  const result = await _testCheckAndCloseSession(
    { name: 'prc', tmux_session: session },
    fns,
  );

  assert.strictEqual(result, null, 'working sessions are never auto-closed');
  assert.strictEqual(skipLog.length, 0, 'no skip logged for working sessions');
});

test('idle.busy-markers: expired markers purged (hasBusyMarkers returns false) → shutdown runs', async () => {
  const skipLog = [];
  // Simulates busyMarkers.hasBusyMarkers returning false because all markers expired
  // and were purged on read. Shutdown should then proceed normally.
  const { fns, session } = _makeBusyFns({ hasMarkers: false, skipLog });
  const shutdownCalls = [];
  fns.gracefulShutdownFn = async (s, p) => { shutdownCalls.push({ s, p }); return { pauseWorkCompleted: false }; };

  const result = await _testCheckAndCloseSession(
    { name: 'prc', tmux_session: session },
    fns,
  );

  assert.strictEqual(result.action, 'graceful-shutdown');
  assert.strictEqual(shutdownCalls.length, 1);
  assert.strictEqual(skipLog.length, 0);
});

test('idle.busy-markers: skip-log JSONL schema: ts, session, project, reason, markers{count,kinds}', async () => {
  const skipLog = [];
  const { fns, session } = _makeBusyFns({
    hasMarkers: true,
    markers: { count: 1, kinds: ['agent'] },
    skipLog,
  });

  await _testCheckAndCloseSession(
    { name: 'prc', tmux_session: session },
    fns,
  );

  assert.strictEqual(skipLog.length, 1);
  const keys = Object.keys(skipLog[0]).sort();
  assert.deepStrictEqual(keys, ['markers', 'project', 'reason', 'session', 'ts']);
  assert.deepStrictEqual(Object.keys(skipLog[0].markers).sort(), ['count', 'kinds']);
});
