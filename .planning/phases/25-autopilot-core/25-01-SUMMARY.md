---
phase: 25-autopilot-core
plan: 01
subsystem: autopilot
tags: [autopilot, circuit-breaker, websocket, sqlite, tdd, polling, state-machine]

# Dependency graph
requires:
  - phase: 24-waiting-accuracy-safety-foundation
    provides: CircuitBreaker, processSpawner, autopilot_runs schema, process_registry schema
  - phase: server/gsd/readers.js
    provides: readState(root) returns progress.completed_phases for phase detection
  - phase: server/websocket.js
    provides: broadcast(type, data) for real-time progress events
provides:
  - AutopilotManager class with start/pause/resume/stop API
  - setInterval-based watchLoop polling STATE.md for phase transitions
  - Failure learning: retry once with adjusted prompt before CircuitBreaker.recordFailure()
  - _failureRecorded guard prevents duplicate recordFailure calls per phase
  - autopilot_progress + autopilot_halted WebSocket event shapes
affects: [25-02, 25-03, 27-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - setInterval polling loop (not recursive async) to avoid stack overflow on long runs
    - Dependency injection pattern for db, spawnFn, broadcastFn, readStateFn, circuitBreakerFactory
    - _failureRecorded guard prevents duplicate CB.recordFailure() calls per phase across poll ticks
    - circuitBreakerFactory injection allows mock CB in tests without module mocking

key-files:
  created:
    - server/autopilot/AutopilotManager.js
    - server/__tests__/autopilotManager.test.js
  modified: []

key-decisions:
  - "Use setInterval-based loop (not recursive async) to avoid stack overflow on long runs"
  - "circuitBreakerFactory injection allows mock CircuitBreaker in tests without jest.mock/proxyquire"
  - "_failureRecorded boolean flag prevents duplicate recordFailure calls when STATUS.md stays 'failed' across multiple poll ticks after retry"
  - "Retry path: spawn once with '--retry' args, then set _retryAttempted=true; second tick with status='failed' triggers recordFailure only once"

patterns-established:
  - "Injection pattern: AutopilotManager({ db, spawnFn, broadcastFn, readStateFn, pollMs, circuitBreakerFactory }) — all deps injectable for tests"
  - "Per-phase state machine: _phaseSpawned, _retryAttempted, _failureRecorded — all reset on phase advance"

requirements-completed: [AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-06, AUTO-07]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 25 Plan 01: AutopilotManager Summary

**setInterval-driven autonomous loop controller with pause/resume, one-retry failure learning, and CircuitBreaker halt via full dependency injection**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-01T12:16:09Z
- **Completed:** 2026-04-01T12:30:33Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- AutopilotManager class (`start/pause/resume/stop`) drives the autonomous GSD plan→execute loop
- Polling loop uses `setInterval` (not recursive async) to avoid stack overflow on multi-phase runs
- Failure learning: first failure spawns a retry with `--retry "Phase N failed..."` prompt adjustment; second failure calls `CircuitBreaker.recordFailure()`
- `_failureRecorded` guard ensures `recordFailure` is called exactly once per phase even when `readStateFn` keeps returning `status: 'failed'` across ticks
- All 6 unit tests pass (GREEN) with zero new regressions in the full server test suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for AutopilotManager (RED)** - `c39c8c5` (test)
2. **Task 2: Implement AutopilotManager (GREEN)** - `0a5fa45` (feat)

**Plan metadata:** (docs commit below)

_Note: TDD tasks have two commits — test (RED) → feat (GREEN)_

## Files Created/Modified
- `server/autopilot/AutopilotManager.js` - AutopilotManager class (354 lines), all loop logic, pause/resume, failure retry, circuit breaker halt
- `server/__tests__/autopilotManager.test.js` - 6 unit tests with in-memory SQLite, stubbed spawnFn/broadcastFn/readStateFn/circuitBreakerFactory

## Decisions Made
- Used `circuitBreakerFactory` injection instead of `jest.mock` — avoids module-level patching, consistent with Phase 24 pattern
- `_failureRecorded` boolean added after discovering that `readStateFn` returning persistent `status: 'failed'` would call `recordFailure` on every subsequent tick
- Phase advancement on non-halting failures: when circuit is still closed after recording failure, the loop advances to the next phase rather than blocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added _failureRecorded guard to prevent duplicate recordFailure calls**
- **Found during:** Task 2 (GREEN phase — test 4 and 5 failing)
- **Issue:** After retry was spawned and `_retryAttempted=true`, `readStateFn` kept returning `status: 'failed'` on every tick. Without a guard, each tick called `recordFailure` — more than once per phase.
- **Fix:** Added `this._failureRecorded` boolean. The second branch of `_handlePhaseFailure` returns early if already recorded. Reset on phase advance.
- **Files modified:** `server/autopilot/AutopilotManager.js`
- **Verification:** Tests 4 and 5 now pass; `recordFailure` called exactly once per failure event
- **Committed in:** `0a5fa45` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — logic bug in failure guard)
**Impact on plan:** Essential for correctness — without the guard the CircuitBreaker would open prematurely on a single failure. No scope creep.

## Issues Encountered
- Pre-existing test failure: `returns version and liveUrl for a project with PROJECT.md` in `api.test.js` — unrelated to this plan, was failing before my changes (confirmed via git stash).

## Next Phase Readiness
- `AutopilotManager` is fully implemented and tested — Plans 25-02 (REST API) and 25-03 (WebSocket UI) can now consume it
- `circuitBreakerFactory` injection pattern is available for 25-02 tests
- WebSocket event shapes (`autopilot_progress`, `autopilot_halted`) are established and stable

---
*Phase: 25-autopilot-core*
*Completed: 2026-04-01*

## Self-Check: PASSED

- `server/autopilot/AutopilotManager.js` — FOUND
- `server/__tests__/autopilotManager.test.js` — FOUND
- `.planning/phases/25-autopilot-core/25-01-SUMMARY.md` — FOUND
- commit `c39c8c5` (RED) — FOUND
- commit `0a5fa45` (GREEN) — FOUND
