---
phase: 24-waiting-accuracy-safety-foundation
plan: 02
subsystem: database
tags: [sqlite, circuit-breaker, process-spawner, autopilot, better-sqlite3, uuid, tmux]

# Dependency graph
requires:
  - phase: 24-waiting-accuracy-safety-foundation/24-01
    provides: "Phase 24 base (accuracy detection) — sets up test infrastructure and server/autopilot directory context"
provides:
  - "Four new SQLite tables: autopilot_runs, process_registry, claude_api_usage, external_service_costs"
  - "CircuitBreaker class: persistent failure counting with isOpen/recordFailure/reset"
  - "processSpawner module: non-blocking spawnGsdCommand via tmux send-keys with process_registry tracking"
  - "Migration guard pattern for all four tables (safe on existing databases)"
  - "Startup stale-process cleanup for process_registry entries"
affects:
  - "25-autopilot-core (depends on all four tables and both modules)"
  - "26-cost-intelligence (depends on claude_api_usage and external_service_costs schema)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CircuitBreaker accepts optional db parameter for test isolation (no module mocking needed)"
    - "processSpawner accepts optional spawnFn and db for unit testing without real tmux"
    - "Migration guard: try SELECT LIMIT 1 → catch → db.exec CREATE TABLE IF NOT EXISTS"
    - "process_registry INSERT before spawn: record always exists even if process crashes immediately"

key-files:
  created:
    - server/autopilot/CircuitBreaker.js
    - server/autopilot/processSpawner.js
    - server/__tests__/circuitBreaker.test.js
    - server/__tests__/processSpawner.test.js
  modified:
    - server/db.js

key-decisions:
  - "CircuitBreaker uses injected db param (not process.env.DASHBOARD_DB_PATH) for test isolation — cleaner than module mocking"
  - "processSpawner inserts process_registry record BEFORE spawning tmux — guarantees record exists even on immediate crash"
  - "process_registry startup cleanup (exit_code=-1 for orphaned entries) wrapped in try/catch — tables may not exist on very first boot"
  - "Autopilot prepared statements in db.js wrapped in try/catch — guard against migration-not-yet-run edge case"
  - "uuid package was already present (v11.1.0) — no install needed"

patterns-established:
  - "TDD with in-memory SQLite: create test db manually, inject via constructor — avoids test pollution of real dashboard.db"
  - "server/autopilot/ directory established as home for all autopilot backend modules"

requirements-completed: [AUTO-05]

# Metrics
duration: 6min
completed: 2026-04-01
---

# Phase 24 Plan 02: SQLite Safety Schema + CircuitBreaker + ProcessSpawner Summary

**SQLite autopilot schema (4 tables) with persistent CircuitBreaker (halts run after 3 failures) and non-blocking processSpawner (tmux send-keys with process_registry), all covered by 8 new unit tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T08:41:49Z
- **Completed:** 2026-04-01T08:47:38Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Four new SQLite tables (autopilot_runs, process_registry, claude_api_usage, external_service_costs) added via migration-safe guard — no destructive changes to existing data
- CircuitBreaker class persists failure_count in SQLite across server restarts; opens at 3 consecutive failures (AUTO-05)
- processSpawner.spawnGsdCommand() inserts process_registry record before spawning, returns jobId immediately without blocking Express
- 8 new unit tests with full test isolation via in-memory SQLite injection — all GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests (RED phase)** - `381b9b4` (test)
2. **Task 2: Add autopilot migrations to db.js** - `905a55c` (feat)
3. **Task 3: Implement CircuitBreaker and processSpawner (GREEN phase)** - `63b7cd8` (feat)

_Note: TDD plan — RED commit (tests) then GREEN commit (implementation)_

## Files Created/Modified
- `server/__tests__/circuitBreaker.test.js` - 5 unit tests for CircuitBreaker (isOpen, recordFailure threshold, reset)
- `server/__tests__/processSpawner.test.js` - 3 unit tests for spawnGsdCommand (registry insert, jobId type, args/runId persistence)
- `server/db.js` - Migration guard for 4 autopilot tables + startup cleanup + 7 autopilot prepared statements
- `server/autopilot/CircuitBreaker.js` - CircuitBreaker class with recordFailure/isOpen/reset backed by SQLite
- `server/autopilot/processSpawner.js` - spawnGsdCommand() using tmux send-keys, detached from Express

## Decisions Made
- CircuitBreaker accepts optional `db` parameter for test isolation rather than relying on process.env or module mocking — cleaner and more portable
- processSpawner inserts process_registry record BEFORE spawning to guarantee record existence even on immediate crash
- Startup stale-process cleanup wrapped in try/catch because process_registry table won't exist on very first boot before migration runs

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Pre-existing failing test in api.test.js (`returns version and liveUrl for a project with PROJECT.md`) was already failing before this plan — out of scope, not caused by our changes

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All Phase 25 (Autopilot Core) database prerequisites are satisfied: autopilot_runs, process_registry tables exist
- Phase 26 (Cost Intelligence) schema prerequisites satisfied: claude_api_usage, external_service_costs tables exist
- CircuitBreaker is ready to import in Phase 25 autopilot loop
- processSpawner is ready to import in Phase 25 orchestrator

---
*Phase: 24-waiting-accuracy-safety-foundation*
*Completed: 2026-04-01*

## Self-Check: PASSED

- FOUND: server/__tests__/circuitBreaker.test.js
- FOUND: server/__tests__/processSpawner.test.js
- FOUND: server/autopilot/CircuitBreaker.js
- FOUND: server/autopilot/processSpawner.js
- FOUND: .planning/phases/24-waiting-accuracy-safety-foundation/24-02-SUMMARY.md
- FOUND commit: 381b9b4 (test RED phase)
- FOUND commit: 905a55c (feat db migrations)
- FOUND commit: 63b7cd8 (feat implementation GREEN)
