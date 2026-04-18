---
phase: 49-idle-detector-busy-work-awareness-prevent-auto-close-of-clau
plan: 02
subsystem: idle-detector/busy-marker-integration
tags: [idle-detector, busy-markers, audit-log, jsonl, fns-injection]
requires:
  - busyMarkers.hasBusyMarkers
  - busyMarkers.getMarkers
provides:
  - idleDetector._testCheckAndCloseSession skip branch (busy-markers-present)
  - data/logs/idle-skip.log JSONL audit trail
  - idleDetector._testAppendSkipLog (exported)
  - idleDetector.IDLE_SKIP_LOG_PATH (exported)
affects:
  - server/gsd/idleDetector.js
  - server/__tests__/idle-detector.test.js
tech_stack:
  added: []
  patterns: [fns-injection, append-only-jsonl, fail-safe-audit-io, surgical-edit]
key_files:
  created: []
  modified:
    - server/gsd/idleDetector.js
    - server/__tests__/idle-detector.test.js
decisions:
  - Skip check placed AFTER idle threshold check, BEFORE gracefulShutdownFn call
  - Skip return shape: {action:'skipped', reason:'busy-markers-present', project, markers}
  - JSONL schema: {ts, session, project, reason, markers:{count,kinds}}
  - Three new injectable fns (hasBusyMarkersFn/getBusyMarkersFn/logSkipFn) for hermetic tests
  - Audit log writes are fail-safe (swallow all errors) so a broken disk never breaks idle detector
  - Force-kill 6h path unchanged, thresholdMs===0 short-circuit unchanged, autopilot 2x unchanged
metrics:
  duration_minutes: 12
  completed_date: 2026-04-18
  tasks_completed: 2
  tests_added: 5
---

# Phase 49 Plan 02: Idle Detector Busy-Marker Integration — Summary

Wires `busyMarkers.hasBusyMarkers` into `idleDetector._testCheckAndCloseSession`
so sessions waiting on in-flight background work (`bash_bg`, `agent`, `wakeup`)
are not auto-closed. Every skip decision is recorded as a JSONL line to
`data/logs/idle-skip.log` for audit.

## What Was Built

### `server/gsd/idleDetector.js` (modified)

New imports at top of module:
```js
const fs = require('fs');
const path = require('path');
const busyMarkers = require('./busyMarkers');
```

New module-level helpers:
```js
const IDLE_SKIP_LOG_PATH = path.resolve(__dirname, '../../data/logs/idle-skip.log');

function _testAppendSkipLog(entry) {
  try {
    fs.mkdirSync(path.dirname(IDLE_SKIP_LOG_PATH), { recursive: true });
    fs.appendFileSync(IDLE_SKIP_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch { /* never let audit logging break the idle detector */ }
}
```

`_testCheckAndCloseSession` `fns` destructure extended with:
- `hasBusyMarkersFn = busyMarkers.hasBusyMarkers`
- `getBusyMarkersFn = busyMarkers.getMarkers`
- `logSkipFn = _testAppendSkipLog`

Skip branch inserted between the idle check and the graceful-shutdown call:
```js
if (hasBusyMarkersFn(project.tmux_session)) {
  const markers = getBusyMarkersFn(project.tmux_session);
  logSkipFn({
    ts: new Date(nowMs).toISOString(),
    session: project.tmux_session,
    project: project.name,
    reason: 'busy-markers-present',
    markers,
  });
  return { action: 'skipped', reason: 'busy-markers-present', project: project.name, markers };
}
```

Module exports extended with `_testAppendSkipLog` and `IDLE_SKIP_LOG_PATH`.

Preserved byte-for-byte:
- `thresholdMs === 0` auto-close-disabled short-circuit
- Force-kill path for `working` pane stuck > 6h (and its cost-logging side effects)
- Autopilot 2× threshold multiplier
- All existing fns injection keys (detectFn, paneCache, nowMs, gracefulShutdownFn,
  forceKillFn, getCostFn, logCostFn, isAutopilotFn, getThresholdFn)

