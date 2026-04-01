'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = require('../compat-sqlite');
}

// Will fail until server/autopilot/AutopilotManager.js is created — RED phase
const { AutopilotManager } = require('../autopilot/AutopilotManager');

// ─── In-memory DB setup ────────────────────────────────────────────────────────

function makeTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE autopilot_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','paused','completed','failed','stopped')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failed_phase_num INTEGER,
      pause_reason TEXT
    );

    CREATE TABLE process_registry (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      command TEXT NOT NULL,
      args TEXT,
      pid INTEGER,
      exit_code INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      stdout TEXT,
      stderr TEXT
    );
  `);
  return db;
}

// ─── Stub helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a stubbed spawnFn that returns immediately with a fake job result.
 */
function makeSpawnFn() {
  let callCount = 0;
  const fn = (_projectName, _cmd, _opts) => {
    callCount++;
    return { jobId: `job-${callCount}`, pid: null, started_at: new Date().toISOString() };
  };
  fn.getCallCount = () => callCount;
  return fn;
}

/**
 * Creates a broadcastFn stub that records calls.
 */
function makeBroadcastFn() {
  const calls = [];
  const fn = (type, data) => calls.push({ type, data });
  fn.getCalls = () => calls;
  return fn;
}

/**
 * Creates a readStateFn stub that returns a controllable state.
 * Returns an object with { progress: { completed_phases } } and optional status.
 * Call .setCompletedPhases(n) to advance the value.
 */
function makeReadStateFn(initialCompleted = 0) {
  let completed = initialCompleted;
  let statusVal = null;
  const fn = (_root) => ({
    progress: { completed_phases: completed, total_phases: 10 },
    status: statusVal,
  });
  fn.setCompletedPhases = (n) => { completed = n; };
  fn.setStatus = (s) => { statusVal = s; };
  return fn;
}

// ─── Test 1: start() inserts autopilot_runs row and returns runId ─────────────

test('autopilot.manager: start() inserts autopilot_runs row with status=running and returns runId', async () => {
  const db = makeTestDb();
  const spawnFn = makeSpawnFn();
  const broadcastFn = makeBroadcastFn();
  // readState always returns same value — loop will tick but tests finish fast with pollMs=1
  const readStateFn = makeReadStateFn(2);

  const manager = new AutopilotManager({ db, spawnFn, broadcastFn, readStateFn, pollMs: 1 });
  const { runId } = await manager.start('test-project', { startPhase: 1, totalPhases: 2 });

  assert.ok(runId, 'runId must be returned');
  assert.strictEqual(typeof runId, 'string');

  const row = db.prepare('SELECT * FROM autopilot_runs WHERE id = ?').get(runId);
  assert.ok(row, 'Row must exist in autopilot_runs');
  assert.strictEqual(row.project_id, 'test-project');
  assert.strictEqual(row.status, 'running');

  manager.stop();
});

// ─── Test 2: pause() sets paused=true and updates DB status ──────────────────

test('autopilot.manager: pause() sets paused=true and updates status to paused in DB', async () => {
  const db = makeTestDb();
  const spawnFn = makeSpawnFn();
  const broadcastFn = makeBroadcastFn();
  const readStateFn = makeReadStateFn(0);

  const manager = new AutopilotManager({ db, spawnFn, broadcastFn, readStateFn, pollMs: 100 });
  const { runId } = await manager.start('test-project', { startPhase: 1, totalPhases: 3 });

  manager.pause();

  assert.strictEqual(manager.paused, true, 'paused flag must be true after pause()');

  const row = db.prepare('SELECT status FROM autopilot_runs WHERE id = ?').get(runId);
  assert.strictEqual(row.status, 'paused', 'DB status must be "paused"');

  manager.stop();
});

// ─── Test 3: resume() calls CircuitBreaker.reset() and resumes ───────────────

test('autopilot.manager: resume() resets CircuitBreaker and clears paused flag', async () => {
  const db = makeTestDb();
  const spawnFn = makeSpawnFn();
  const broadcastFn = makeBroadcastFn();
  const readStateFn = makeReadStateFn(0);

  // Inject a mock CircuitBreaker to verify reset() is called
  let resetCalled = false;
  const mockCbFactory = (_runId, _threshold, _db) => ({
    recordFailure: () => false,
    isOpen: () => false,
    reset: () => { resetCalled = true; },
  });

  const manager = new AutopilotManager({
    db, spawnFn, broadcastFn, readStateFn, pollMs: 100,
    circuitBreakerFactory: mockCbFactory,
  });
  const { runId } = await manager.start('test-project', { startPhase: 1, totalPhases: 3 });

  manager.pause();
  assert.strictEqual(manager.paused, true, 'Should be paused');

  manager.resume();
  assert.strictEqual(manager.paused, false, 'paused must be false after resume()');
  assert.strictEqual(resetCalled, true, 'CircuitBreaker.reset() must be called on resume');

  manager.stop();
});

// ─── Test 4: failed phase triggers one retry before recording failure ─────────

test('autopilot.manager: failed phase triggers retry once before calling recordFailure', async () => {
  const db = makeTestDb();

  // spawnFn tracks calls — first call is initial spawn, second is retry
  let spawnCallCount = 0;
  const spawnFn = (_projectName, _cmd, _opts) => {
    spawnCallCount++;
    return { jobId: `job-${spawnCallCount}`, pid: null, started_at: new Date().toISOString() };
  };

  const broadcastFn = makeBroadcastFn();

  // readState: returns initial completed=0, then status='failed' to trigger failure path
  let tick = 0;
  const readStateFn = (_root) => {
    tick++;
    if (tick <= 2) {
      return { progress: { completed_phases: 0, total_phases: 3 }, status: null };
    }
    // After 2 ticks return 'failed' status
    return { progress: { completed_phases: 0, total_phases: 3 }, status: 'failed' };
  };

  let recordFailureCalled = false;
  let failedPhaseNum = null;
  const mockCbFactory = (_runId, _threshold, _db) => ({
    recordFailure: (phaseNum) => {
      recordFailureCalled = true;
      failedPhaseNum = phaseNum;
      return false; // don't open circuit yet
    },
    isOpen: () => false,
    reset: () => {},
  });

  const manager = new AutopilotManager({
    db, spawnFn, broadcastFn, readStateFn, pollMs: 5,
    circuitBreakerFactory: mockCbFactory,
  });

  await manager.start('test-project', { startPhase: 1, totalPhases: 3 });

  // Wait for a few poll ticks then stop
  await new Promise(resolve => setTimeout(resolve, 50));
  manager.stop();

  // Spawn should have been called at least twice (initial + retry)
  assert.ok(spawnCallCount >= 2, `spawnFn should be called at least twice for retry, got ${spawnCallCount}`);
  assert.strictEqual(recordFailureCalled, true, 'recordFailure() must be called after retry');
});

// ─── Test 5: CircuitBreaker opens → loop stops and broadcasts autopilot_halted ─

test('autopilot.manager: when CircuitBreaker opens, loop broadcasts autopilot_halted and stops', async () => {
  const db = makeTestDb();
  let spawnCallCount = 0;
  const spawnFn = (_projectName, _cmd, _opts) => {
    spawnCallCount++;
    return { jobId: `job-${spawnCallCount}`, pid: null, started_at: new Date().toISOString() };
  };

  const broadcastFn = makeBroadcastFn();

  // readState always returns failed — every phase fails
  const readStateFn = (_root) => ({
    progress: { completed_phases: 0, total_phases: 3 },
    status: 'failed',
  });

  // CircuitBreaker opens immediately on first recordFailure
  let failureCount = 0;
  const mockCbFactory = (_runId, _threshold, _db) => ({
    recordFailure: (_phaseNum) => {
      failureCount++;
      return true; // circuit open — halt immediately
    },
    isOpen: () => failureCount > 0,
    reset: () => {},
  });

  const manager = new AutopilotManager({
    db, spawnFn, broadcastFn, readStateFn, pollMs: 5,
    circuitBreakerFactory: mockCbFactory,
  });

  const { runId } = await manager.start('test-project', { startPhase: 1, totalPhases: 3 });

  // Give loop time to detect failure and halt
  await new Promise(resolve => setTimeout(resolve, 80));

  const halted = broadcastFn.getCalls().some(c => c.type === 'autopilot_halted');
  assert.strictEqual(halted, true, 'autopilot_halted must be broadcast when circuit opens');

  const row = db.prepare('SELECT status FROM autopilot_runs WHERE id = ?').get(runId);
  assert.strictEqual(row.status, 'failed', 'DB status must be "failed" when circuit opens');
});

// ─── Test 6: broadcast called at phase start and end with correct shape ───────

test('autopilot.manager: broadcast autopilot_progress called with correct shape at phase transitions', async () => {
  const db = makeTestDb();
  let spawnCallCount = 0;
  const spawnFn = (_projectName, _cmd, _opts) => {
    spawnCallCount++;
    return { jobId: `job-${spawnCallCount}`, pid: null, started_at: new Date().toISOString() };
  };

  const broadcastFn = makeBroadcastFn();

  // Phase 1: start with completed=0, then advance to completed=1 after a few ticks
  let tick = 0;
  const readStateFn = (_root) => {
    tick++;
    return {
      progress: { completed_phases: tick >= 3 ? 1 : 0, total_phases: 2 },
      status: null,
    };
  };

  const mockCbFactory = (_runId, _threshold, _db) => ({
    recordFailure: () => false,
    isOpen: () => false,
    reset: () => {},
  });

  const manager = new AutopilotManager({
    db, spawnFn, broadcastFn, readStateFn, pollMs: 5,
    circuitBreakerFactory: mockCbFactory,
  });

  const { runId } = await manager.start('test-project', { startPhase: 1, totalPhases: 2 });

  // Wait for at least one phase transition
  await new Promise(resolve => setTimeout(resolve, 80));
  manager.stop();

  const progressCalls = broadcastFn.getCalls().filter(c => c.type === 'autopilot_progress');
  assert.ok(progressCalls.length > 0, 'autopilot_progress must be broadcast at least once');

  // Verify shape of broadcast data
  for (const call of progressCalls) {
    assert.strictEqual(typeof call.data.projectName, 'string', 'data.projectName must be string');
    assert.strictEqual(typeof call.data.phaseNum, 'number', 'data.phaseNum must be number');
    assert.ok(['started', 'completed', 'failed', 'retrying'].includes(call.data.status),
      `data.status must be one of started/completed/failed/retrying, got: ${call.data.status}`);
    assert.strictEqual(call.data.runId, runId, 'data.runId must match');
  }
});
