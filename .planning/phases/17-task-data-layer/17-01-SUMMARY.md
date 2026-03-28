---
phase: 17-task-data-layer
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, express, rest-api]

# Dependency graph
requires: []
provides:
  - project_tasks SQLite table with AUTOINCREMENT id, project_key, title, description (nullable), archived (INTEGER), created_at
  - idx_project_tasks_key index on (project_key, archived)
  - insertTask, getTask, listTasks, updateTask prepared statements in server/db.js
  - POST /api/gsd/projects/:key/tasks — create task endpoint
  - GET /api/gsd/projects/:key/tasks — list tasks endpoint (?archived=true filter)
  - PATCH /api/gsd/projects/:key/tasks/:id — update task endpoint
affects: [18-task-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "COALESCE(?, column) in UPDATE statement for partial patch without CASE WHEN"
    - "RETURNING * with .get() for INSERT/UPDATE to get the affected row back in one call"
    - "INTEGER 0/1 for boolean archived flag (SQLite has no BOOLEAN type)"

key-files:
  created: []
  modified:
    - server/db.js
    - server/routes/gsd.js

key-decisions:
  - "Tasks are local-only (stored in local SQLite, no GSD_DATA_URL proxy) — Phase 18 UI can call these endpoints directly"
  - "COALESCE pattern in updateTask allows partial patches: pass null to keep existing value, pass value to update"
  - "archived stored as INTEGER (0/1) not BOOLEAN — consistent with SQLite conventions"

patterns-established:
  - "RETURNING * with .get() for INSERT/UPDATE to return affected row without a follow-up SELECT"
  - "CREATE TABLE IF NOT EXISTS is the migration strategy for new tables — safe on redeploy, no guard needed"

requirements-completed: [STORE-01, STORE-02, STORE-03, STORE-04]

# Metrics
duration: 10min
completed: 2026-03-28
---

# Phase 17 Plan 01: Task Data Layer Summary

**project_tasks SQLite table + CRUD prepared statements + three REST endpoints (POST/GET/PATCH) for per-project task management**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-28T20:30:00Z
- **Completed:** 2026-03-28T20:40:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `project_tasks` table to SQLite schema with AUTOINCREMENT id, project_key, title, description (nullable), archived (INTEGER 0/1), and created_at timestamp
- Added composite index `idx_project_tasks_key` on `(project_key, archived)` for efficient per-project task listing
- Added four prepared statements (`insertTask`, `getTask`, `listTasks`, `updateTask`) using `RETURNING *` for zero-round-trip inserts/updates
- Added three task routes to `server/routes/gsd.js`: POST (create), GET (list with archived filter), PATCH (partial update with COALESCE pattern)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add project_tasks table and prepared statements to db.js** - `a1f9bfd` (feat)
2. **Task 2: Add POST, GET, PATCH task routes to gsd.js** - `998ae57` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/db.js` - Added project_tasks table DDL + index inside existing db.exec block; added 4 prepared statements to stmts object
- `server/routes/gsd.js` - Added POST /projects/:key/tasks, GET /projects/:key/tasks, PATCH /projects/:key/tasks/:id before module.exports

## Decisions Made
- Tasks are local-only — no GSD_DATA_URL proxy needed because tasks live in the local SQLite DB, not on a remote. Phase 18 UI calls these endpoints directly.
- Used `COALESCE(?, column)` in UPDATE to support partial patches cleanly. Callers pass `null` to keep the existing value.
- `archived` is stored as INTEGER (0/1) — consistent with SQLite's typeless system and existing conventions in the codebase.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Three pre-existing test failures (unrelated to this plan) were observed in `npm run test:server`:
- `readProjectMeta` — returns null version for gsddashboard's PROJECT.md in test environment
- `resolveFile` — plan resolution returns null in test environment
- `GET /api/gsd/projects/:name/files/:fileId` — returns 404 for 'plan' in test environment

These failures existed before this plan's changes and are out of scope. All 97 other tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `project_tasks` table and all three task endpoints are live and tested
- Phase 18 (Task UI) can build on `POST /api/gsd/projects/:key/tasks`, `GET /api/gsd/projects/:key/tasks`, and `PATCH /api/gsd/projects/:key/tasks/:id`
- No blockers

## Self-Check: PASSED

- FOUND: server/db.js
- FOUND: server/routes/gsd.js
- FOUND: .planning/phases/17-task-data-layer/17-01-SUMMARY.md
- FOUND commit: a1f9bfd (feat: db.js schema + stmts)
- FOUND commit: 998ae57 (feat: gsd.js routes)

---
*Phase: 17-task-data-layer*
*Completed: 2026-03-28*
