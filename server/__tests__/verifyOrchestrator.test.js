'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { _testStartVerify, isVerifying, _testSetVerifying, _testClearVerifying } = require('../gsd/verifyOrchestrator');

// Shared project fixture
const project = { name: 'test-proj', tmux_session: 'test-proj-sess', root: '/tmp/test' };

// Default fns — happy path
function makeFns(overrides = {}) {
  return {
    isTmuxActiveFn: () => true,
    sendKeysFn: () => {},
    readUatStatusFn: () => ({ status: 'complete', issues: 0, issuesSummary: '' }),
    broadcastFn: () => {},
    sleepFn: async () => {},
    getStateFn: () => ({ status: 'executing', current_phase: '53 (auto-verify)' }),
    getVerifyFailuresFn: () => 0,
    recordVerifyFailureFn: () => {},
    resetVerifyFailuresFn: () => {},
    ...overrides,
  };
}

// Test 1: sends /gsd-verify-work 53 when status is 'executing' and current_phase includes 53
test('verifyOrchestrator: sends /gsd-verify-work 53 when state is executing', async () => {
  const sentKeys = [];
  const fns = makeFns({
    sendKeysFn: (session, text) => { sentKeys.push({ session, text }); },
  });

  const result = await _testStartVerify(project, {}, fns);

  assert.ok(result.ok, `expected ok but got ${JSON.stringify(result)}`);
  assert.ok(
    sentKeys.some(k => k.session === 'test-proj-sess' && k.text === '/gsd-verify-work 53'),
    `expected /gsd-verify-work 53 to be sent, got: ${JSON.stringify(sentKeys)}`
  );
});

// Test 2: broadcasts verifyState:'verifying' immediately after send-keys
test('verifyOrchestrator: broadcasts verifying immediately after send-keys', async () => {
  const broadcasts = [];
  const fns = makeFns({
    broadcastFn: (type, data) => { broadcasts.push({ type, data }); },
  });

  await _testStartVerify(project, {}, fns);

  const verifyingBroadcast = broadcasts.find(b => b.data && b.data.verifyState === 'verifying');
  assert.ok(verifyingBroadcast, `expected verifying broadcast, got: ${JSON.stringify(broadcasts)}`);
  assert.strictEqual(verifyingBroadcast.data.sessionState, 'waiting');
  assert.strictEqual(verifyingBroadcast.data.project, 'test-proj');
});

// Test 3: polls until status:'complete' issues:0 then broadcasts verify-passed
test('verifyOrchestrator: broadcasts verify-passed when UAT complete with 0 issues', async () => {
  const broadcasts = [];
  let pollCount = 0;
  const fns = makeFns({
    broadcastFn: (type, data) => { broadcasts.push({ type, data }); },
    readUatStatusFn: () => {
      pollCount++;
      if (pollCount >= 2) return { status: 'complete', issues: 0, issuesSummary: '' };
      return null;
    },
  });

  const result = await _testStartVerify(project, {}, fns);

  assert.ok(result.ok);
  assert.strictEqual(result.passed, true);
  const passedBroadcast = broadcasts.find(b => b.data && b.data.verifyState === 'verify-passed');
  assert.ok(passedBroadcast, `expected verify-passed broadcast, got: ${JSON.stringify(broadcasts)}`);
});

// Test 4: status:'complete' issues:2 broadcasts verify-failed with summary
test('verifyOrchestrator: broadcasts verify-failed when UAT complete with issues > 0', async () => {
  const broadcasts = [];
  const fns = makeFns({
    broadcastFn: (type, data) => { broadcasts.push({ type, data }); },
    readUatStatusFn: () => ({ status: 'complete', issues: 2, issuesSummary: 'Login button broken' }),
  });

  const result = await _testStartVerify(project, {}, fns);

  assert.ok(result.ok);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.issues, 2);
  const failedBroadcast = broadcasts.find(b => b.data && b.data.verifyState === 'verify-failed');
  assert.ok(failedBroadcast, `expected verify-failed broadcast, got: ${JSON.stringify(broadcasts)}`);
  assert.ok(
    failedBroadcast.data.verifyFailureSummary && failedBroadcast.data.verifyFailureSummary.length > 0,
    'expected non-empty verifyFailureSummary'
  );
});

// Test 5: returns not-executing when STATE.md status is not 'executing'
test('verifyOrchestrator: returns not-executing when state status is not executing', async () => {
  const fns = makeFns({
    getStateFn: () => ({ status: 'idle', current_phase: '53' }),
  });

  const result = await _testStartVerify(project, {}, fns);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-executing');
});

// Test 6: returns already-verifying when isVerifying returns true
test('verifyOrchestrator: returns already-verifying when project is already verifying', async () => {
  _testSetVerifying('test-proj');
  try {
    const fns = makeFns();
    const result = await _testStartVerify(project, {}, fns);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'already-verifying');
  } finally {
    _testClearVerifying('test-proj');
  }
});

// Test 7: timeout broadcasts verify-failed and returns { ok: false, reason: 'timeout' }
test('verifyOrchestrator: timeout broadcasts verify-failed and returns timeout reason', async () => {
  const broadcasts = [];
  let pollCount = 0;
  const fns = makeFns({
    broadcastFn: (type, data) => { broadcasts.push({ type, data }); },
    // Never return complete — simulate timeout
    readUatStatusFn: () => {
      pollCount++;
      return null;
    },
  });

  // Set a very short timeout so the loop expires without completing
  const result = await _testStartVerify(project, { timeout: 1 }, fns);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'timeout');
  const failedBroadcast = broadcasts.find(b => b.data && b.data.verifyState === 'verify-failed');
  assert.ok(failedBroadcast, `expected verify-failed broadcast on timeout, got: ${JSON.stringify(broadcasts)}`);
});

// Test 8: circuit breaker — 3 consecutive failures → returns circuit-open without sending keys
test('verifyOrchestrator: returns circuit-open when consecutive_failures >= 3', async () => {
  const sentKeys = [];
  const fns = makeFns({
    sendKeysFn: (session, text) => { sentKeys.push({ session, text }); },
    getVerifyFailuresFn: () => 3,
  });

  const result = await _testStartVerify(project, {}, fns);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'circuit-open');
  assert.strictEqual(sentKeys.length, 0, 'should not send keys when circuit is open');
});

// Test 9: isVerifying returns true during active verify, false before and after
test('verifyOrchestrator: isVerifying returns true during active verify', async () => {
  let verifyingDuring = null;

  // Use a sleepFn that captures isVerifying state mid-verify
  const fns = makeFns({
    sleepFn: async () => {
      if (verifyingDuring === null) {
        verifyingDuring = isVerifying('test-proj');
      }
    },
    // Return complete immediately after first poll
    readUatStatusFn: () => ({ status: 'complete', issues: 0, issuesSummary: '' }),
  });

  assert.strictEqual(isVerifying('test-proj'), false, 'should not be verifying before start');

  await _testStartVerify(project, {}, fns);

  assert.strictEqual(verifyingDuring, true, 'should be verifying during active verify');
  assert.strictEqual(isVerifying('test-proj'), false, 'should not be verifying after completion');
});
