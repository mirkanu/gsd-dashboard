'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = require('../compat-sqlite');
}

const { CircuitBreaker } = require('../autopilot/CircuitBreaker'); // Will fail — RED

let testDb;

function freshRun(db) {
  const id = `run-${Math.random().toString(36).slice(2)}`;
  db.prepare('INSERT INTO autopilot_runs (id, project_id, started_at) VALUES (?, ?, ?)')
    .run(id, 'test', new Date().toISOString());
  return id;
}

before(() => {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE autopilot_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failed_phase_num INTEGER,
      pause_reason TEXT
    )
  `);
});

test('circuit.breaker: isOpen() returns false with 0 failures', () => {
  const runId = freshRun(testDb);
  const cb = new CircuitBreaker(runId, 3, testDb);
  assert.strictEqual(cb.isOpen(), false);
});

test('circuit.breaker: recordFailure() twice → isOpen() still false', () => {
  const runId = freshRun(testDb);
  const cb = new CircuitBreaker(runId, 3, testDb);
  cb.recordFailure(1);
  cb.recordFailure(2);
  assert.strictEqual(cb.isOpen(), false);
});

test('circuit.breaker: recordFailure() three times → isOpen() true', () => {
  const runId = freshRun(testDb);
  const cb = new CircuitBreaker(runId, 3, testDb);
  cb.recordFailure(1);
  cb.recordFailure(2);
  cb.recordFailure(3);
  assert.strictEqual(cb.isOpen(), true);
});

test('circuit.breaker: reset() after open → isOpen() false', () => {
  const runId = freshRun(testDb);
  const cb = new CircuitBreaker(runId, 3, testDb);
  cb.recordFailure(1);
  cb.recordFailure(2);
  cb.recordFailure(3);
  assert.strictEqual(cb.isOpen(), true);
  cb.reset();
  assert.strictEqual(cb.isOpen(), false);
});

test('circuit.breaker: recordFailure() returns true on 3rd call, false on 1st and 2nd', () => {
  const runId = freshRun(testDb);
  const cb = new CircuitBreaker(runId, 3, testDb);
  assert.strictEqual(cb.recordFailure(1), false);
  assert.strictEqual(cb.recordFailure(2), false);
  assert.strictEqual(cb.recordFailure(3), true);
});
