---
phase: quick-12
plan: 01
subsystem: autopilot
tags: [tmux, processSpawner, react, error-handling, polling]

# Dependency graph
requires:
  - phase: 25-autopilot-core
    provides: "processSpawner.spawnGsdCommand and AutopilotControls UI buttons"
provides:
  - "waitForIdle(sessionName, timeoutMs) in server/gsd/tmux.js — polls detectSessionState before key delivery"
  - "async spawnGsdCommand awaiting idle before tmux send-keys; exit_code=-2 on timeout"
  - "AutopilotControls inline error state — shows red error message on API failure, auto-clears after 4s"
affects: [autopilot, phase-25, phase-27]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_testWaitForIdle(detectFn, ...) injectable test hook — mirrors _testDetectFromOutput pattern from Phase 24"
    - "waitForIdleFn option injection in spawnGsdCommand — consistent with spawnFn injection pattern"
    - "async spawnGsdCommand with promise-aware _spawnPhase (resets _phaseSpawned on rejection)"

key-files:
  created: []
  modified:
    - server/gsd/tmux.js
    - server/autopilot/processSpawner.js
    - server/autopilot/AutopilotManager.js
    - server/__tests__/tmux.test.js
    - server/__tests__/processSpawner.test.js
    - client/src/pages/GSD.tsx

key-decisions:
  - "_testWaitForIdle injectable: same pattern as _testDetectFromOutput — avoids mocking real tmux in tests"
  - "waitForIdleFn default = waitForIdle in options object, not hardcoded — keeps spawnGsdCommand fully testable"
  - "_phaseSpawned set true immediately in _spawnPhase to block duplicate spawns; reset in async rejection handler"
  - "Error state in AutopilotControls uses local state + setTimeout (no new npm dep), clears after 4s"

patterns-established:
  - "Idle-before-send pattern: always await waitForIdle before tmux send-keys to prevent typing into active session"
  - "Async spawn with fallback: _spawnPhase handles both sync and async spawnFn via promise detection"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-04-02
---

# Quick Task 12: Fix Autopilot Command Delivery (waitForIdle) Summary

**Idle-gate added to tmux send-keys delivery (polls detectSessionState, rejects on timeout) and autopilot error toast via inline React state**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-02T08:20:00Z
- **Completed:** 2026-04-02T08:40:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `waitForIdle(sessionName, timeoutMs)` to `server/gsd/tmux.js` — polls `detectSessionState` every 1s, resolves when not 'working', rejects with descriptive timeout error
- Exported `_testWaitForIdle(detectFn, ...)` test hook following Phase 24's `_testDetectFromOutput` pattern
- Made `spawnGsdCommand` async; awaits `waitForIdleFn` before tmux send-keys; updates `process_registry` with `exit_code=-2` on timeout
- Updated `AutopilotManager._spawnPhase` to handle async `spawnFn` (resets `_phaseSpawned` on rejection so next tick retries)
- Replaced all four silent catch blocks in `AutopilotControls` with inline error state that shows `text-red-400` message for 4 seconds

## Task Commits

1. **Task 1: waitForIdle + async spawnGsdCommand** - `b26e57c` (feat)
2. **Task 2: AutopilotControls inline error state** - `9399642` (feat)

## Files Created/Modified
- `server/gsd/tmux.js` - Added `waitForIdle` and `_testWaitForIdle` functions, exported both
- `server/autopilot/processSpawner.js` - Made async, added `waitForIdleFn` option, await before send-keys, exit_code=-2 on timeout
- `server/autopilot/AutopilotManager.js` - Updated `_spawnPhase` to handle async spawnFn with promise detection and rejection reset
- `server/__tests__/tmux.test.js` - Added 4 waitForIdle tests via _testWaitForIdle
- `server/__tests__/processSpawner.test.js` - Updated existing tests to await async function; added 2 new integration tests
- `client/src/pages/GSD.tsx` - Added `error` state, `showError` helper, error JSX in AutopilotControls

## Decisions Made
- `_testWaitForIdle` injectable: same pattern as `_testDetectFromOutput` — avoids mocking real tmux, pure function testing
- `waitForIdleFn` injected via options object (not hardcoded require) — keeps spawnGsdCommand fully testable without module mocking
- `_phaseSpawned` set `true` immediately in `_spawnPhase` to prevent duplicate spawns while waiting; reset to `false` in async rejection handler so next tick can retry
- Error state in AutopilotControls uses local React state + setTimeout — no new npm dependencies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing processSpawner tests to await async function**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Existing 3 tests called `spawnGsdCommand` synchronously, getting back a Promise instead of result object
- **Fix:** Made tests async, added `await` keyword, injected `mockWaitForIdle` to skip real tmux calls
- **Files modified:** `server/__tests__/processSpawner.test.js`
- **Verification:** All 5 processSpawner tests pass
- **Committed in:** b26e57c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — tests not updated for async signature)
**Impact on plan:** Required fix for test correctness; no scope creep.

## Issues Encountered
- Pre-existing test failures in `api.test.js` (version string) and `Sidebar.test.tsx` (version display) — confirmed pre-existing via git stash, not introduced by this task.

## Next Phase Readiness
- Autopilot command delivery is now safe: commands only send to idle sessions
- AutopilotControls shows errors to users instead of silently swallowing them
- Phase 25-03 (the remaining autopilot plan) can proceed with reliable command delivery

## Self-Check

- [x] `server/gsd/tmux.js` — `waitForIdle` and `_testWaitForIdle` exported
- [x] `server/autopilot/processSpawner.js` — async, awaits waitForIdleFn
- [x] `client/src/pages/GSD.tsx` — error state in AutopilotControls
- [x] Commit b26e57c exists
- [x] Commit 9399642 exists

## Self-Check: PASSED

---
*Phase: quick-12*
*Completed: 2026-04-02*
