---
phase: 58-project-maturity-stages
plan: "05"
subsystem: frontend-ui, backend-api
tags: [stage-ui, group-by, delete-route, nudge-cron]
dependency_graph:
  requires: [58-04]
  provides: [stage-grouping-view, delete-project-route, nudge-cron]
  affects: [client/src/components/ChatListFilters.tsx, client/src/components/ProjectControls.tsx, client/src/pages/GSD.tsx, server/routes/gsd.js, server/index.js]
tech_stack:
  added: []
  patterns: [setInterval-cron, path-safety-guard, conditional-render-groupby]
key_files:
  created: []
  modified:
    - client/src/components/ChatListFilters.tsx
    - client/src/components/ProjectControls.tsx
    - client/src/pages/GSD.tsx
    - server/routes/gsd.js
    - server/index.js
decisions:
  - Stage grouping view uses STAGE_ORDER array for display order (launched first, retired last)
  - Nudge cron only runs in local mode (not GSD_DATA_URL proxy mode) since config lives on local machine
  - DELETE route restricted to Draft-stage only; path safety guard requires /data/home/ prefix
  - Kill/Archive button shown for projects where stage === 'draft' or stage is unset (defaults to draft)
metrics:
  duration: ~15 minutes
  completed: "2026-05-28"
  tasks: 2
  files: 5
---

# Phase 58 Plan 05: Wire Stage UI and Backend Routes Summary

Stage UI components wired into the live dashboard; group-by toggle added to project list; DELETE project route and 6-hour nudge cron added to backend.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wire stage UI into ChatListFilters, ProjectControls, GSD.tsx | 7dbeace | ChatListFilters.tsx, ProjectControls.tsx, GSD.tsx |
| 2 | Add nudge cron and DELETE project route to backend | d23ebc3 | server/routes/gsd.js, server/index.js |

## What Was Built

**Task 1 — Frontend wiring:**
- `ChatListFilters.tsx`: Added `groupBy`/`onGroupByChange` props; added "Group by: State / Stage" pill toggle below the filter bar
- `ProjectControls.tsx`: Added `StageBadge`, `StageBackfillChip`, `StageTransitionModal`, `KillArchiveModal` imports and usage; added Advance stage button (non-draft/non-retired with stage set); added Kill/Archive button (draft-only)
- `GSD.tsx`: Added `groupBy` state, `STAGE_ORDER` array, `STAGE_GROUP_HEADERS` record; wired `groupBy`/`onGroupByChange` to both ChatListFilters instances (desktop + mobile); added conditional stage-grouped view using sticky section headers with project counts

**Task 2 — Backend additions:**
- `DELETE /api/gsd/projects/:name`: Draft-only guard (422 on non-draft), stops tmux session, deletes GitHub repo via `gh repo delete`, removes project root directory with `/data/home/` path safety guard, splices from config, broadcasts `project_removed`, pushes `stage_change` feed event
- Stage nudge cron in `server/index.js`: Runs every 6 hours in local mode, checks alpha/beta projects via `meetsNudgeCriteria`, respects `stageNudgeDismissed` flag, pushes `stage_nudge` feed events

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `grep "groupBy" client/src/components/ChatListFilters.tsx` — returns prop and toggle UI
- `grep "KillArchiveModal\|StageTransitionModal" client/src/components/ProjectControls.tsx` — returns imports and usage
- `grep "STAGE_GROUP_HEADERS" client/src/pages/GSD.tsx` — returns record definition
- `grep "groupBy.*stage" client/src/pages/GSD.tsx` — returns conditional stage view (both instances)
- `grep "router.delete.*projects.*:name" server/routes/gsd.js` — returns DELETE route
- `grep "startsWith.*data/home" server/routes/gsd.js` — returns path safety guard
- `grep "STAGE_NUDGE_INTERVAL\|stage_nudge" server/index.js` — returns cron setup
- TypeScript check: no new errors introduced (11 pre-existing failures in isolated worktree env unchanged)
- Server tests: 360 pass / 11 fail — same 11 pre-existing failures before and after changes (verified via stash test)

## Known Stubs

None. All data flows are wired to live backend state.

## Threat Surface Scan

All threat mitigations from the plan's threat register are implemented:
- T-58-17: Stage guard on DELETE returns 422 for non-draft projects
- T-58-18: Path safety guard `project.root.startsWith('/data/home/')` prevents arbitrary path deletion
- T-58-19: GitHub URL parsed via regex and passed as array args to execFileSync (no shell interpolation)
- T-58-20: `stageNudgeDismissed` flag prevents repeated nudge events
- T-58-21: DELETE errors return `err.message.split('\n')[0]` only; no stack traces or internal paths in response

## Self-Check: PASSED
