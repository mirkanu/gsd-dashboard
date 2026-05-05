---
phase: 53-auto-verify-by-default
plan: 03
subsystem: api
tags: [verifyOrchestrator, stateBroadcaster, idleDetector, gsd-routes, dependency-injection]

# Dependency graph
requires:
  - phase: 53-01
    provides: verifyOrchestrator module with startVerify, runVerify, maybeStartVerify, isVerifying
  - phase: 53-02
    provides: VerifyBadge UI component and POST /verify route wire-up
provides:
  - stateBroadcaster fires maybeStartVerify fire-and-forget on working→waiting transition
  - idleDetector skips auto-close when isVerifying returns true, logs verify-in-progress
  - pause-session route calls runVerify before gracefulShutdown via _testPauseSession helper
  - archive route calls runVerify + kill-session before setting archived=true (now async)
  - POST /api/gsd/projects/:name/verify endpoint with GSD_DATA_URL proxy block
affects: [auto-verify-by-default, idleDetector, stateBroadcaster, gsd-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable isVerifyingFn as 7th param in _testPollOnce — prevents re-trigger guard from coupling to in-memory _verifyingSet during tests"
    - "_testPauseSession helper extracts pause logic for DI test isolation (same pattern as _testCheckAndCloseSession)"

key-files:
  created:
    - server/routes/__tests__/gsd-pause-session.test.js
  modified:
    - server/gsd/stateBroadcaster.js
    - server/gsd/idleDetector.js
    - server/routes/gsd.js
    - server/__tests__/idle-detector.test.js
    - server/__tests__/pause-route.test.js

key-decisions:
  - "isVerifyingFn injected as 7th param in stateBroadcaster._testPollOnce (not direct module call) — makes re-trigger guard testable without touching _verifyingSet"
  - "pause-route.test.js structural assertion updated to check gracefulShutdownFn = gracefulShutdown pattern instead of literal call — correctly validates DI-based refactor"
  - "verify-before-archive uses 5-minute timeout vs verify-before-pause 10-minute — archive is less frequent and tolerance for delay is lower"

patterns-established:
  - "Fire-and-forget verify trigger: maybeStartVerifyFn(project, broadcastFn).catch(() => {}) — never blocks 2s poll loop"
  - "isVerifyingFn guard before busy-markers check in idleDetector — verify takes precedence over all auto-close skip checks"

requirements-completed: [ATV-01, ATV-04]

# Metrics
duration: 22min
completed: 2026-05-05
---

# Phase 53 Plan 03: Wire verifyOrchestrator Into Infrastructure Summary

**verifyOrchestrator wired into stateBroadcaster (auto-trigger on working→waiting), idleDetector (skip auto-close during verify), and three gsd.js route handlers (pause, archive, POST /verify)**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-05T08:25:00Z
- **Completed:** 2026-05-05T08:47:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- stateBroadcaster fires `maybeStartVerify` fire-and-forget on working→waiting transition with injected `isVerifyingFn` re-trigger guard
- idleDetector skips auto-close with `verify-in-progress` JSONL log entry when `isVerifyingFn` returns true (guard runs before busy-markers check)
- pause-session route now calls `runVerify` before `gracefulShutdown` via `_testPauseSession` injectable helper (3 tests pass)
- archive route converted to async and calls `runVerify` + `kill-session` before setting `archived=true`
- New `POST /api/gsd/projects/:name/verify` endpoint calls `maybeStartVerify` fire-and-forget, with GSD_DATA_URL proxy block

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire verifyOrchestrator into stateBroadcaster and idleDetector** - `92a1e65` (feat)
2. **Task 2: Extend gsd.js routes — verify-before-pause, verify-before-archive, POST /verify** - `1d5de28` (feat)

## Files Created/Modified
- `server/gsd/stateBroadcaster.js` — requires verifyOrchestrator; 6th/7th injectable params in _testPollOnce; working→waiting trigger
- `server/gsd/idleDetector.js` — requires verifyOrchestrator; isVerifyingFn guard before busy-markers check
- `server/routes/gsd.js` — verifyOrchestrator require; _testPauseSession helper + export; async archive; POST /verify endpoint
- `server/__tests__/idle-detector.test.js` — new test: isVerifyingFn=()=>true → skipped/verify-in-progress
- `server/__tests__/pause-route.test.js` — updated structural assertion to match DI-based refactor
- `server/routes/__tests__/gsd-pause-session.test.js` — 3 tests for ATV-04 verify-before-pause chain (pre-existing from Plan 02)

## Decisions Made
- isVerifyingFn injected as 7th param in `_testPollOnce` (not a direct `verifyOrchestrator.isVerifying` call in the guard body) — allows test isolation without touching `_verifyingSet` in-memory state
- `pause-route.test.js` structural assertion updated from checking `gracefulShutdown(tmux_session` string to `gracefulShutdownFn = gracefulShutdown` — the DI refactor changes the literal call site but the real implementation is still wired correctly
- verify-before-archive uses 5-minute timeout (vs 10-minute for pause) — archive is an infrequent power-user action; shorter cap prevents indefinite hang

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing pause-route.test.js structural assertion**
- **Found during:** Task 2 (extend gsd.js routes)
- **Issue:** `pause-route.test.js` checked for the literal string `gracefulShutdown(tmux_session` which no longer appears after the `_testPauseSession` DI refactor (now `gracefulShutdownFn(tmux_session`). Test was passing before Task 2, failing after.
- **Fix:** Updated assertion to check `gracefulShutdownFn = gracefulShutdown` — still validates that `gracefulShutdown` is the default implementation, just matches the new pattern
- **Files modified:** `server/__tests__/pause-route.test.js`
- **Committed in:** `1d5de28` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test detectFn return type for isVerifyingFn idle-detector test**
- **Found during:** Task 1 (idle-detector test case)
- **Issue:** Initial test `detectFn: async () => ({ sessionState: 'waiting', rawPaneState: 'waiting' })` returned an object instead of a string `'waiting'`. `_testIsSessionIdle` calls `detectFn` internally and checks `state !== 'waiting'`, so it returned `false` (not idle), causing the function to return `null` before reaching the `isVerifyingFn` guard.
- **Fix:** Changed `detectFn` to `async () => 'waiting'` and used a fixed `nowMs` variable for consistency
- **Files modified:** `server/__tests__/idle-detector.test.js`
- **Committed in:** `92a1e65` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
- 8 pre-existing test failures present before and after changes (EACCES on gsd-projects.json, processSpawner, autopilot, STAT-02 heuristic). All confirmed pre-existing via git stash comparison. No new regressions introduced.

## Next Phase Readiness
- All ATV-01 and ATV-04 wiring complete
- verifyOrchestrator is now connected to all three trigger points: state transition, idle auto-close guard, and route handlers
- UI VerifyBadge from Plan 02 can now receive verify state changes via WebSocket broadcasts from all trigger paths

---
*Phase: 53-auto-verify-by-default*
*Completed: 2026-05-05*

## Self-Check: PASSED

| Item | Status |
|------|--------|
| server/gsd/stateBroadcaster.js | FOUND |
| server/gsd/idleDetector.js | FOUND |
| server/routes/gsd.js | FOUND |
| server/__tests__/idle-detector.test.js | FOUND |
| server/routes/__tests__/gsd-pause-session.test.js | FOUND |
| 53-03-SUMMARY.md | FOUND |
| Commit 92a1e65 | FOUND |
| Commit 1d5de28 | FOUND |
