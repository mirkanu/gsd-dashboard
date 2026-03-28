---
phase: 18-task-ui
plan: 01
subsystem: ui
tags: [typescript, react, api-client, types]

# Dependency graph
requires:
  - phase: 17-task-data-layer
    provides: "Task REST endpoints (GET/POST/PATCH /api/gsd/projects/:key/tasks)"
provides:
  - "GsdTask TypeScript interface in client/src/lib/types.ts"
  - "api.gsd.tasks namespace with list/create/update methods in client/src/lib/api.ts"
affects:
  - 18-task-ui (Plan 02 TasksTab component consumes these contracts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-safe API client namespace — tasks nested under api.gsd parallel to messages, matching existing pattern"
    - "TDD for type/API contracts — failing tests written first, then implementation"

key-files:
  created:
    - client/src/lib/__tests__/gsdTask.test.ts
  modified:
    - client/src/lib/types.ts
    - client/src/lib/api.ts

key-decisions:
  - "GsdTask.archived typed as 0 | 1 (not boolean) matching SQLite INTEGER storage and server response shape"
  - "Import GsdTask at top of api.ts (not inline import) for cleaner tasks namespace"
  - "tasks.list defaults archived=false — active tasks returned by default"

patterns-established:
  - "Pattern 1: Nested API namespace — add tasks under api.gsd to mirror server router hierarchy"
  - "Pattern 2: TDD for contracts — test type shapes first, implement second"

requirements-completed: [UI-01, UI-02, UI-03, UI-04, UI-05]

# Metrics
duration: 9min
completed: 2026-03-28
---

# Phase 18 Plan 01: Task UI Types and API Client Summary

**GsdTask TypeScript interface and api.gsd.tasks namespace (list/create/update) establishing type-safe contracts for the TasksTab component**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-28T22:02:00Z
- **Completed:** 2026-03-28T22:11:23Z
- **Tasks:** 1 (TDD: 2 commits — test then implementation)
- **Files modified:** 4

## Accomplishments
- GsdTask interface exported from types.ts with all 6 fields matching DB schema
- api.gsd.tasks.list, .create, .update methods wired to correct REST endpoints
- 9 new tests all passing; no new TypeScript errors introduced

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests for GsdTask type and api.gsd.tasks methods** - `529c984` (test)
2. **Task 1 GREEN: Add GsdTask type and api.gsd.tasks namespace** - `c7e56f2` (feat)

**Plan metadata:** (see final commit)

_Note: TDD tasks have two commits (test → feat)_

## Files Created/Modified
- `client/src/lib/types.ts` - Added GsdTask interface after GsdMessage
- `client/src/lib/api.ts` - Added GsdTask import and tasks namespace in api.gsd
- `client/src/lib/__tests__/gsdTask.test.ts` - New: 9 tests covering type shape and all 3 API methods

## Decisions Made
- Used `archived: 0 | 1` not `archived: boolean` — SQLite returns integers, server passes them through as-is
- Added `GsdTask` to top-level import in api.ts (not inline like `import("./types").GsdMessage`) since tasks namespace uses it multiple times
- `tasks.list` defaults `archived = false` so callers get active tasks without specifying the flag

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed corrupted client node_modules blocking test runner**
- **Found during:** Task 1 RED (test verification)
- **Issue:** `magic-string.es.mjs` and `@jridgewell/sourcemap-codec/dist/sourcemap-codec.mjs` were empty/missing files in node_modules, causing vitest startup errors
- **Fix:** Deleted and reinstalled client/node_modules via `npm install`
- **Files modified:** client/package-lock.json (lock file refreshed)
- **Verification:** vitest runs successfully after reinstall; 101 tests execute
- **Committed in:** c7e56f2 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Node_modules fix was required to verify the implementation. No scope creep.

## Issues Encountered
- Corrupted node_modules (empty ESM files) prevented test runner from starting — resolved by full reinstall

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GsdTask type and api.gsd.tasks available for Plan 02 (TasksTab component)
- All contracts match the backend endpoints from Phase 17
- No blockers

---
*Phase: 18-task-ui*
*Completed: 2026-03-28*
