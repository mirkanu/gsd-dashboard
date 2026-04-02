'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = require('../compat-sqlite');
}

const { spawnGsdCommand } = require('../autopilot/processSpawner');

// Minimal in-memory db for process_registry
function makeTestDb() {
  const db = new Database(':memory:');
  db.exec(`
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
    )
  `);
  return db;
}

// Mock spawn that returns a fake child process
function mockSpawn() {
  return { pid: 12345, on: () => {} };
}

// Mock waitForIdle that resolves immediately (no real tmux needed)
const mockWaitForIdle = async () => {};

// Mock gsd-projects.json for test
process.env.GSD_PROJECTS_PATH = '/tmp/test-gsd-projects.json';
fs.writeFileSync('/tmp/test-gsd-projects.json', JSON.stringify({
  projects: [{ name: 'test-project', root: '/tmp', tmux_session: 'test-session' }]
}));

test('autopilot.process: spawnGsdCommand inserts registry record and returns jobId', async () => {
  const db = makeTestDb();
  const result = await spawnGsdCommand('test-project', '/gsd:plan-phase', {
    args: ['24'], runId: null, spawnFn: mockSpawn, db, waitForIdleFn: mockWaitForIdle
  });
  assert.ok(result.jobId, 'jobId should be returned');
  assert.ok(result.started_at, 'started_at should be returned');
  const record = db.prepare('SELECT * FROM process_registry WHERE id = ?').get(result.jobId);
  assert.ok(record, 'process_registry record should exist');
  assert.strictEqual(record.command, '/gsd:plan-phase');
});

test('autopilot.process: returned jobId is a non-empty string', async () => {
  const db = makeTestDb();
  const result = await spawnGsdCommand('test-project', '/gsd:execute-phase', {
    args: [], runId: null, spawnFn: mockSpawn, db, waitForIdleFn: mockWaitForIdle
  });
  assert.strictEqual(typeof result.jobId, 'string');
  assert.ok(result.jobId.length > 0);
});

test('autopilot.process: process_registry record has command and args as provided', async () => {
  const db = makeTestDb();
  const result = await spawnGsdCommand('test-project', '/gsd:plan-phase', {
    args: ['24', '--verbose'], runId: 'run-abc', spawnFn: mockSpawn, db, waitForIdleFn: mockWaitForIdle
  });
  const record = db.prepare('SELECT * FROM process_registry WHERE id = ?').get(result.jobId);
  assert.strictEqual(record.command, '/gsd:plan-phase');
  assert.strictEqual(record.run_id, 'run-abc');
  const args = JSON.parse(record.args);
  assert.deepStrictEqual(args, ['24', '--verbose']);
});

// ─── waitForIdle integration in spawnGsdCommand ────────────────────────────

test('autopilot.process: spawnGsdCommand awaits waitForIdleFn before spawning', async () => {
  const db = makeTestDb();
  let waitCalled = false;
  const waitForIdleFn = async () => { waitCalled = true; };
  const result = await spawnGsdCommand('test-project', '/gsd:execute-phase', {
    args: ['25'], runId: null, spawnFn: mockSpawn, db, waitForIdleFn
  });
  assert.ok(waitCalled, 'waitForIdleFn should have been called');
  assert.ok(result.jobId, 'jobId should be returned after successful wait');
});

test('autopilot.process: spawnGsdCommand updates registry with exit_code=-2 when waitForIdleFn rejects', async () => {
  const db = makeTestDb();
  const waitForIdleFn = async () => { throw new Error('Timeout waiting for idle session: test-session'); };
  await assert.rejects(
    () => spawnGsdCommand('test-project', '/gsd:execute-phase', {
      args: [], runId: null, spawnFn: mockSpawn, db, waitForIdleFn
    }),
    (err) => {
      assert.ok(err instanceof Error, 'should propagate the error');
      assert.ok(err.message.includes('Timeout'), `unexpected message: ${err.message}`);
      return true;
    }
  );
  // Find the registry record — should have exit_code=-2
  const records = db.prepare('SELECT * FROM process_registry').all();
  assert.strictEqual(records.length, 1, 'one registry record should exist');
  assert.strictEqual(records[0].exit_code, -2, 'exit_code should be -2 on timeout');
  assert.ok(records[0].ended_at, 'ended_at should be set');
});
