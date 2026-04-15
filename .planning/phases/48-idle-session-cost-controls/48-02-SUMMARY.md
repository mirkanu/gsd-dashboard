---
phase: 48-idle-session-cost-controls
plan: "02"
subsystem: cost-measurement
tags: [tmux, cost, rss, railway, sqlite]
dependency_graph:
  requires: [server/db.js (external_service_costs), server/crypto.js (getSecret)]
  provides: [server/gsd/costMeasurement.js, GET /api/gsd/projects/:name/tmux-cost]
  affects: [plan-03 (idle-detector uses logTmuxCostEstimate), plan-04 (Services $/day column)]
tech_stack:
  added: []
  patterns: [deferred-require for circular-dep avoidance, injectable-db for testability]
key_files:
  created:
    - server/gsd/costMeasurement.js
    - server/__tests__/tmux-cost.test.js (was pre-created in Plan 01 — committed here)
  modified:
    - server/routes/gsd.js
decisions:
  - "Test file used bytes-based API (estimateTmuxCostPerDay(rssBytes)) not KB-based; costMeasurement.js exports both APIs"
  - "logTmuxCostEstimate uses simple INSERT (single-session, idle-detector use case); logDailyTmuxCosts does upsert with same-day dedup (aggregate use case)"
  - "getRailwayRate() uses deferred require of ../crypto to avoid circular dep at module load time"
metrics:
  duration: "~17 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_changed: 3
---

# Phase 48 Plan 02: tmux Cost Measurement Module Summary

**One-liner:** RSS-based $/day cost estimation module for tmux sessions via ps command, with SQLite daily log and proxied HTTP route.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create costMeasurement.js with RSS read, cost math, and daily log | 92bafb7 | server/gsd/costMeasurement.js, server/__tests__/tmux-cost.test.js |
| 2 | Add GET /api/gsd/projects/:name/tmux-cost route | a278162 | server/routes/gsd.js |

## What Was Built

### server/gsd/costMeasurement.js

Pure cost math + DB log module with two API surfaces:

**Bytes-based API** (matches tmux-cost.test.js):
- `estimateTmuxCostPerDay(rssBytes, rateGbMonth)` — pure formula: `(rssBytes / 1GB) × rate / 30`
- `logTmuxCostEstimate(sessionName, rssBytes, opts)` — simple INSERT into external_service_costs

**KB-based API** (used by route and plan spec):
- `_testComputeDailyCost(rssKb, rateGbMonth)` — same formula but input in KB
- `computeDailyCost` — alias for above
- `getTmuxRssKb(sessionName)` — reads RSS via `tmux list-panes` + `ps -o rss=`
- `getTmuxCostForSession(sessionName)` — combined read + compute returning `{sessionName, rssKb, rssGb, dailyCostUsd, rateGbMonth}`

**Aggregate log** (for Plan 03 idle detector):
- `logDailyTmuxCosts(sessions, dbOverride)` — upserts aggregate row with same-day dedup
- `_testLogDailyCost` — test alias for above

### GET /api/gsd/projects/:name/tmux-cost

Added to server/routes/gsd.js after pause-session route:
- Proxy-aware: forwards to `GSD_DATA_URL` when set
- Returns `{ ok: true, project, sessionName, rssKb, rssGb, dailyCostUsd, rateGbMonth }`
- 404 for unknown project, 422 when no `tmux_session` configured

## Verification

```
tmux.cost: RSS 4096 MB × $10/GB-month / 30 days ≈ $1.33/day  ✔
tmux.cost: RSS 0 returns $0.00/day                             ✔
cost.log: inserts row with tmux_cost_estimate prefix           ✔
```

Full server test suite: 110 pass, 2 fail (both pre-existing, unrelated to this plan).

## Deviations from Plan

### Auto-adapted: Test file used bytes-based API

- **Found during:** Task 1
- **Issue:** The pre-created `tmux-cost.test.js` expected `estimateTmuxCostPerDay(rssBytes)` (bytes input) and `logTmuxCostEstimate(session, rssBytes, opts)` rather than the KB-based `_testComputeDailyCost(rssKb)` described in the plan's `<behavior>` section.
- **Fix:** Implemented both APIs. `estimateTmuxCostPerDay` is the bytes-based primary export; `_testComputeDailyCost` is the KB-based alias used by the route. Both are exported from the module.
- **Files modified:** server/gsd/costMeasurement.js
- **Commit:** 92bafb7

## Self-Check: PASSED
