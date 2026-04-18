'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  _testPollOnce,
  getProjectStateSnapshot,
  _resetSnapshot,
} = require('../gsd/stateBroadcaster');

// Helper: build a fake project
function makeProject(overrides = {}) {
  return {
    name: 'foo',
    tmux_session: 'foo-sess',
    archived: false,
    ...overrides,
  };
}

// Helper: build a broadcast capture
function makeBroadcastSpy() {
  const calls = [];
  const fn = (type, data) => { calls.push({ type, data }); };
  fn.calls = calls;
  return fn;
}

// Deterministic fake detect/capture factories
const makeDetect = (state) => async () => state;
const makeCapture = (text) => async () => text;

beforeEach(() => {
  _resetSnapshot();
});

test('stateBroadcaster: first poll records state + stateEnteredAt but does NOT broadcast (silent seed)', async () => {
  const broadcast = makeBroadcastSpy();
  const before = new Date().toISOString();
  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  assert.strictEqual(changed, false, 'first poll must not broadcast');
  assert.strictEqual(broadcast.calls.length, 0);

  const snap = getProjectStateSnapshot();
  assert.ok(snap.foo, 'snapshot has foo');
  assert.strictEqual(snap.foo.sessionState, 'waiting');
  assert.ok(snap.foo.stateEnteredAt >= before);
});

test('stateBroadcaster: second poll with SAME state — no broadcast, stateEnteredAt preserved', async () => {
  const broadcast = makeBroadcastSpy();
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  const firstEnteredAt = getProjectStateSnapshot().foo.stateEnteredAt;
  // Tiny delay to ensure new Date() would differ
  await new Promise(r => setTimeout(r, 5));

  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  assert.strictEqual(changed, false);
  assert.strictEqual(broadcast.calls.length, 0);
  assert.strictEqual(getProjectStateSnapshot().foo.stateEnteredAt, firstEnteredAt);
});

test('stateBroadcaster: second poll with DIFFERENT state — DOES broadcast, stateEnteredAt updated', async () => {
  const broadcast = makeBroadcastSpy();
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  const firstEnteredAt = getProjectStateSnapshot().foo.stateEnteredAt;
  await new Promise(r => setTimeout(r, 5));

  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('working'),
    makeCapture('(30s · ↓ 12 tokens'),
    broadcast,
  );
  assert.strictEqual(changed, true);
  assert.strictEqual(broadcast.calls.length, 1);
  const snap = getProjectStateSnapshot().foo;
  assert.strictEqual(snap.sessionState, 'working');
  assert.notStrictEqual(snap.stateEnteredAt, firstEnteredAt);
  assert.ok(snap.stateEnteredAt > firstEnteredAt);
});

test('stateBroadcaster: broadcast payload shape', async () => {
  const broadcast = makeBroadcastSpy();
  // seed with waiting
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  // transition to working
  await _testPollOnce(
    makeProject(),
    makeDetect('working'),
    makeCapture('(30s · ↓ 12 tokens'),
    broadcast,
  );
  assert.strictEqual(broadcast.calls.length, 1);
  const call = broadcast.calls[0];
  assert.strictEqual(call.type, 'project_state_change');
  assert.deepStrictEqual(Object.keys(call.data).sort(), [
    'currentTask',
    'project',
    'sessionState',
    'stateEnteredAt',
    'statusText',
  ].sort());
  assert.strictEqual(call.data.project, 'foo');
  assert.strictEqual(call.data.sessionState, 'working');
  assert.ok(typeof call.data.stateEnteredAt === 'string');
});

test('stateBroadcaster: getProjectStateSnapshot returns tracked projects', async () => {
  const broadcast = makeBroadcastSpy();
  await _testPollOnce(
    makeProject({ name: 'alpha', tmux_session: 'alpha' }),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  await _testPollOnce(
    makeProject({ name: 'beta', tmux_session: 'beta' }),
    makeDetect('working'),
    makeCapture('(30s · ↓ tokens'),
    broadcast,
  );
  const snap = getProjectStateSnapshot();
  assert.ok(snap.alpha);
  assert.ok(snap.beta);
  assert.strictEqual(snap.alpha.sessionState, 'waiting');
  assert.strictEqual(snap.beta.sessionState, 'working');
  // Shape has expected keys
  assert.ok('stateEnteredAt' in snap.alpha);
  assert.ok('currentTask' in snap.alpha);
  assert.ok('statusText' in snap.alpha);
});

test('stateBroadcaster: transient detectFn failure is swallowed and preserves previous snapshot', async () => {
  const broadcast = makeBroadcastSpy();
  // Seed successfully
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
  );
  const prev = { ...getProjectStateSnapshot().foo };

  // Next poll throws
  const throwingDetect = async () => { throw new Error('tmux dead'); };
  const changed = await _testPollOnce(
    makeProject(),
    throwingDetect,
    makeCapture('anything'),
    broadcast,
  );
  assert.strictEqual(changed, false);
  assert.strictEqual(broadcast.calls.length, 0);
  // Snapshot unchanged
  const after = getProjectStateSnapshot().foo;
  assert.deepStrictEqual(after, prev);
});

