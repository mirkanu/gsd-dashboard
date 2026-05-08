---
phase: 72-disk-full-prevention
plan: "04"
subsystem: scripts
tags: [disk-full, data-pruning, sqlite, cron]
dependency_graph:
  requires: [72-01-PLAN.md, 72-02-PLAN.md]
  provides: [D-06-data-pruning, DISK-DATA-PRUNING]
  affects: [data/dashboard.db]
tech_stack:
  added: []
  patterns: [fail-safe-never-exit-nonzero, FK-aware-delete-order, active-session-guard]
key_files:
  created:
    - scripts/prune-old-data.js
  modified: []
decisions:
  - "Delete order: events → agents → sessions (respects FK cascades, avoids constraint violations)"
  - "Active session guard: NOT IN (SELECT id FROM sessions WHERE status = 'active') applied to events and agents; status != 'active' on sessions DELETE"
  - "90-day retention: preserves analytically relevant history while bounding DB growth"
  - "Cron at Sunday 3am (0 3 * * 0): off-peak; WAL mode allows concurrent reads during write"
  - "Log to /home/claude/.pm2/logs/prune-old-data.log: consistent with other PM2-adjacent scripts"
metrics:
  duration: "2 min"
  completed: "2026-05-08"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
requirements_completed:
  - DISK-DATA-PRUNING
---

# Phase 72 Plan 04: Weekly Data Pruning Script Summary

**One-liner:** Created scripts/prune-old-data.js with 90-day SQLite retention and active-session guard, registered as weekly Sunday 3am cron for the claude user.

## What Was Done

### Task 1: scripts/prune-old-data.js

Created `scripts/prune-old-data.js` implementing D-06 (data pruning):

- **FK-safe delete order:** events first, agents second, sessions third — prevents FK constraint violations
- **Active session protection:** events and agents use `NOT IN (SELECT id FROM sessions WHERE status = 'active')`; sessions DELETE adds `status != 'active'`. Active sessions and all their rows are never touched regardless of age.
- **90-day cutoff:** `Date.now() - 90 * 24 * 60 * 60 * 1000` computed fresh on each run
- **Fail-safe pattern:** try/catch wrapper; both success path and catch block call `process.exit(0)`. Mirrors `busyMarkers-sweep.cjs` exactly — a pruning error must not break the cron pipeline.
- **Readable output:** `[prune-old-data] {ISO timestamp} Deleted: N events, M agents, P sessions (cutoff: {ISO})`
- **Executable bit set:** `chmod +x` applied

Dry-run result (no old data present, as expected): `Deleted: 0 events, 0 agents, 0 sessions` — correct.

### Task 2: Register weekly cron entry

Added cron entry for the claude user:

```
0 3 * * 0 node /home/services/gsddashboard/scripts/prune-old-data.js >> /home/claude/.pm2/logs/prune-old-data.log 2>&1
```

This is the 6th cron entry for the claude user (5 pre-existing entries). Entry appears exactly once.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create scripts/prune-old-data.js | 06e7bd5 | scripts/prune-old-data.js (created) |
| 2 | Register weekly cron entry | (system crontab — no git artifact) | crontab -l |

## Verification Results

All acceptance criteria passed:

| Check | Result |
|-------|--------|
| `node --check scripts/prune-old-data.js` | exit 0 — syntax OK |
| `grep -c 'DELETE FROM events'` | 1 |
| `grep -c 'DELETE FROM agents'` | 1 |
| `grep -c 'DELETE FROM sessions'` | 1 |
| `grep -c "status != 'active'"` | 1 |
| `grep -c "status = 'active'"` | 2 |
| `grep -c 'process.exit(0)'` | 2 |
| `grep -c 'process.exit(1)'` | 0 |
| `test -x scripts/prune-old-data.js` | OK |
| `node scripts/prune-old-data.js` | `Deleted: 0 events, 0 agents, 0 sessions` — exit 0 |
| `crontab -l \| grep -c prune-old-data` | 1 (exactly once) |
| `grep '0 3 \* \* 0'` | 1 (Sunday 3am) |
| `grep '/home/services/gsddashboard/scripts/prune-old-data.js'` | 1 (absolute path) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Script is fully functional with real DB queries.

## Threat Flags

None — script accesses only the local SQLite DB (`data/dashboard.db`) with no network calls. Active session guard (T-72-08 mitigation) is implemented as specified.

## Self-Check: PASSED

- `scripts/prune-old-data.js` exists and is executable: confirmed
- Commit `06e7bd5` exists: confirmed
- No unintended file deletions in commit
- Cron entry present in `crontab -l` for claude user: confirmed
