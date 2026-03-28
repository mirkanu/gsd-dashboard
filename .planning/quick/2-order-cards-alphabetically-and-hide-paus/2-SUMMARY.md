---
phase: quick
plan: 2
subsystem: client-ui
tags: [gsd-page, project-cards, sorting, ux]
dependency_graph:
  requires: []
  provides: [alphabetical-project-grid, paused-collapsible-section]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [collapsible-section-toggle, localeCompare-sort]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - "Sort visible projects A-Z by name using localeCompare (replaces state-order sort)"
  - "Paused projects get their own collapsible section, mirroring the archived pattern"
  - "pausedOpen state defaults to false (collapsed), consistent with archivedOpen"
metrics:
  duration: "5 minutes"
  completed_date: "2026-03-28"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Quick Task 2: Alphabetical Sort + Hide Paused Projects Summary

**One-liner:** A-Z sort for active project cards and paused projects moved into a collapsed "View paused (N)" section mirroring the existing archived toggle.

## What Was Built

- `visibleProjects` filter: excludes both `archived` and `paused` states
- `pausedProjects` filter: captures only `paused` state
- Main project grid now sorts by `a.name.localeCompare(b.name)` instead of the previous state-order + timestamp comparator
- `pausedOpen` state variable (default `false`) added alongside `archivedOpen`
- New "View paused (N)" collapsible section rendered between the main grid and the archived section
- Summary stat badges (`pausedCount`, `archivedCount`, etc.) are unchanged — they still read from the raw `projects` array

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Alphabetical sort + paused section in GSD.tsx | 4fc84c5 | client/src/pages/GSD.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run test:client` has a pre-existing environment failure (`magic-string` ESM export issue in vitest startup) unrelated to this change. Verified the failure exists on the unmodified baseline (confirmed via `git stash` test).
- `npx vite build` completed successfully with 0 errors — confirms no TypeScript/JSX compile errors were introduced.

## Self-Check: PASSED

- [x] `client/src/pages/GSD.tsx` modified
- [x] Commit `4fc84c5` exists in git log
- [x] `visibleProjects` excludes paused and archived
- [x] Sort uses `localeCompare`
- [x] Paused collapsible section present
- [x] Archived section unchanged
