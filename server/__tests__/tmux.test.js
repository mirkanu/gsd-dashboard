'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { _testDetectFromOutput } = require('../gsd/tmux.js');

// UX-01: Timer pattern variants — Claude Code activity indicator must return 'working'
test('waiting.accuracy: timer "(4m 19s · ↓ 539 tokens" → working', () => {
  assert.strictEqual(_testDetectFromOutput('> (4m 19s · ↓ 539 tokens'), 'working');
});

test('waiting.accuracy: timer "(30s · ↓" → working', () => {
  assert.strictEqual(_testDetectFromOutput('(30s · ↓ 12 tokens'), 'working');
});

test('waiting.accuracy: standalone "· ↓ 3.2" → working', () => {
  assert.strictEqual(_testDetectFromOutput('· ↓ 3.2 tokens/s'), 'working');
});

test('waiting.accuracy: bidirectional "· ↑ 22 tokens · ↓ 539 tokens" → working', () => {
  assert.strictEqual(_testDetectFromOutput('· ↑ 22 tokens · ↓ 539 tokens'), 'working');
});

test('waiting.accuracy: thinking indicator "(thinking)" → working', () => {
  assert.strictEqual(_testDetectFromOutput('Claude is (thinking)'), 'working');
});

// Waiting patterns — user interaction required
test('waiting.accuracy: numbered option "> 1. Option A" → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('> 1. Option A'), 'waiting');
});

test('waiting.accuracy: confirmation prompt "[y/n]" → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('Do you want to continue? [y/n]'), 'waiting');
});

test('waiting.accuracy: plain shell prompt, no timer → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('$ '), 'waiting');
});

// ─── waitForIdle tests (via _testWaitForIdle injectable) ──────────────────────

const { _testWaitForIdle } = require('../gsd/tmux.js');

test('waitForIdle: resolves immediately when session returns waiting', async () => {
  const detectFn = () => 'waiting';
  await assert.doesNotReject(
    () => _testWaitForIdle(detectFn, 'idle-session', 3000),
    'should resolve without error'
  );
});

test('waitForIdle: resolves after session transitions from working to waiting', async () => {
  let callCount = 0;
  const detectFn = () => {
    callCount++;
    return callCount < 3 ? 'working' : 'waiting';
  };
  await assert.doesNotReject(
    () => _testWaitForIdle(detectFn, 'busy-session', 5000),
    'should resolve once session becomes idle'
  );
  assert.ok(callCount >= 3, 'should have polled at least 3 times');
});

test('waitForIdle: rejects with timeout error when session never becomes idle', async () => {
  const detectFn = () => 'working';
  await assert.rejects(
    () => _testWaitForIdle(detectFn, 'busy-session', 100),
    (err) => {
      assert.ok(err instanceof Error, 'should throw an Error');
      assert.ok(err.message.includes('Timeout waiting for idle session: busy-session'), `unexpected message: ${err.message}`);
      return true;
    }
  );
});

test('waitForIdle: resolves immediately when sessionName is null', async () => {
  const detectFn = () => { throw new Error('should not be called'); };
  await assert.doesNotReject(
    () => _testWaitForIdle(detectFn, null, 3000),
    'should resolve immediately with no session'
  );
});
