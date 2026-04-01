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

const { spawnGsdCommand } = require('../autopilot/processSpawner'); // Will fail — RED

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

// Mock gsd-projects.json for test
process.env.GSD_PROJECTS_PATH = '/tmp/test-gsd-projects.json';
fs.writeFileSync('/tmp/test-gsd-projects.json', JSON.stringify({
  projects: [{ name: 'test-project', root: '/tmp', tmux_session: 'test-session' }]
}));

test('autopilot.process: spawnGsdCommand inserts registry record and returns jobId', () => {
  const db = makeTestDb();
  const result = spawnGsdCommand('test-project', '/gsd:plan-phase', {
    args: ['24'], runId: null, spawnFn: mockSpawn, db
  });
  assert.ok(result.jobId, 'jobId should be returned');
  assert.ok(result.started_at, 'started_at should be returned');
  const record = db.prepare('SELECT * FROM process_registry WHERE id = ?').get(result.jobId);
  assert.ok(record, 'process_registry record should exist');
  assert.strictEqual(record.command, '/gsd:plan-phase');
});

test('autopilot.process: returned jobId is a non-empty string', () => {
  const db = makeTestDb();
  const result = spawnGsdCommand('test-project', '/gsd:execute-phase', {
    args: [], runId: null, spawnFn: mockSpawn, db
  });
  assert.strictEqual(typeof result.jobId, 'string');
  assert.ok(result.jobId.length > 0);
});

test('autopilot.process: process_registry record has command and args as provided', () => {
  const db = makeTestDb();
  const result = spawnGsdCommand('test-project', '/gsd:plan-phase', {
    args: ['24', '--verbose'], runId: 'run-abc', spawnFn: mockSpawn, db
  });
  const record = db.prepare('SELECT * FROM process_registry WHERE id = ?').get(result.jobId);
  assert.strictEqual(record.command, '/gsd:plan-phase');
  assert.strictEqual(record.run_id, 'run-abc');
  const args = JSON.parse(record.args);
  assert.deepStrictEqual(args, ['24', '--verbose']);
});
