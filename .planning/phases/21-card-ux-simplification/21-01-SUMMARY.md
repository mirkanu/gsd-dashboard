---
phase: 21-card-ux-simplification
plan: 01
subsystem: ui
tags: [react, tailwind, filter, state-management]

# Dependency graph
requires: []
provides:
  - Clickable stat boxes that filter the project grid by session state
  - Default Waiting filter on dashboard load
  - Show All button to reset filter to all non-archived projects
  - Unified single-grid rendering replacing collapsible sections
affects: [22-project-detail-ux, 23-claude-desktop-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "activeFilter state (SessionState | null) drives displayed project list via single derivation"
    - "Stat boxes as buttons with ring-2 highlight for active state"

key-files:
  created:
    - client/src/pages/__tests__/GSD.filter.test.ts
  modified:
    - client/src/pages/GSD.tsx

key-decisions:
  - "Replace three separate grid/collapsible sections with single displayedProjects grid — simpler render tree"
  - "activeFilter defaults to 'waiting' so users immediately see actionable items on load"
  - "Show All sets activeFilter to null, which shows all non-archived (paused included)"

patterns-established:
  - "Filter-by-click pattern: stat box onClick -> setActiveFilter -> derived list -> grid re-renders"

requirements-completed: [CARD-01, CARD-02, CARD-03]

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 21 Plan 01: Card UX Simplification Summary

**Clickable stat boxes filter the project grid by session state, defaulting to Waiting on load, with a Show All button for full non-archived view**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T08:17:32Z
- **Completed:** 2026-03-30T08:23:05Z
- **Tasks:** 2 (+ 1 TDD test commit)
- **Files modified:** 2

## Accomplishments
- Four stat boxes (Working/Waiting/Paused/Archived) are now clickable buttons that filter the grid
- Dashboard defaults to showing only Waiting projects — users see actionable items immediately
- Show All button appears when any filter is active and resets to all non-archived projects
- Removed collapsible paused/archived sections — all states accessible via filter clicks
- Ring highlight (color-coded per state) shows active filter; hover state makes boxes interactive

## Task Commits

Each task was committed atomically:

1. **TDD RED — filter logic test** - `f3507a0` (test)
2. **Task 1: Add activeFilter state and unified project grid** - `6145e9c` (feat)
3. **Task 2: Make stat boxes clickable + Show All button** - `f71338c` (feat)

## Files Created/Modified
- `client/src/pages/GSD.tsx` - activeFilter state, displayedProjects derivation, clickable stat boxes, Show All button
- `client/src/pages/__tests__/GSD.filter.test.ts` - Unit tests for filter logic contract

## Decisions Made
- Replace three separate grid/collapsible sections with single `displayedProjects` grid — simpler render tree, filter drives everything
- `activeFilter` defaults to `"waiting"` so users see actionable items immediately on load
- `Show All` sets `activeFilter` to `null`, which shows all non-archived (paused included in Show All)
- Ring highlight colors match existing brand colors: emerald/amber/red/gray for working/waiting/paused/archived

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Filter infrastructure ready; stat boxes are fully interactive
- Phase 22 (project detail UX) can rely on the simplified single-grid layout
- No blockers

---
*Phase: 21-card-ux-simplification*
*Completed: 2026-03-30*
