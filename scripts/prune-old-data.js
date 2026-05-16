#!/usr/bin/env node
'use strict';

// Prune old event data to keep disk usage bounded.
// Strategy:
//   - Null event.data (raw payloads) older than 2 days — keeps row structure intact
//   - Delete events older than 30 days from non-active sessions
//   - Delete agents older than 30 days from non-active sessions
//   - Delete sessions older than 30 days that are not active
//   - VACUUM to reclaim freed pages
// Run via system cron: 0 3 * * * (daily 3am)
// Pattern: try/catch wrapper, never exit non-zero (matches busyMarkers-sweep.cjs).

try {
  const { db } = require('../server/db');
  const DATA_CUTOFF = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const DELETE_CUTOFF = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Step 1: null raw payload on events older than 2d (preserves row for display)
  const dataNulled = db.prepare(
    `UPDATE events SET data = NULL WHERE created_at < ? AND data IS NOT NULL`
  ).run(DATA_CUTOFF).changes;

  // Step 2: delete events older than 30d from non-active sessions
  const eventsDeleted = db.prepare(
    `DELETE FROM events
     WHERE created_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(DELETE_CUTOFF).changes;

  // Step 3: agents older than 30d from non-active sessions
  const agentsDeleted = db.prepare(
    `DELETE FROM agents
     WHERE started_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(DELETE_CUTOFF).changes;

  // Step 4: sessions older than 30d that are not active
  const sessionsDeleted = db.prepare(
    `DELETE FROM sessions WHERE started_at < ? AND status != 'active'`
  ).run(DELETE_CUTOFF).changes;

  // Step 5: reclaim freed pages
  db.exec('VACUUM');

  process.stdout.write(
    `[prune-old-data] ${new Date().toISOString()} Nulled data: ${dataNulled} events | Deleted: ${eventsDeleted} events, ${agentsDeleted} agents, ${sessionsDeleted} sessions | VACUUM done\n`
  );
  process.exit(0);
} catch (e) {
  process.stderr.write(`prune-old-data: ${e && e.message ? e.message : e}\n`);
  process.exit(0); // Never exit non-zero — matches busyMarkers-sweep.cjs pattern
}
