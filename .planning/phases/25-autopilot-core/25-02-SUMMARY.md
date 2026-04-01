---
phase: 25-autopilot-core
plan: 02
subsystem: autopilot
tags: [autopilot, rest-api, express, routes, tdd, dependency-injection]

# Dependency graph
requires:
  - phase: 25-autopilot-core/25-01
    provides: AutopilotManager class (start/pause/resume/stop)
  - phase: server/index.js
    provides: createApp() Express factory
provides:
  - Five autopilot REST endpoints under /api/autopilot
  - runRegistry Map: one active AutopilotManager per project
  - _setManagerFactory / _clearRun / _resetManagerFactory test hooks for DI
  - getStatus() method added to AutopilotManager (missing from 25-01)
affects: [25-03, 27-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - runRegistry Map pattern: projectName → { manager, runId } for stateful per-project routing
    - Test hook export pattern: _setManagerFactory / _clearRun / _resetManagerFactory on router for DI
    - basicAuth bypass pattern: req.path.startsWith('/api/autopilot') mirrors /api/gsd

key-files:
  created:
    - server/routes/autopilot.js
    - server/__tests__/autopilotRoutes.test.js
  modified:
    - server/index.js
    - server/autopilot/AutopilotManager.js

key-decisions:
  - "runRegistry Map keyed by projectName enforces one active run per project — 409 on duplicate start"
  - "Test hooks exported directly on router object (_setManagerFactory, _clearRun, _resetManagerFactory) — no module mocking needed"
  - "getStatus() added to AutopilotManager: reads status from DB for accuracy, falls back to in-memory flags"
  - "basicAuth bypass added for /api/autopilot matching the /api/gsd pattern"

requirements-completed: [AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-06]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 25 Plan 02: Autopilot REST Routes Summary

**Five HTTP endpoints exposing the AutopilotManager via runRegistry injection, with full test coverage and getStatus() added to AutopilotManager**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-01T12:37:03Z
- **Completed:** 2026-04-01T12:52:00Z
- **Tasks:** 2 (TDD: RED + GREEN, then Task 2 wiring)
- **Files modified:** 4

## Accomplishments

- `server/routes/autopilot.js`: Five endpoints registered — POST /start, POST /pause, POST /resume, GET /status/:projectName, POST /plan-all
- `runRegistry` Map ensures one active AutopilotManager per project; 409 on duplicate start
- Test hooks (`_setManagerFactory`, `_clearRun`, `_resetManagerFactory`) enable DI without module mocking
- `server/index.js`: router mounted at `/api/autopilot` with basicAuth bypass
- `AutopilotManager.getStatus()` added — reads status from DB for accuracy, falls back to in-memory flags
- 14 route tests pass; 1 pre-existing failure in api.test.js unchanged; 0 new regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for autopilot REST routes** - `8629a52` (test)
2. **Task 1 GREEN + Task 2: Route implementation, AutopilotManager.getStatus(), index.js wiring** - `daf849f` (feat)
3. **Task 2 separate commit: server/index.js wiring** - `4fe016f` (feat)

## Files Created/Modified

- `server/routes/autopilot.js` — 175 lines, 5 endpoints, runRegistry, test hooks
- `server/__tests__/autopilotRoutes.test.js` — 278 lines, 14 integration tests with DI
- `server/index.js` — +3 lines: require, app.use, basicAuth bypass
- `server/autopilot/AutopilotManager.js` — +28 lines: getStatus() method

## Decisions Made

- `runRegistry` Map pattern (projectName → entry) is simpler and more testable than storing run state in DB only
- Test hooks exported directly on the `router` object — avoids jest.mock or proxyquire, consistent with project's node:test + injection pattern
- `getStatus()` reads from DB first for accuracy since pause/resume updates DB status; falls back to in-memory if DB fails

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added getStatus() to AutopilotManager**
- **Found during:** Task 1 GREEN — route needed `manager.getStatus()` per the plan's interface spec, but 25-01 did not implement it
- **Issue:** `AutopilotManager` had no `getStatus()` method despite it being in the plan's interface spec
- **Fix:** Added `getStatus()` that reads status from `autopilot_runs` DB table and returns `{ runId, status, currentPhaseNum, projectName, startedAt }`
- **Files modified:** `server/autopilot/AutopilotManager.js`
- **Commit:** `daf849f` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking Issue] Test process.exit(0) to prevent WS heartbeat hang**
- **Found during:** Task 1 — tests hung waiting for server to close
- **Issue:** WebSocket heartbeat interval kept Node process alive after `server.close()`
- **Fix:** Added `setTimeout(() => process.exit(0), 100)` in `after()` hook, matching api.test.js pattern
- **Files modified:** `server/__tests__/autopilotRoutes.test.js`
- **Commit:** `daf849f` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (Rule 2 — missing functionality, Rule 3 — blocking test hang)
**Impact on plan:** Both fixes were necessary for correctness and test viability. No scope creep.

## Issues Encountered

- Pre-existing test failure: `returns version and liveUrl for a project with PROJECT.md` in `api.test.js` — unrelated to this plan, was pre-existing before changes.

## Next Phase Readiness

- Five autopilot REST endpoints are live and tested — Plan 25-03 (WebSocket UI) can consume them
- `runRegistry` is in-memory; 25-03 can read it via `GET /api/autopilot/status/:projectName`
- WebSocket event shapes established in 25-01 remain unchanged

---
*Phase: 25-autopilot-core*
*Completed: 2026-04-01*

## Self-Check: PASSED

- `server/routes/autopilot.js` — FOUND
- `server/__tests__/autopilotRoutes.test.js` — FOUND
- `.planning/phases/25-autopilot-core/25-02-SUMMARY.md` — FOUND
- commit `8629a52` (RED) — FOUND
- commit `daf849f` (GREEN) — FOUND
- commit `4fe016f` (Task 2 wiring) — FOUND
