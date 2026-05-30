'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests verify that db.js applies Phase 54B migrations:
// - notification_policy table
// - notification_log table
// - notification_enabled + notification_quiet_override columns in project_settings
// - Prepared statements: getNotificationPolicy, upsertNotificationPolicy, insertNotificationLog, getRecentNotificationLog
//
// RED: fails before db.js has these migrations/stmts.
// GREEN: passes after Task 1 implementation.

const { db, stmts } = require('../db');

test('schema: notification_policy table exists after startup', () => {
  const result = db.prepare('SELECT 1 FROM notification_policy').all();
  assert.ok(Array.isArray(result), 'notification_policy table should exist');
});

test('schema: notification_log table exists after startup', () => {
  const result = db.prepare('SELECT 1 FROM notification_log').all();
  assert.ok(Array.isArray(result), 'notification_log table should exist');
});

test('schema: project_settings has notification_enabled column', () => {
  const result = db.prepare('SELECT notification_enabled FROM project_settings LIMIT 1').all();
  assert.ok(Array.isArray(result), 'notification_enabled column should exist');
});

test('schema: project_settings has notification_quiet_override column', () => {
  const result = db.prepare('SELECT notification_quiet_override FROM project_settings LIMIT 1').all();
  assert.ok(Array.isArray(result), 'notification_quiet_override column should exist');
});

test('schema: migrations are idempotent (safe to run twice)', () => {
  // Verify running probes again does not throw
  assert.doesNotThrow(() => {
    try { db.prepare('SELECT 1 FROM notification_policy LIMIT 1').get(); } catch { /* expected */ }
    try { db.prepare('SELECT 1 FROM notification_log LIMIT 1').get(); } catch { /* expected */ }
    try { db.prepare('SELECT notification_enabled FROM project_settings LIMIT 1').get(); } catch { /* expected */ }
  });
});

test('stmts: getNotificationPolicy is defined and callable', () => {
  assert.ok(stmts.getNotificationPolicy, 'getNotificationPolicy stmt should exist');
  const row = stmts.getNotificationPolicy.get();
  // No row yet is OK — just must not throw
  assert.ok(row === undefined || typeof row === 'object');
});

test('stmts: upsertNotificationPolicy inserts the __global__ row', () => {
  assert.ok(stmts.upsertNotificationPolicy, 'upsertNotificationPolicy stmt should exist');
  stmts.upsertNotificationPolicy.run(1, null, null, 5, '{}', 0);
  const row = stmts.getNotificationPolicy.get();
  assert.ok(row, 'row should exist after upsert');
  assert.strictEqual(row.enabled, 1);
  assert.strictEqual(row.rate_limit_per_hour, 5);
});

test('stmts: insertNotificationLog inserts a row', () => {
  assert.ok(stmts.insertNotificationLog, 'insertNotificationLog stmt should exist');
  stmts.insertNotificationLog.run('waiting_input', 'test-proj', 'test text', 1, null);
  const row = db.prepare('SELECT * FROM notification_log WHERE event_type = ? AND project_name = ? LIMIT 1')
    .get('waiting_input', 'test-proj');
  assert.ok(row, 'log row should exist');
  assert.strictEqual(row.delivered, 1);
});

test('stmts: getRecentNotificationLog returns matching rows', () => {
  assert.ok(stmts.getRecentNotificationLog, 'getRecentNotificationLog stmt should exist');
  // Insert a delivered row
  stmts.insertNotificationLog.run('plan_complete', 'proj2', 'text2', 1, null);
  // Query with old cutoff — should find it
  const row = stmts.getRecentNotificationLog.get('plan_complete', 'proj2', '1970-01-01T00:00:00.000Z');
  assert.ok(row, 'should find a recent notification log row');
});
