---
phase: 59-task-backend-migration-basic-issue-gui-wrapper
plan: "03"
subsystem: frontend
tags: [task-migration, api-client, ui, stage-transition, github-issues]
dependency_graph:
  requires: [59-02]
  provides: [migrateTasksToGithub-api-method, rollbackTaskMigration-api-method, migration-step-ui]
  affects: [client/src/lib/api.ts, client/src/components/StageTransitionModal.tsx]
tech_stack:
  added: []
  patterns: [toggle-driven-step, inline-error-retry, conditional-render-by-project-field]
key_files:
  created: []
  modified:
    - client/src/lib/api.ts
    - client/src/components/StageTransitionModal.tsx
decisions:
  - "showMigrationStep is a render-time computed value (not state) — avoids stale state on modal re-open"
  - "handleMigrateAndConfirm aborts stage transition on partial failure (failed.length > 0) — user must retry or skip"
  - "isMigrating disables Cancel button during migration to prevent race conditions with stage transition"
  - "migrationError displays server message only (T-59-09) — no stack traces surfaced to client"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-29T08:30:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 59 Plan 03: API Client Methods + StageTransitionModal Migration Step Summary

Two new API methods wired to Plan 02 routes (migrateTasksToGithub, rollbackTaskMigration); migration step injected into StageTransitionModal for Beta→Launched transitions when project has github_repo — toggle defaults off, button label adapts, inline retry on failure.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add migrateTasksToGithub and rollbackTaskMigration to api.ts | ca5cb0e | client/src/lib/api.ts |
| 2 | Add migration step to StageTransitionModal for Beta→Launched | 99739ca | client/src/components/StageTransitionModal.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

`npm run test:client`: pre-existing baseline 92 failures (11 test files) due to `act(...) is not supported in production builds of React` infrastructure failure — this is unrelated to this plan's changes. Confirmed by running baseline before stash pop: identical failure count (92/172, 11 failed files).

No new test failures introduced by this plan.

## Threat Surface Coverage

| Threat ID | Mitigation | Location |
|-----------|-----------|----------|
| T-59-08 | Toggle defaults OFF — user must explicitly enable | `migrateTasks` useState(false) |
| T-59-09 | migrationError shows user-friendly `.message` only; no stack traces | handleMigrateAndConfirm catch block |

## Known Stubs

None. API methods call real Plan 02 routes. Toggle state flows to real handleMigrateAndConfirm.

## Self-Check: PASSED

- [x] `grep "migrateTasksToGithub" client/src/lib/api.ts` returns line 183
- [x] `grep "rollbackTaskMigration" client/src/lib/api.ts` returns line 194
- [x] `grep "Migrate tasks to GitHub" client/src/components/StageTransitionModal.tsx` returns match (line 197)
- [x] `grep "Confirm & Migrate" client/src/components/StageTransitionModal.tsx` returns match (line 114)
- [x] `npm run mcp:typecheck` exits 0
- [x] `npm run build` exits 0
- [x] Commits ca5cb0e and 99739ca exist
