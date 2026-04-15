---
phase: 48-idle-session-cost-controls
plan: "03"
subsystem: server
tags: [tmux, idle-detection, cost, background-loop, testing, tdd]
dependency_graph:
  requires:
    - phase: 48-01
      provides: gracefulShutdown(sessionName, projectName) primitive
    - phase: 48-02
      provides: getTmuxCostForSession(), logDailyTmuxCosts() cost measurement
    - phase: 43
      provides: paneHashCache, detectSessionStateAsync from tmux.js
  provides:
    - server/gsd/idleDetector.js idle detector background loop
    - isSessionIdle() exported for external callers
    - forceKillIfOverdue() injectable force-kill for stuck working sessions
    - startIdleDetector() wired at server startup in !GSD_DATA_URL guard
  affects: [plan-04 (Services $/day column integration), server/index.js startup]
tech-stack:
  added: []
  patterns:
    - "Dual calling signature: options-object for tests/simple callers, injectable-async for internal DI"
    - "5-minute startup delay before first idle check (avoid killing sessions on fresh deploy)"
    - "Recursive setTimeout prevents tick overlap on slow systems"

key-files:
  created:
    - server/gsd/idleDetector.js
  modified:
    - server/gsd/tmux.js
    - server/index.js

key-decisions:
  - "isSessionIdle supports dual calling signature: options-object (tests) + injectable-async (internal) — allows test file API without breaking internal DI pattern"
  - "paneHashCache exported from tmux.js — was previously private Map, now also exported for idle detector"
  - "forceKillIfOverdue uses stateEnteredAt timestamp (ISO string) rather than paneHashCache — matches test stub API"
  - "Idle detector starts in else branch of GSD_DATA_URL guard — shares loadProjectsLocal with stateBroadcaster"

patterns-established:
  - "Idle detector: waiting + paneHashCache.lastChangedAt > threshold → gracefulShutdown"
  - "Idle detector: working + stateEnteredAt > 6h → forceKillIfOverdue (no pause-work)"
  - "Autopilot sessions: 2× threshold applied via isAutopilot flag"

requirements-completed: []

duration: "~12min"
completed: "2026-04-15"
---

# Phase 48 Plan 03: Idle Detector Background Loop Summary

**Idle detector background loop auto-closes tmux sessions via gracefulShutdown after 2h of waiting state, force-kills stuck working sessions after 6h, with autopilot sessions using a 2x threshold.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-15T09:21:00Z
- **Completed:** 2026-04-15T09:33:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `server/gsd/idleDetector.js` created with full DI injectable test variants matching pre-created test stubs
- `paneHashCache` exported from `tmux.js` (was private — needed by idle detector)
- `startIdleDetector(loadProjectsFn)` wired into `server/index.js` inside `!GSD_DATA_URL` guard
- All 5 idle-detector.test.js tests GREEN, full 15-test Phase 48 suite GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement idleDetector.js with injectable test variants** - `bfdce47` (feat)
2. **Task 2: Wire startIdleDetector into server/index.js startup** - `e630de2` (feat)

## Files Created/Modified

- `server/gsd/idleDetector.js` - Idle detector module: isSessionIdle, forceKillIfOverdue, startIdleDetector, _testCheckAndCloseSession, hasActiveAutopilotRun
- `server/gsd/tmux.js` - Added paneHashCache to module.exports
- `server/index.js` - Added startIdleDetector(loadProjectsLocal) call in !GSD_DATA_URL branch

## Decisions Made

- **Dual calling signature for isSessionIdle:** The pre-created test stub used `isSessionIdle(sessionName, { sessionState, lastChangedAt, threshold, isAutopilot })` (options-object) while the plan's implementation spec described an async injectable `(sessionName, thresholdMs, { detectFn, paneCache, nowMs })` signature. Both are supported by detecting the argument type at runtime — typeof opts === 'object' → options-object path, typeof thresholdMs === 'number' → injectable path.
- **forceKillIfOverdue uses stateEnteredAt:** Test stub used `{ stateEnteredAt: new Date(...).toISOString() }` rather than paneHashCache. Implemented accordingly for test compatibility.
- **paneHashCache exported from tmux.js:** Required for the injectable test pattern; now accessible to idleDetector and any future consumers.

## Deviations from Plan

### Auto-adapted: Test stub API differs from plan implementation spec

**1. [Rule 1 - Adaptation] isSessionIdle test signature uses options-object, not injectable-async**
- **Found during:** Task 1 (reading existing idle-detector.test.js created in Plan 01)
- **Issue:** Test stubs (Wave 0, created in Plan 01) expected `isSessionIdle(session, { sessionState, lastChangedAt, threshold, isAutopilot })` and a separate `forceKillIfOverdue(session, project, opts)` export. Plan spec described `_testIsSessionIdle(session, thresholdMs, { detectFn, paneCache, nowMs })` only.
- **Fix:** Implemented both APIs in a single `isSessionIdle` function via runtime type detection. `forceKillIfOverdue` added as a separate export matching the test contract. `_testIsSessionIdle` is an alias for the injectable path for backward compatibility with the plan spec exports.
- **Files modified:** server/gsd/idleDetector.js
- **Verification:** All 5 idle-detector.test.js tests GREEN
- **Committed in:** bfdce47

---

**Total deviations:** 1 auto-adapted (test API mismatch between Wave 0 stubs and Plan 03 implementation spec)
**Impact on plan:** No scope creep. Both API surfaces are exported, all test assertions pass, internal behavior is identical.

## Issues Encountered

None - test suite passed cleanly after adapting to the pre-created test stub API.

## Next Phase Readiness

- Phase 48 Plans 01-03 complete: gracefulShutdown primitive + cost measurement + idle detector loop
- Server auto-closes idle sessions at runtime (5min startup delay, 60s poll)
- Remaining: Plan 04 (Services $/day column in UI) if applicable to this phase

---
*Phase: 48-idle-session-cost-controls*
*Completed: 2026-04-15*
