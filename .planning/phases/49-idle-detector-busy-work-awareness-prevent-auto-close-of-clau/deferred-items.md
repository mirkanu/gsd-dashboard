# Phase 49 Deferred Items

Issues discovered during Plan 49-01 execution that are out of scope (pre-existing,
unrelated to busy-marker subsystem).

## Pre-existing test failures in `npm run test:server` (not caused by Plan 49-01)

Observed during Plan 49-01's full-suite regression check on 2026-04-18.

- `server/__tests__/app-settings-route.test.js:151` — expects `keys: []` but
  shared DB has `railway_ram_rate_monthly` persisted from Phase 48; test is not
  isolating its DB state. Introduced by Phase 48 Plan 04, not by Plan 49-01.
- `server/__tests__/autopilotManager.test.js:275` —
  `autopilot.manager: runType='plan-all' calls spawnFn with /gsd-plan-phase and
  broadcasts correct pendingCommand` asserts `pending_confirmation must be
  broadcast`; observed actual `undefined`. Unrelated to busy markers.
- `server/__tests__/autopilotManager.test.js:1` — top-level "Promise resolution
  is still pending but the event loop has already resolved" — autopilot test
  leaking open handles. Pre-existing.
- `server/__tests__/tmux.test.js:136` — `STAT-02 heuristic: hash same and last
  change > 3s ago → null (stale, fall through)` expects `null`, got
  `'working'`. Phase 43 heuristic regression, unrelated to Plan 49-01.

All Plan 49-01 tests pass (25/25: 12 busy-markers + 8 hook smoke + 5 idle-detector
unchanged).
