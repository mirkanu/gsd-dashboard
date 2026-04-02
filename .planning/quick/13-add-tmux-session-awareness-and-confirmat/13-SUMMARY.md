---
phase: quick-13
plan: 01
subsystem: autopilot
tags: [autopilot, confirmation, ux, safety]
dependency_graph:
  requires: [AutopilotManager, processSpawner, autopilot routes, client autopilot UI]
  provides: [pending_confirmation flow, queue status, queue_timeout handling, POST /api/autopilot/confirm]
  affects: [AutopilotManager._tick, AutopilotManager._spawnPhase, client AutopilotControls]
tech_stack:
  added: []
  patterns: [confirmation gate before spawn, 5-min queue timeout via waitTimeoutMs option]
key_files:
  created: []
  modified:
    - server/autopilot/AutopilotManager.js
    - server/autopilot/processSpawner.js
    - server/routes/autopilot.js
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/pages/GSD.tsx
    - server/__tests__/autopilotManager.test.js
    - server/__tests__/autopilotRoutes.test.js
decisions:
  - "Confirmation gate replaces direct spawn: _spawnPhase() now calls _requestConfirmation() instead of directly calling _doSpawn(). This ensures every phase spawn requires explicit user approval."
  - "5-minute queue timeout passed via waitTimeoutMs option to processSpawner, replacing hardcoded 15s default for confirmed spawns. Default 15s preserved for retry spawns."
  - "queue_timeout broadcasts via catch handler in _doSpawn(); triggers _handlePhaseFailure() to allow retry logic. Non-timeout spawn errors reset _phaseSpawned=false to allow re-confirmation."
  - "AutopilotControls subscribes directly to eventBus to capture pendingCommand from WS — consistent with existing eventBus pattern in the parent GSD page."
  - "pending_confirmation/queued/queue_timeout statuses are passed through as-is in the parent GSD page's autopilot_progress handler; planning/executing/started/retrying all map to 'running'."
metrics:
  duration: "~30 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 8
---

# Quick Task 13: Add tmux session awareness and confirmation flow

**One-liner:** User confirmation gate before each autopilot phase spawn, with pending_confirmation UI, 5-minute session queue, and queue_timeout handling.

## What Was Built

### Backend (Task 1)

**AutopilotManager changes:**
- Added `_pendingConfirmation` and `_pendingCommand` instance flags
- `_spawnPhase()` now calls `_requestConfirmation(phaseNum)` instead of directly spawning
- `_requestConfirmation()` sets `_pendingConfirmation = true`, stores the phase, and broadcasts `autopilot_progress` with `status: 'pending_confirmation'` and `pendingCommand: '/gsd:execute-phase N'`
- `_tick()` returns early when `_pendingConfirmation` is true (blocks the poll loop)
- `confirmSpawn()` public method: clears confirmation state, broadcasts `queued` status, calls `_doSpawn(phaseNum)`
- `_doSpawn()` handles the actual spawn with `waitTimeoutMs: 300000` (5 minutes). On timeout errors, broadcasts `queue_timeout` and calls `_handlePhaseFailure()`. On other errors, resets `_phaseSpawned` for re-confirmation.
- Pending state reset in: `stop()`, `_halt()`, `resume()`, `_onPhaseCompleted()`

**processSpawner changes:**
- Added `waitTimeoutMs` option (default `15000`). `confirmSpawn()` passes `300000` (5 min).

**Route changes:**
- Added `POST /api/autopilot/confirm` endpoint that looks up the run registry and calls `manager.confirmSpawn()`
- Proxy-aware: forwards to `GSD_DATA_URL` when set

### Client (Task 2)

**types.ts:**
- `AutopilotRunStatus` extended with `'pending_confirmation' | 'queued' | 'queue_timeout'`
- `AutopilotProgressEvent.status` extended with full set: `started | retrying | pending_confirmation | queued | queue_timeout`
- `AutopilotProgressEvent.pendingCommand?: string` added

**api.ts:**
- `api.autopilot.confirm(projectName)` added — `POST /autopilot/confirm`

**GSD.tsx — AutopilotControls:**
- Added `pendingCommand` state
- `useEffect` subscribes to `eventBus` for `autopilot_progress` to capture `pendingCommand` from WS events
- `handleConfirm` handler calls `api.autopilot.confirm()`
- `handleCancel` handler calls `api.autopilot.pause()` (reuses existing pause mechanism)
- When `status === 'pending_confirmation'`: shows command preview + Confirm/Cancel buttons
- When `status === 'queued'`: shows Pause button + "Queued — waiting for idle…" indicator
- When `status === 'queue_timeout'`: shows Run Autopilot/Plan All buttons + red timeout label
- `queue_timeout` added to the `idle/completed/failed` condition group for Plan All and Run Autopilot buttons

**GSD.tsx — parent autopilot_progress handler:**
- Updated status mapping: `completed/halted/failed/queue_timeout/pending_confirmation/queued` pass through as-is; `planning/executing/started/retrying` map to `'running'`

## Deviations from Plan

None — plan executed exactly as written.

## Tests Updated

- `server/__tests__/autopilotManager.test.js`: Tests 4, 5, and 6 updated to call `manager.confirmSpawn()` after the pending_confirmation state is broadcast, allowing the spawn flow to proceed. Test 6 status assertion expanded to include all valid statuses.
- `server/__tests__/autopilotRoutes.test.js`: Added `confirmSpawn()` to `makeFakeManager`. Added `describe('POST /api/autopilot/confirm')` suite with 3 tests (400/404/200).

## Self-Check: PASSED

All key files confirmed present. Both task commits verified:
- `293ff6d`: feat(quick-13): add confirmation flow to AutopilotManager + confirm route
- `cf6a13d`: feat(quick-13): add client types, api.autopilot.confirm, and confirmation UI