test('stateBroadcaster: archived projects are skipped entirely', async () => {
  const broadcast = makeBroadcastSpy();
  const changed = await _testPollOnce(
    makeProject({ archived: true }),
    makeDetect('working'),
    makeCapture('(30s'),
    broadcast,
  );
  assert.strictEqual(changed, false);
  assert.strictEqual(broadcast.calls.length, 0);
  assert.strictEqual(Object.keys(getProjectStateSnapshot()).length, 0);
});

test('stateBroadcaster: projects with no tmux_session are skipped', async () => {
  const broadcast = makeBroadcastSpy();
  const changed = await _testPollOnce(
    makeProject({ tmux_session: null }),
    makeDetect('working'),
    makeCapture('(30s'),
    broadcast,
  );
  assert.strictEqual(changed, false);
  assert.strictEqual(broadcast.calls.length, 0);
  assert.strictEqual(Object.keys(getProjectStateSnapshot()).length, 0);
});

// ─── Phase 49 Plan 03: busy_markers threading ────────────────────────────────

test('stateBroadcaster: transition WITH busy_markers — payload includes busy_markers { count, kinds }', async () => {
  const broadcast = makeBroadcastSpy();
  const getBusy = () => ({ count: 2, kinds: ['bash_bg', 'wakeup'] });
  // seed waiting
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  // transition to working
  await _testPollOnce(
    makeProject(),
    makeDetect('working'),
    makeCapture('(30s · ↓ 12 tokens'),
    broadcast,
    getBusy,
  );
  assert.strictEqual(broadcast.calls.length, 1);
  const payload = broadcast.calls[0].data;
  assert.strictEqual('busy_markers' in payload, true);
  assert.deepStrictEqual(payload.busy_markers, { count: 2, kinds: ['bash_bg', 'wakeup'] });
});

test('stateBroadcaster: transition WITHOUT busy_markers — key omitted from payload', async () => {
  const broadcast = makeBroadcastSpy();
  const getBusy = () => ({ count: 0, kinds: [] });
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  await _testPollOnce(
    makeProject(),
    makeDetect('working'),
    makeCapture('(30s'),
    broadcast,
    getBusy,
  );
  assert.strictEqual(broadcast.calls.length, 1);
  const payload = broadcast.calls[0].data;
  assert.strictEqual('busy_markers' in payload, false, 'busy_markers key must be omitted when count=0');
});

test('stateBroadcaster: same-state tick where markers NEWLY appear — broadcasts once, stateEnteredAt preserved', async () => {
  const broadcast = makeBroadcastSpy();
  let markers = { count: 0, kinds: [] };
  const getBusy = () => markers;
  // seed waiting with no markers
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  assert.strictEqual(broadcast.calls.length, 0);
  const firstEnteredAt = getProjectStateSnapshot().foo.stateEnteredAt;
  await new Promise(r => setTimeout(r, 5));

  // Markers appear — same sessionState, but busy_markers changed
  markers = { count: 1, kinds: ['bash_bg'] };
  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  assert.strictEqual(changed, true, 'must broadcast when busy_markers change within same state');
  assert.strictEqual(broadcast.calls.length, 1);
  const payload = broadcast.calls[0].data;
  assert.strictEqual(payload.sessionState, 'waiting');
  assert.deepStrictEqual(payload.busy_markers, { count: 1, kinds: ['bash_bg'] });
  assert.strictEqual(payload.stateEnteredAt, firstEnteredAt, 'stateEnteredAt must NOT reset on marker-only change');
});

test('stateBroadcaster: same-state tick with unchanged markers — no broadcast', async () => {
  const broadcast = makeBroadcastSpy();
  const getBusy = () => ({ count: 1, kinds: ['agent'] });
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  // seed broadcasts nothing (initial seed rule)
  assert.strictEqual(broadcast.calls.length, 0);
  // Same state, same markers
  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  assert.strictEqual(changed, false);
  assert.strictEqual(broadcast.calls.length, 0);
});

test('stateBroadcaster: same-state tick where markers CLEAR — broadcasts once without busy_markers key', async () => {
  const broadcast = makeBroadcastSpy();
  let markers = { count: 1, kinds: ['bash_bg'] };
  const getBusy = () => markers;
  // seed waiting WITH markers
  await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  // Markers clear
  markers = { count: 0, kinds: [] };
  const changed = await _testPollOnce(
    makeProject(),
    makeDetect('waiting'),
    makeCapture('$ '),
    broadcast,
    getBusy,
  );
  assert.strictEqual(changed, true);
  assert.strictEqual(broadcast.calls.length, 1);
  const payload = broadcast.calls[0].data;
  assert.strictEqual('busy_markers' in payload, false, 'cleared → key absent (absence = clear)');
});
