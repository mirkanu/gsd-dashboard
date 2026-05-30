'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests import _testNotify from notificationCentre.js (does not exist yet).
// RED: fails with MODULE_NOT_FOUND until Task 2 creates the file.
const { _testNotify, notify, EVENT_DEFAULTS } = require('../gsd/notificationCentre');

// Shared stub DB factory — mirrors the schema established in Task 1
function makeStubDb(policyOverride = {}) {
  const log = [];
  const policy = {
    enabled: 1,
    quiet_hours_from: null,
    quiet_hours_to: null,
    rate_limit_per_hour: 5,
    event_toggles: '{}',
    ...policyOverride,
  };
  return {
    log,
    stmts: {
      getNotificationPolicy: {
        get: () => policy,
      },
      insertNotificationLog: {
        run: (...args) => log.push({ op: 'insertLog', args }),
      },
      getRecentNotificationLog: {
        get: () => undefined, // no dedup by default
      },
    },
  };
}

// Helper to run _testNotify with injectable fns
async function runNotify(eventType, projectName, text, options, overrides = {}) {
  const { db, sendFn, nowFn } = overrides;
  const calls = [];
  const defaultSendFn = async () => { calls.push({ projectName, text }); };
  await _testNotify(eventType, projectName, text, options || [], {
    sendFn: sendFn || defaultSendFn,
    dbFn: db ? () => db.stmts : undefined,
    nowFn: nowFn,
  });
  return calls;
}

// ── EVENT_DEFAULTS ──────────────────────────────────────────────────────────

test('EVENT_DEFAULTS: waiting_input is enabled and highPriority', () => {
  assert.strictEqual(EVENT_DEFAULTS.waiting_input.enabled, true);
  assert.strictEqual(EVENT_DEFAULTS.waiting_input.highPriority, true);
});

test('EVENT_DEFAULTS: plan_complete is enabled and highPriority', () => {
  assert.strictEqual(EVENT_DEFAULTS.plan_complete.enabled, true);
  assert.strictEqual(EVENT_DEFAULTS.plan_complete.highPriority, true);
});

test('EVENT_DEFAULTS: verify_failed is enabled and highPriority', () => {
  assert.strictEqual(EVENT_DEFAULTS.verify_failed.enabled, true);
  assert.strictEqual(EVENT_DEFAULTS.verify_failed.highPriority, true);
});

test('EVENT_DEFAULTS: verify_passed is disabled by default', () => {
  assert.strictEqual(EVENT_DEFAULTS.verify_passed.enabled, false);
});

test('EVENT_DEFAULTS: idle_session_closed is enabled and rateLimited', () => {
  assert.strictEqual(EVENT_DEFAULTS.idle_session_closed.enabled, true);
  assert.strictEqual(EVENT_DEFAULTS.idle_session_closed.rateLimited, true);
});

test('EVENT_DEFAULTS: cost_anomaly is enabled and rateLimited', () => {
  assert.strictEqual(EVENT_DEFAULTS.cost_anomaly.enabled, true);
  assert.strictEqual(EVENT_DEFAULTS.cost_anomaly.rateLimited, true);
});

// ── GLOBAL DISABLE ──────────────────────────────────────────────────────────

test('notify: global enabled=0 suppresses with reason=disabled', async () => {
  const { db } = { db: makeStubDb({ enabled: 0 }) };
  const calls = await runNotify('waiting_input', 'proj', 'text', [], { db });
  assert.strictEqual(calls.length, 0, 'sendFn should not be called');
  const logged = db.log.find(e => e.op === 'insertLog');
  assert.ok(logged, 'should log suppression');
  assert.strictEqual(logged.args[4], 'disabled');
});

// ── PER-EVENT TOGGLE ────────────────────────────────────────────────────────

test('notify: verify_passed (default off) does not call sendFn', async () => {
  const db = makeStubDb();
  const calls = await runNotify('verify_passed', 'proj', 'text', [], { db });
  assert.strictEqual(calls.length, 0);
  const logged = db.log.find(e => e.op === 'insertLog');
  assert.ok(logged);
  assert.strictEqual(logged.args[4], 'disabled');
});

test('notify: waiting_input (default on) calls sendFn once', async () => {
  const db = makeStubDb();
  const calls = [];
  await _testNotify('waiting_input', 'proj', 'hello', [], {
    sendFn: async () => calls.push(1),
    dbFn: () => db.stmts,
  });
  assert.strictEqual(calls.length, 1);
});

// ── QUIET HOURS ─────────────────────────────────────────────────────────────

