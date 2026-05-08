#!/usr/bin/env node
'use strict';

// Phase 72 D-06: prune sessions/agents/events older than 90 days.
// Preserves rows belonging to status='active' sessions regardless of age.
// Run via system cron: 0 3 * * 0 (Sunday 3am)
// Pattern: try/catch wrapper, never exit non-zero (matches busyMarkers-sweep.cjs).

try {
  const { db } = require('../server/db');
  const CUTOFF = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Step 1: events older than 90d that belong to non-active sessions
  // (active sessions may have old events — preserve them)
  const eventsDeleted = db.prepare(
    `DELETE FROM events
     WHERE created_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(CUTOFF).changes;

  // Step 2: agents older than 90d that belong to non-active sessions
  const agentsDeleted = db.prepare(
    `DELETE FROM agents
     WHERE started_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(CUTOFF).changes;

  // Step 3: sessions older than 90d that are not active
  const sessionsDeleted = db.prepare(
    `DELETE FROM sessions WHERE started_at < ? AND status != 'active'`
  ).run(CUTOFF).changes;

  process.stdout.write(
    `[prune-old-data] ${new Date().toISOString()} Deleted: ${eventsDeleted} events, ${agentsDeleted} agents, ${sessionsDeleted} sessions (cutoff: ${CUTOFF})\n`
  );
  process.exit(0);
} catch (e) {
  process.stderr.write(`prune-old-data: ${e && e.message ? e.message : e}\n`);
  process.exit(0); // Never exit non-zero — matches busyMarkers-sweep.cjs pattern
}
