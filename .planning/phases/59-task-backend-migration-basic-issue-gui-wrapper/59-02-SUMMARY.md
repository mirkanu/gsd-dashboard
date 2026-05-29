---
phase: 59-task-backend-migration-basic-issue-gui-wrapper
plan: "02"
subsystem: backend
tags: [task-migration, routes, github-issues, proxy]
dependency_graph:
  requires: [59-01]
  provides: [migrate-route, rollback-migration-route, task_backend-backfill]
  affects: [server/routes/gsd.js]
tech_stack:
  added: []
  patterns: [upstreamFetch-self-proxy, loadConfigWithBackfill-extension, WebSocket-broadcast]
key_files:
  created: []
  modified:
    - server/routes/gsd.js
decisions:
  - "/api/gsd NOT added to proxy.js PROXY_PREFIXES — gsd.js routes self-proxy via upstreamFetch; blanket prefix would shadow /api/gsd/ws-base and break terminal WS (enforced by proxy-prefixes.test.js written in Plan 01)"
  - "task_backend backfill added to loadConfigWithBackfill alongside existing stage backfill"
  - "Both routes use identical upstreamFetch proxy pattern as PATCH /stage reference implementation"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-29T07:30:00Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 59 Plan 02: Migrate + Rollback Routes Summary

POST /migrate and POST /rollback-migration routes added to gsd.js with full D-04/D-07/D-10/D-11/D-12 threat mitigations; loadConfigWithBackfill extended to backfill task_backend='dashboard'; all 13 task-migration tests GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend loadConfigWithBackfill + add migrate and rollback routes | 2cbb927 | server/routes/gsd.js |
| 2 | Add /api/gsd to proxy.js PROXY_PREFIXES | (no-op — deviation, see below) | — |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2 reverted — /api/gsd must NOT be in PROXY_PREFIXES**

- **Found during:** Task 2
- **Issue:** Plan specified adding `/api/gsd` to `PROXY_PREFIXES` in proxy.js. A guard test `proxy-prefixes.test.js` (written in Plan 01, Wave 1) explicitly asserts this prefix must be absent. Reason: gsd.js routes already implement `GSD_DATA_URL` forwarding via `upstreamFetch` internally. A blanket PROXY_PREFIXES entry would intercept requests at the outer proxy layer, shadowing `/api/gsd/ws-base` and breaking the terminal WebSocket URL resolution.
- **Fix:** Reverted proxy.js to its original state (no change committed). Both new routes handle proxy mode correctly via their own `upstreamFetch` blocks.
- **Files modified:** none (revert)
- **Test:** `proxy-prefixes.test.js` passes (1/1)

## Test Results

Task-migration tests: 13/13 GREEN (was 9/13 RED before this plan)
- extractRepoFromUrl: 4/4
- createSnapshot: 2/2
- restoreSnapshot: 2/2
- POST /migrate 422 (D-12): GREEN
- POST /migrate 404 (unknown): GREEN
- POST /migrate 409 (already migrated): GREEN
- POST /rollback 400 (not github backend): GREEN
- POST /rollback 410 (expired window): GREEN

Proxy-prefixes test: 1/1 GREEN

Pre-existing baseline failures in full suite: 11 (unchanged, unrelated to this plan).

## Threat Surface Coverage

All threat register items from the plan's threat model are implemented:

| Threat ID | Mitigation | Location |
|-----------|-----------|----------|
| T-59-04 | gsddashboard name hardcoded-rejected with 422 before any file ops | migrate route line ~1004 |
| T-59-05 | getSecret() returns null; route returns 422 before PAT reaches gh CLI | migrate route |
| T-59-06 | 409 gate prevents double-flip (accepted risk for single-user) | migrate route |
| T-59-07 | daysSince > 7 check enforced server-side, independent of client UI | rollback route |

## Known Stubs

None. Routes call real taskMigration.js functions (detectRepoUrl, createSnapshot, exportTasks, restoreSnapshot).

## Self-Check: PASSED

- [x] `grep -n "router.post.*migrate" server/routes/gsd.js` returns line 989
- [x] `grep -n "router.post.*rollback-migration" server/routes/gsd.js` returns line 1067
- [x] `grep -n "task_backend_change" server/routes/gsd.js` returns 2 matches
- [x] `grep -n "task_backend.*dashboard" server/routes/gsd.js` shows backfill at line 59
- [x] proxy.js does NOT contain `/api/gsd`
- [x] task-migration tests: 13/13 PASS
- [x] proxy-prefixes test: 1/1 PASS
- [x] Commit 2cbb927 exists