test('notify: non-high-priority event suppressed during quiet hours', async () => {
  // idle_session_closed: highPriority=false, rateLimited=true
  // Set quiet hours to cover midnight (00:00–23:59) — always in quiet hours
  const db = makeStubDb({ quiet_hours_from: '00:00', quiet_hours_to: '23:59' });
  const calls = await runNotify('idle_session_closed', 'proj', 'text', [], { db });
  assert.strictEqual(calls.length, 0);
  const logged = db.log.find(e => e.op === 'insertLog');
  assert.ok(logged);
  assert.strictEqual(logged.args[4], 'quiet_hours');
});

test('notify: high-priority event bypasses quiet hours', async () => {
  // verify_failed: highPriority=true
  const db = makeStubDb({ quiet_hours_from: '00:00', quiet_hours_to: '23:59' });
  const calls = [];
  await _testNotify('verify_failed', 'proj', 'text', [], {
    sendFn: async () => calls.push(1),
    dbFn: () => db.stmts,
  });
  assert.strictEqual(calls.length, 1, 'high-priority event should bypass quiet hours');
});

// ── RATE LIMIT ──────────────────────────────────────────────────────────────

test('notify: rate-limited event: 20 calls → exactly rate_limit_per_hour delivered', async () => {
  // Use a fresh module instance via a new rate window by manipulating nowFn
  // idle_session_closed is rateLimited=true
  const db = makeStubDb({ rate_limit_per_hour: 5 });
  // Override dedup: make getRecentNotificationLog return undefined always
  // (insertLog records delivered=1 so dedup would fire on repeat real calls)
  // We need isolated rate window — reset by setting nowFn to a fixed future time
  // to force rateWindow reset. We call _testNotify with the same nowFn across all calls.
  const FIXED_NOW = Date.now() + 10 * 60 * 60 * 1000; // 10h in future = fresh window
  const sendCalls = [];
  const suppressedReasons = [];

  // Replace insertNotificationLog to track suppression reasons
  const logEntries = [];
  const stmts = {
    ...db.stmts,
    insertNotificationLog: { run: (...args) => logEntries.push(args) },
    getRecentNotificationLog: { get: () => undefined },
  };

  for (let i = 0; i < 20; i++) {
    await _testNotify('idle_session_closed', 'proj', `msg-${i}`, [], {
      sendFn: async () => sendCalls.push(i),
      dbFn: () => stmts,
      nowFn: () => FIXED_NOW,
    });
  }

  const rateLimitSuppressed = logEntries.filter(e => e[4] === 'rate_limit').length;
  assert.strictEqual(sendCalls.length, 5, `expected 5 delivered, got ${sendCalls.length}`);
  assert.strictEqual(rateLimitSuppressed, 15, `expected 15 rate_limit suppressions, got ${rateLimitSuppressed}`);
});

// ── DEDUPLICATION ───────────────────────────────────────────────────────────

test('notify: second call within 30s is suppressed with reason=dedup', async () => {
  const db = makeStubDb();
  const logEntries = [];
  const sendCalls = [];
  let callCount = 0;

  // First call: no recent log row
  // Second call: simulate that a row now exists (dedup)
  const stmts = {
    ...db.stmts,
    insertNotificationLog: { run: (...args) => logEntries.push(args) },
    getRecentNotificationLog: {
      get: () => callCount++ === 0 ? undefined : { id: 1 },
    },
  };

  await _testNotify('waiting_input', 'proj', 'msg1', [], {
    sendFn: async () => sendCalls.push(1),
    dbFn: () => stmts,
  });
  await _testNotify('waiting_input', 'proj', 'msg2', [], {
    sendFn: async () => sendCalls.push(2),
    dbFn: () => stmts,
  });

  assert.strictEqual(sendCalls.length, 1, 'only first call should be delivered');
  const dedupEntry = logEntries.find(e => e[4] === 'dedup');
  assert.ok(dedupEntry, 'second call should log dedup');
});

// ── LOG WRITE BEFORE SEND ───────────────────────────────────────────────────

test('notify: notification_log row is written before sendFn is called', async () => {
  const db = makeStubDb();
  const order = [];
  const stmts = {
    ...db.stmts,
    insertNotificationLog: {
      run: (...args) => {
        if (args[3] === 1) order.push('log'); // delivered=1 row
      },
    },
    getRecentNotificationLog: { get: () => undefined },
  };

  await _testNotify('waiting_input', 'proj', 'text', [], {
    sendFn: async () => order.push('send'),
    dbFn: () => stmts,
  });

  assert.deepStrictEqual(order, ['log', 'send'], 'log must be written before send');
});

// ── notify() RETURNS PROMISE ────────────────────────────────────────────────

test('notify: returns a Promise', () => {
  const result = notify('waiting_input', 'proj', 'text');
  assert.ok(result instanceof Promise, 'notify should return a Promise');
  // Suppress unhandled rejection — we don't care about the result here
  result.catch(() => {});
});
