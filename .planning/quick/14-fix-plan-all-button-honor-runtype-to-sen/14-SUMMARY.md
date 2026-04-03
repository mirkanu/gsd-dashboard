---
phase: quick-14
plan: "01"
subsystem: autopilot
tags: [autopilot, runType, plan-all, bug-fix]
dependency_graph:
  requires: []
  provides: [runType-aware GSD command selection in AutopilotManager]
  affects: [server/autopilot/AutopilotManager.js]
tech_stack:
  added: []
  patterns: [_gsdCommand() helper for runType dispatch]
key_files:
  created: []
  modified:
    - server/autopilot/AutopilotManager.js
    - server/__tests__/autopilotManager.test.js
decisions:
  - "_gsdCommand() helper centralizes runType→command mapping; all three spawn sites use it to avoid duplication"
  - "_runType initialized to 'execute' in constructor so default behavior is unchanged without opts.runType"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-03"
  tasks_completed: 1
  files_modified: 2
---

# Quick Task 14: Fix Plan All Button — Honor runType to Send /gsd:plan-phase

## One-liner

AutopilotManager now stores `_runType` from `opts.runType` and uses `_gsdCommand()` helper to route `plan-all` runs to `/gsd:plan-phase` and all other runs to `/gsd:execute-phase` across all three spawn sites.

## What was built

The Plan All button in the UI passes `runType: 'plan-all'` to `AutopilotManager.start()`, but the manager previously ignored this option and always spawned `/gsd:execute-phase N`. This fix stores the runType and dispatches the correct GSD command everywhere it is needed.

### Changes

**`server/autopilot/AutopilotManager.js`**
- Added `this._runType = 'execute'` initialization in constructor
- Added `this._runType = opts.runType || 'execute'` in `start()`
- Added `_gsdCommand()` private helper:
  ```js
  _gsdCommand() {
    return this._runType === 'plan-all' ? '/gsd:plan-phase' : '/gsd:execute-phase';
  }
  ```
- Updated `_requestConfirmation(phaseNum)` — `pendingCommand` now uses `${this._gsdCommand()} ${phaseNum}`
- Updated `_doSpawn(phaseNum)` — `spawnFn` call now uses `this._gsdCommand()`
- Updated `_handlePhaseFailure(phaseNum, reason)` retry call — now uses `this._gsdCommand()`

**`server/__tests__/autopilotManager.test.js`**
- Added test: "runType='plan-all' calls spawnFn with /gsd:plan-phase and broadcasts correct pendingCommand"
  - Verifies `capturedCmd === '/gsd:plan-phase'` after `confirmSpawn()`
  - Verifies `confirmCall.data.pendingCommand === '/gsd:plan-phase 2'`

## Verification

- TDD RED: new test failed before implementation (spawnFn received `/gsd:execute-phase`, pendingCommand wrong)
- TDD GREEN: all 7 AutopilotManager tests pass after implementation
- Full suite: 152/153 pass; 1 pre-existing failure in `readProjectMeta` (unrelated to this change, confirmed present before)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `server/autopilot/AutopilotManager.js` modified with `_runType`, `_gsdCommand()`, and three site updates
- [x] `server/__tests__/autopilotManager.test.js` has new plan-all test
- [x] Commit `44a0136` exists
- [x] All 7 AutopilotManager tests pass
- [x] Pre-existing `readProjectMeta` failure confirmed pre-existing (not introduced by this change)

## Self-Check: PASSED
