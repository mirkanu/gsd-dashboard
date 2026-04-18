#!/usr/bin/env node
'use strict';

// Phase 49 Plan 03: one-shot CLI to purge expired busy-marker files.
// Invoked from the weekly disk-prune cron. Fail-safe: never exit non-zero —
// a sweep failure must not break the prune pipeline.
try {
  require('./busyMarkers').sweepExpired();
} catch (e) {
  process.stderr.write(`busyMarkers-sweep: ${e && e.message ? e.message : e}\n`);
  process.exit(0);
}
