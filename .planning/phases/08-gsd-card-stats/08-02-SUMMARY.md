---
phase: 08-gsd-card-stats
plan: 02
subsystem: client
completed: 2026-03-23
tags: [frontend, types, ui, gsd-cards]
dependency_graph:
  requires: [08-01-PLAN.md]
  provides: [GsdProject UI with Blocked badge, next action, stats row]
  affects: [client/src/pages/GSD.tsx, client/src/lib/types.ts]
tech_stack:
  added: []
  patterns: [conditional rendering, array sort with stable secondary key]
key_files:
  created: []
  modified:
    - client/src/lib/types.ts
    - client/src/pages/GSD.tsx
    - client/src/components/__tests__/GsdProject.test.ts
decisions:
  - Replaced last_activity date sort with blocked-first sort; secondary stable ordering preserved by JS engine
  - Used tsc --noEmit to confirm TypeScript correctness when vite build failed due to disk space
metrics:
  duration: ~15 minutes
  completed: 2026-03-23
  tasks_completed: 3
  files_modified: 3
---

# Phase 8 Plan 02: GSD Card Stats UI Summary

Frontend type updates and ProjectCard UI additions surfacing backend stats fields: Blocked badge, next action line, velocity/streak/estimatedCompletion stats row, and blocked-first grid sort.

## What Was Implemented

**Types (client/src/lib/types.ts)**
- `GsdState` gains `next_action: string | null` after `last_activity`
- `GsdProject` gains `velocity: number`, `streak: number`, `estimatedCompletion: string | null` after `liveUrl`

**ProjectCard UI (client/src/pages/GSD.tsx)**
- Header: "Blocked" red pill badge renders alongside `StatusBadge` when `state.blockers.length > 0`
- Next action section: "Next: {text}" line appears between last-activity and blockers when `state.next_action` is truthy
- Stats row: velocity ("N plans this week"), streak ("N day streak"), estimatedCompletion ("X est.") rendered with "·" separators before the roadmap toggle; only shown when at least one stat is non-zero/non-null
- Grid sort: blocked projects (any blockers) float to the top via `[...projects].sort()`

**Tests (client/src/components/__tests__/GsdProject.test.ts)**
- Existing fixtures updated to include the three new required `GsdProject` fields
- New test cases: `GsdProject` with `velocity: 3, streak: 2, estimatedCompletion: '~2 days'`; zero/null variants; `GsdState` with `next_action` as string and null

## Verification

- `tsc --noEmit`: clean (zero errors)
- `npm run test:client`: 84/86 tests pass; 2 failures are pre-existing in `Sidebar.test.tsx` (unrelated brand name change from a prior phase)
- `npm run build`: clean build, 1859 modules transformed, no TypeScript errors

## Deviations from Plan

None — plan executed exactly as written. Disk space exhaustion required clearing npm cache (`/data/home/.npm/_cacache`) before git commit and build could proceed; this is an infrastructure issue, not a code deviation.

## Self-Check: PASSED

Files confirmed present:
- /data/home/gsddashboard/client/src/lib/types.ts (contains next_action, velocity, streak, estimatedCompletion)
- /data/home/gsddashboard/client/src/pages/GSD.tsx (contains Blocked badge, next action, stats row, blocked sort)
- /data/home/gsddashboard/client/src/components/__tests__/GsdProject.test.ts (contains new test cases)

Commits confirmed:
- f72ad33: feat(08-02): add next_action to GsdState and velocity/streak/estimatedCompletion to GsdProject types
- d2d9051: feat(08-02): add Blocked badge, next action, stats row to GSD project cards
- c0c4209: test(08-02): add type assertions for velocity, streak, estimatedCompletion, next_action