### `server/__tests__/idle-detector.test.js` (extended)

Added `_testCheckAndCloseSession` to the destructured import and appended 5 new
tests under a "Plan 49-02: busy-marker awareness" section. All tests use a
shared `_makeBusyFns` helper that seeds `paneCache` (`lastChangedAt`) so the
internal idle check returns true without monkey-patching real tmux/pane code.

Test matrix:

| Test | Scenario | Asserts |
|------|----------|---------|
| 1 | waiting + idle + markers present | result={action:'skipped',...}; skipLog has 1 entry with valid ISO ts; gracefulShutdownFn/forceKillFn guarded with throwing stubs |
| 2 | waiting + idle + markers absent | action='graceful-shutdown'; skipLog empty |
| 3 | pane-working stuck 6h + markers present | action='force-killed', reason='stuck-working-6h'; skipLog empty |
| 4 | expired markers purged (hasBusyMarkers→false) | action='graceful-shutdown' (the purge-on-read semantic of Plan 01) |
| 5 | skip-log JSONL schema | Object.keys sorted = ['markers','project','reason','session','ts']; markers keys = ['count','kinds'] |

## Tests

**22/22 relevant tests pass** (5 existing idle-detector + 5 new busy-marker
coverage + 12 unchanged busy-marker unit tests from Plan 01):

```bash
npx node --test server/__tests__/idle-detector.test.js
# 10 pass, 0 fail
npx node --test server/__tests__/busy-markers.test.js server/__tests__/idle-detector.test.js
# 22 pass, 0 fail
```

## Deviations from Plan

None — plan executed as written. All acceptance criteria satisfied.

### grep-based acceptance checks

| Check | Required | Actual |
|-------|----------|--------|
| `require.*busyMarkers` in idleDetector.js | ≥1 | 1 |
| `hasBusyMarkersFn` in idleDetector.js | ≥2 | 2 |
| `busy-markers-present` in idleDetector.js | ≥2 | 2 |
| `idle-skip.log` in idleDetector.js | ≥1 | 2 |
| `_testAppendSkipLog` in idleDetector.js | ≥2 | 3 (def + call + export) |
| `gracefulShutdownFn` in idleDetector.js | ≥2 | 4 |
| `forceKillFn` in idleDetector.js | ≥2 | 2 |
| `idle.busy-markers` in test file | ≥5 | 5 |
| `busy-markers-present` in test file | ≥2 | 2 |
| `should not be called` in test file | ≥2 | 3 |

## Commits

- `0224efa` — `feat(49-02): add busy-marker skip branch + JSONL audit log to idle detector`
- `ea3acdd` — `test(49-02): cover busy-marker skip path in idle-detector tests`

## Deferred Issues

Full `npm run test:server` still has the same pre-existing failures logged
during Plan 49-01 in `deferred-items.md` and unchanged by this plan:

- `app-settings-route.test.js:151` — DB state leak from Phase 48
- `autopilotManager.test.js` — promise/event-loop leak (pre-existing)
- `tmux.test.js:136` — STAT-02 heuristic regression from Phase 43

These failures are NOT caused by Plan 49-02 edits. All plan-scoped tests
(`idle-detector.test.js`, `busy-markers.test.js`) are green.

## Downstream Contract (for Plan 03)

Plan 03 (UI surface) reads `busyMarkers.getMarkers(tmux_session)` in
`stateBroadcaster.js` and threads `busy_markers: { count, kinds }` into the
projects WS message. The JSONL audit log at `data/logs/idle-skip.log` is
available for retrospective analysis should false positives surface.

## Self-Check: PASSED

- server/gsd/idleDetector.js — MODIFIED (imports, skip branch, exports)
- server/__tests__/idle-detector.test.js — MODIFIED (+5 tests)
- Commit 0224efa — FOUND in git log
- Commit ea3acdd — FOUND in git log
- 22/22 targeted tests pass
- IDLE_SKIP_LOG_PATH resolves correctly: `data/logs/idle-skip.log`
- Module loads cleanly: `typeof m._testAppendSkipLog === 'function'` ✓
