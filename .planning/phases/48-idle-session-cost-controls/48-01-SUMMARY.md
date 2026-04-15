---
phase: 48-idle-session-cost-controls
plan: "01"
subsystem: server
tags: [graceful-shutdown, tmux, proxy, testing, tdd]
dependency_graph:
  requires: []
  provides: [gracefulShutdown primitive, PROXY_PREFIXES /api/gsd, Wave 0 test stubs]
  affects: [server/routes/gsd.js, server/routes/proxy.js]
tech_stack:
  added: []
  patterns: [DI injectable test variant, polling with deadline, tmux send-keys + kill-session]
key_files:
  created:
    - server/gsd/gracefulShutdown.js
    - server/__tests__/graceful-shutdown.test.js
    - server/__tests__/idle-detector.test.js
    - server/__tests__/tmux-cost.test.js
    - server/__tests__/pause-route.test.js
    - server/__tests__/proxy-prefixes.test.js
  modified:
    - server/routes/gsd.js
    - server/routes/proxy.js
decisions:
  - gracefulShutdown uses _testGracefulShutdown DI pattern (same as stateBroadcaster) — all I/O injectable, no require mocking needed
  - POLL_INTERVAL_MS constant used in while-loop but sleepFn is injected so tests run near-instantly at 100ms timeout
  - Proxy timeout extended from 10s to 40s for pause-session route to accommodate ~30s graceful shutdown window
  - pause-session route: removed isTmuxSessionActive check (gracefulShutdown handles session-already-inactive case internally)
metrics:
  duration: "15min"
  completed: "2026-04-15"
  tasks_completed: 3
  files_created: 6
  files_modified: 2
---

# Phase 48 Plan 01: Graceful Shutdown Primitive + Wave 0 Test Stubs Summary

**One-liner:** gracefulShutdown(sessionName, projectName) sends /gsd:pause-work, polls 30s for completion markers, kills tmux session, and notifies Telegram — with full DI injectable test variant.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — Create failing test stubs for all Phase 48 behaviors | 06ad133 | 5 new test files |
| 2 | Implement gracefulShutdown primitive + PROXY_PREFIXES update | e7b4a55 | gracefulShutdown.js, proxy.js |
| 3 | Refactor pause-session route to use gracefulShutdown | d8a343d | gsd.js |

## What Was Built

### server/gsd/gracefulShutdown.js

Shared graceful-shutdown primitive with two exports:

- `gracefulShutdown(sessionName, projectName, opts?)` — production entry point
- `_testGracefulShutdown(sessionName, projectName, opts, fns)` — DI injectable variant for tests

**Flow:**
1. Check if session is active (return early if not)
2. Send `/gsd:pause-work` via tmux send-keys
3. Poll capture-pane every 1s for up to 30s for markers: `/wip:/i`, `/Handoff created/i`, `/commit [a-f0-9]{7}/i`
4. If marker found: grace buffer sleep, kill session, Telegram "handoff saved" notification → `{ok:true, pauseWorkCompleted:true}`
5. If timeout: kill session, Telegram "timed out" notification → `{ok:true, pauseWorkCompleted:false}`

### server/routes/proxy.js

Added `'/api/gsd'` to `PROXY_PREFIXES` array. This ensures Railway tunnel forwards all `/api/gsd/*` requests to the local machine, covering Phase 48's new `/api/gsd/projects/:name/tmux-cost` route and the refactored pause-session route.

### server/routes/gsd.js

Refactored `POST /api/gsd/projects/:name/pause-session`:
- Route is now `async`
- Imports and calls `gracefulShutdown(tmux_session, name)` instead of direct `execFileSync kill-session`
- Response shape is `{ok:true, pauseWorkCompleted:boolean}` (additive — backward compatible)
- Proxy delegation timeout extended from 10s to 40s

### Test Stubs (Wave 0)

Five test stub files created in RED state at creation time:
- `graceful-shutdown.test.js` — 5 tests, all GREEN after Task 2 implementation
- `idle-detector.test.js` — 5 tests, RED (MODULE_NOT_FOUND — idleDetector.js owned by Plan 03)
- `tmux-cost.test.js` — 3 tests (costMeasurement.js was already created by Plan 02, so GREEN)
- `pause-route.test.js` — 1 structural test, GREEN after Task 3
- `proxy-prefixes.test.js` — 1 test, GREEN after Task 2

## Verification Results

```
✔ graceful.shutdown: sends /gsd:pause-work into pane then kills session
✔ graceful.shutdown: on pause-work timeout, kills session anyway + notifies Telegram
✔ graceful.fallback: sends Telegram notification with failure message on timeout
✔ graceful.shutdown: returns {ok:true, pauseWorkCompleted:true} on marker found
✔ graceful.shutdown: returns {ok:true, pauseWorkCompleted:false} on timeout
✔ pause.route: POST /pause-session calls gracefulShutdown not direct tmux kill
✔ proxy.prefix: /api/gsd is listed in PROXY_PREFIXES
✖ idle-detector.test.js — RED (correct: idleDetector.js not yet created, Plan 03 owns it)
```

## Deviations from Plan

None — plan executed exactly as written.

**Note:** tmux-cost.test.js tests were GREEN (not RED) at creation time because `costMeasurement.js` was already created as part of Plan 02 execution. This is a sequencing artifact — not a deviation.

## Self-Check: PASSED

Files exist:
- server/gsd/gracefulShutdown.js: FOUND
- server/__tests__/graceful-shutdown.test.js: FOUND
- server/__tests__/idle-detector.test.js: FOUND
- server/__tests__/tmux-cost.test.js: FOUND
- server/__tests__/pause-route.test.js: FOUND
- server/__tests__/proxy-prefixes.test.js: FOUND

Commits exist:
- 06ad133: FOUND (test stubs)
- e7b4a55: FOUND (gracefulShutdown + proxy)
- d8a343d: FOUND (pause-session route refactor)
