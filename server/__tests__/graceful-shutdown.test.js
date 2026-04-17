'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests import from ../gsd/gracefulShutdown which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Task 2 creates it.
const { _testGracefulShutdown } = require('../gsd/gracefulShutdown');

test('graceful.shutdown: sends /gsd-pause-work into pane then kills session', async () => {
  const sentKeys = [];
  const killed = [];
  const notified = [];
  let captureCallCount = 0;

  const fns = {
    isTmuxActiveFn: () => true,
    sendKeysFn: (session, text) => { sentKeys.push({ session, text }); },
    captureFn: () => {
      captureCallCount++;
      // Return marker text on second call to simulate successful pause-work
      if (captureCallCount >= 2) return 'wip: phase-48 paused at task 1/3';
      return 'some output without marker';
    },
    killFn: (session) => { killed.push(session); },
    notifyFn: async (projectName, text) => { notified.push({ projectName, text }); },
    sleepFn: async () => {},
  };

  const result = await _testGracefulShutdown('test-session', 'test-project', { pauseWorkTimeout: 5000 }, fns);

  assert.ok(sentKeys.some(k => k.text === '/gsd-pause-work'), 'should send /gsd-pause-work');
  assert.ok(killed.includes('test-session'), 'should kill session');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pauseWorkCompleted, true);
});

test('graceful.shutdown: on pause-work timeout, kills session anyway + notifies Telegram', async () => {
  const killed = [];
  const notified = [];

  const fns = {
    isTmuxActiveFn: () => true,
    sendKeysFn: () => {},
    captureFn: () => '', // always blank — no marker ever found
    killFn: (session) => { killed.push(session); },
    notifyFn: async (projectName, text) => { notified.push({ projectName, text }); },
    sleepFn: async () => {},
  };

  const result = await _testGracefulShutdown('test-session', 'test-project', { pauseWorkTimeout: 100 }, fns);

  assert.ok(killed.includes('test-session'), 'should kill session even on timeout');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pauseWorkCompleted, false);
});

test('graceful.fallback: sends Telegram notification with failure message on timeout', async () => {
  const notified = [];

  const fns = {
    isTmuxActiveFn: () => true,
    sendKeysFn: () => {},
    captureFn: () => null,
    killFn: () => {},
    notifyFn: async (projectName, text) => { notified.push({ projectName, text }); },
    sleepFn: async () => {},
  };

  await _testGracefulShutdown('test-session', 'myproject', { pauseWorkTimeout: 100 }, fns);

  assert.ok(notified.length > 0, 'should send a Telegram notification');
  const msg = notified[0].text;
  // On timeout, message should indicate failure or that pause-work timed out
  assert.ok(
    msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('pause-work'),
    `notification should mention timeout or pause-work, got: "${msg}"`
  );
  assert.strictEqual(notified[0].projectName, 'myproject');
});

test('graceful.shutdown: returns {ok:true, pauseWorkCompleted:true} on marker found', async () => {
  const fns = {
    isTmuxActiveFn: () => true,
    sendKeysFn: () => {},
    captureFn: () => 'Handoff created — commit a1b2c3d',
    killFn: () => {},
    notifyFn: async () => {},
    sleepFn: async () => {},
  };

  const result = await _testGracefulShutdown('s', 'p', { pauseWorkTimeout: 5000 }, fns);
  assert.deepStrictEqual(result, { ok: true, pauseWorkCompleted: true });
});

test('graceful.shutdown: returns {ok:true, pauseWorkCompleted:false} on timeout', async () => {
  const fns = {
    isTmuxActiveFn: () => true,
    sendKeysFn: () => {},
    captureFn: () => '',
    killFn: () => {},
    notifyFn: async () => {},
    sleepFn: async () => {},
  };

  const result = await _testGracefulShutdown('s', 'p', { pauseWorkTimeout: 0 }, fns);
  assert.deepStrictEqual(result, { ok: true, pauseWorkCompleted: false });
});
