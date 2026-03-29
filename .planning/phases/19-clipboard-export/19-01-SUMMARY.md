---
phase: 19-clipboard-export
plan: 01
subsystem: ui
tags: [react, lucide-react, clipboard, navigator-clipboard, tasks]

# Dependency graph
requires:
  - phase: 18-task-ui
    provides: TasksTab component with GsdTask state management

provides:
  - Copy all button in TasksTab for one-click markdown clipboard export of open tasks

affects:
  - Any phase touching TasksTab or GSD workflow integration points

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline copy confirmation using local boolean state + setTimeout for 2-second feedback"
    - "Conditional button visibility based on component state (showArchived, loading, tasks.length)"

key-files:
  created: []
  modified:
    - client/src/components/TasksTab.tsx

key-decisions:
  - "No toast library added — inline button label change (Copied!/Copy all) is sufficient UX for clipboard confirmation"
  - "Button placement: right side of toggle row using flex justify-between wrapper, keeping archive toggle on left"

patterns-established:
  - "Inline state feedback: copied boolean + setTimeout(2000) pattern for clipboard actions without external notifications"

requirements-completed: [CLIP-01, CLIP-02]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 19 Plan 01: Clipboard Export Summary

**One-click Copy all button in TasksTab writes open tasks as `- **Title** — description` markdown lines to the clipboard with 2-second Copied! inline confirmation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T23:31:05Z
- **Completed:** 2026-03-29T23:34:15Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `ClipboardCopy` icon import from lucide-react alongside existing icons
- Added `copied` boolean state and `handleCopyAll` async function to TasksTab
- Button conditionally rendered: visible only when `!showArchived && !loading && tasks.length > 0`
- Toggle row wrapped in `flex items-center justify-between` — archive toggle left, Copy all right
- Markdown format: tasks with description produce `- **Title** — description`, without produce `- **Title**`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Copy all button with clipboard logic to TasksTab** - `55c09e2` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/src/components/TasksTab.tsx` - Added ClipboardCopy import, copied state, handleCopyAll function, and conditional Copy all button in toggle row

## Decisions Made
- No toast library added — the inline button label toggle between "Copy all" and "Copied!" for 2 seconds is sufficient and avoids adding dependencies
- Used `flex items-center justify-between` wrapper to place Copy all button on the right of the toggle row without restructuring the existing layout

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing Sidebar.test.tsx failures (2 tests checking for "v1.0.0" version text) — these existed before this plan and are out of scope. No new test failures introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLIP-01 and CLIP-02 requirements satisfied
- Copy all button is fully functional in the Tasks tab
- No blockers or concerns

---
*Phase: 19-clipboard-export*
*Completed: 2026-03-29*
