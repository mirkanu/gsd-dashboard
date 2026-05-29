---
phase: 59-task-backend-migration-basic-issue-gui-wrapper
plan: "01"
subsystem: backend
tags: [task-migration, types, tdd, github-issues]
dependency_graph:
  requires: []
  provides: [GsdProject-task-backend-fields, taskMigration-service, migration-test-scaffold]
  affects: [client/src/lib/types.ts, server/gsd/taskMigration.js, server/__tests__/task-migration.test.js]
tech_stack:
  added: []
  patterns: [node:test-scaffold, better-sqlite3-prepared-statements, execFileAsync-with-env-injection]
key_files:
  created:
    - server/gsd/taskMigration.js
    - server/__tests__/task-migration.test.js
  modified:
    - client/src/lib/types.ts
decisions:
  - "GH_TOKEN passed as env var to execFileAsync — never in CLI args list (T-59-01)"
  - "extractRepoFromUrl anchored to github.com with /i flag — rejects non-GitHub URLs (T-59-03)"
  - "Snapshot path derived from server-side gsd-projects.json project.root — not user input (T-59-02)"
  - "restoreSnapshot does NOT delete existing tasks before insert — caller responsibility"
  - "Route tests are intentionally RED (Wave 0 scaffold); routes implemented in Plan 02"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-29T07:15:33Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 59 Plan 01: Type Contracts + taskMigration Service Summary

GsdProject extended with task_backend/github_repo/taskMigratedAt fields; new taskMigration.js service with 5 exports; Wave 0 test scaffold with 13 cases (9 GREEN, 4 RED pending Plan 02 routes).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend GsdProject type + create taskMigration.js service | 9080f1d | client/src/lib/types.ts, server/gsd/taskMigration.js |
| 2 | Create test scaffold (Wave 0) for all migration surface area | cd1b872 | server/__tests__/task-migration.test.js |

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

Unit tests (9 cases): all GREEN
- extractRepoFromUrl: 4/4 pass
- createSnapshot: 2/2 pass
- restoreSnapshot: 2/2 pass
- POST /migrate 404-unknown: 1/1 pass (Express returns 404 for unregistered routes — coincidentally correct)

Route tests (4 cases): RED by design — routes not yet implemented
- POST /migrate 422 (D-12 guard): RED
- POST /migrate 409 (already migrated): RED
- POST /rollback 400 (not on github backend): RED
- POST /rollback 410 (expired window): RED

Pre-existing test failures (11 in main suite, ~15 in worktree) are baseline — unrelated to this plan.

## Threat Surface Scan

No new network endpoints introduced in this plan. T-59-01, T-59-02, T-59-03 mitigations all implemented in taskMigration.js as specified in the threat model.

| Mitigation | Location | Implementation |
|------------|----------|----------------|
| T-59-01: PAT via env | exportTasks() | `env: { ...process.env, GH_TOKEN: githubPat }` — never in args |
| T-59-02: Snapshot path | createSnapshot() | `path.join(project.root, filename)` from server config |
| T-59-03: URL validation | extractRepoFromUrl() | Regex anchored to `github.com` with `/i` flag |

## Known Stubs

None. This plan establishes contracts only; no UI rendering wired yet.

## Self-Check: PASSED

- [x] client/src/lib/types.ts contains `task_backend?: 'dashboard' | 'github'`
- [x] server/gsd/taskMigration.js exports 5 functions: detectRepoUrl, createSnapshot, extractRepoFromUrl, exportTasks, restoreSnapshot
- [x] server/__tests__/task-migration.test.js exists with all describe blocks
- [x] `node -e "require('./server/gsd/taskMigration')"` exits without error
- [x] Commits 9080f1d and cd1b872 exist
