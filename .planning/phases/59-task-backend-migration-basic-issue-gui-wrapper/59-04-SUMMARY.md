---
phase: 59-task-backend-migration-basic-issue-gui-wrapper
plan: "04"
subsystem: frontend
tags: [task-migration, github-issues, TasksTab, rollback, migration-banner]
dependency_graph:
  requires: [59-01, 59-02]
  provides: [TasksTab-github-backend-render, migration-banner, rollback-ui]
  affects:
    - client/src/components/TasksTab.tsx
    - client/src/components/GsdDrawer.tsx
    - client/src/components/ProjectDetailsPanel.tsx
    - client/src/lib/api.ts
tech_stack:
  added: []
  patterns: [early-return-branch, two-step-confirm, extractOrgRepoFromUrl-regex]
key_files:
  created: []
  modified:
    - client/src/components/TasksTab.tsx
    - client/src/components/GsdDrawer.tsx
    - client/src/components/ProjectDetailsPanel.tsx
    - client/src/lib/api.ts
decisions:
  - "Added project prop to TasksTab (was projectKey-only); both callers (GsdDrawer, ProjectDetailsPanel) already hold GsdProject — no prop drilling required"
  - "migrateTasksToGithub + rollbackTaskMigration added to api.ts in this worktree (Rule 3 — Plan 03 adds same methods in parallel; files don't conflict at merge)"
  - "GitHub backend render is an early return — all existing task list code below it is completely unchanged"
  - "Migration banner placed before the form (not after) to ensure visibility even on short task lists"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-29T08:40:00Z"
  tasks_completed: 1
  files_modified: 4
---

# Phase 59 Plan 04: TasksTab GitHub Backend UI Summary

TasksTab updated with GitHub backend early-return render panel (link button + rollback), migration banner for skipped-migration projects, and two new API client methods; callers updated to pass full project prop.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add GitHub backend render + migration banner to TasksTab | fb8dd99 | TasksTab.tsx, GsdDrawer.tsx, ProjectDetailsPanel.tsx, api.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added migrateTasksToGithub + rollbackTaskMigration to api.ts**

- **Found during:** Task 1
- **Issue:** Plan 03 (wave 3, parallel) adds these API methods to api.ts. Plan 04 references them in TasksTab. Without them, TypeScript compilation fails. Since worktrees operate independently and merge later, Plan 04 must include these methods to produce a compilable output.
- **Fix:** Added both API methods to `client/src/lib/api.ts` within the `gsd:` namespace, matching the routes registered in Plan 02 (`/gsd/projects/:name/migrate` and `/gsd/projects/:name/rollback-migration`). When Plan 03 merges, it will add the same methods — a trivial merge conflict that resolves to keeping both (they're identical in intent).
- **Files modified:** client/src/lib/api.ts
- **Commit:** fb8dd99

**2. [Rule 3 - Blocking] Added project prop to TasksTab; updated callers**

- **Found during:** Task 1
- **Issue:** The plan's action spec references `project.name`, `project.github_repo`, `project.task_backend`, `project.taskMigratedAt` — but the existing TasksTab signature only accepted `{ projectKey: string }`. Two callers (GsdDrawer, ProjectDetailsPanel) both hold a `GsdProject` object.
- **Fix:** Added `project: GsdProject` prop to TasksTab. Updated both callers to pass `project={project}`. Existing `projectKey` prop retained for task list API calls.
- **Files modified:** TasksTab.tsx, GsdDrawer.tsx, ProjectDetailsPanel.tsx
- **Commit:** fb8dd99

**3. [Rule 3 - Blocking] Worktree base reset to master (45cf889)**

- **Found during:** Worktree branch check
- **Issue:** The worktree was created before Plans 01/02 merged to master. The worktree HEAD was at 86db635, missing the GsdProject type extensions (task_backend, github_repo, taskMigratedAt) added in Plan 01.
- **Fix:** `git reset --hard 45cf8892` per worktree_branch_check protocol, bringing the worktree up to date with Plans 01 and 02 changes.
- **Commit:** (reset, no new commit)

## TypeScript Verification

TypeScript checked using `/home/services/gsddashboard/client/node_modules/.bin/tsc --noEmit`. Errors in output are all pre-existing (missing vitest/testing-library in worktree client deps, GsdProject test fixture gaps from Plan 01 type additions). Zero errors in any of the four files modified by this plan.

Client test runner (vitest) not installable in this worktree due to ARM64 vs x64 platform mismatch in rollup optional dep. Pre-existing condition — tests run correctly in the main deployment environment.

## Threat Surface Coverage

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-59-10 | extractOrgRepoFromUrl regex validates github.com pattern | Anchored regex `/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i`; null return shows error instead of broken link |
| T-59-11 | Two-step confirm before rollback | `rollbackConfirm` state gate; user must click "Roll back to Dashboard tasks?" then "Restore Dashboard Tasks" |
| T-59-12 | 7-day gate is UX-only (server enforces independently) | `isWithin7Days(project.taskMigratedAt)` hides button client-side; server returns 410 past 7 days regardless |

## Known Stubs

None. The GitHub link panel renders a real URL from `project.github_repo` via `extractOrgRepoFromUrl`. The rollback and migrate-later handlers call real API endpoints. No hardcoded or placeholder data.

## Threat Flags

None. No new network endpoints introduced. The two API methods call existing routes registered in Plan 02. The external link opens a user-controlled github.com URL constructed from a server-sourced field.

## Self-Check: PASSED

- [x] `grep "task_backend === 'github'" client/src/components/TasksTab.tsx` — match found
- [x] `grep "Open GitHub Issues →" client/src/components/TasksTab.tsx` — match found
- [x] `grep "Restore Dashboard Tasks" client/src/components/TasksTab.tsx` — match found
- [x] `grep "Migrate to GitHub" client/src/components/TasksTab.tsx` — match found
- [x] `grep "Migrate your tasks to GitHub" client/src/components/TasksTab.tsx` — match found
- [x] `grep "issues" TasksTab.tsx | grep "orgRepo"` — Issues tab URL confirmed (D-09)
- [x] `grep "rollbackTaskMigration" client/src/components/TasksTab.tsx` — match found
- [x] Commit fb8dd99 exists
- [x] No unexpected file deletions
- [x] Zero TypeScript errors in modified files
