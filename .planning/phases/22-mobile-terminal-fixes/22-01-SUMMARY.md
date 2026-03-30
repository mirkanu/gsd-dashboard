---
phase: 22-mobile-terminal-fixes
plan: 01
subsystem: ui
tags: [xterm, mobile, ios, touch, webkit, terminal]

# Dependency graph
requires: []
provides:
  - iOS viewport no-zoom on input focus via maximum-scale=1 in viewport meta
  - Touch scroll damping (SCROLL_DAMPING=3) in TerminalOverlay handleTouchMove
  - Terminal focus restoration after special key tap in SpecialKeyBar
affects: [mobile, terminal, GSD.tsx]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SCROLL_DAMPING constant controls tmux scroll speed from touch — higher = slower, more deliberate"
    - "termRef passed to SpecialKeyBar so it can re-focus xterm after each key tap"
    - "maximum-scale=1 in viewport meta stops iOS auto-zoom without removing user-scalable"

key-files:
  created: []
  modified:
    - client/index.html
    - client/src/pages/GSD.tsx

key-decisions:
  - "Use maximum-scale=1 (not user-scalable=no) to fix iOS zoom — preserves intentional pinch-to-zoom for accessibility"
  - "SCROLL_DAMPING=3 chosen: 30px drag per tmux scroll line at fontSize=10, comfortable speed without overshooting"
  - "Pass termRef to SpecialKeyBar for explicit re-focus after send — onTouchStart preventDefault already blocks native focus steal"

patterns-established:
  - "Mobile special key bars should re-focus terminal after sending each key sequence"
  - "Touch scroll speed tuned via a named damping constant for easy future adjustment"

requirements-completed: [MOB-01, MOB-02, MOB-03]

# Metrics
duration: 8min
completed: 2026-03-30
---

# Phase 22 Plan 01: Mobile Terminal Fixes Summary

**Three targeted mobile UX fixes: iOS viewport zoom prevention, touch scroll damping (30px/line), and xterm focus restoration after special key taps**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T11:40:00Z
- **Completed:** 2026-03-30T11:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `maximum-scale=1` to viewport meta in index.html — prevents iOS Safari auto-zoom on input focus
- Added `SCROLL_DAMPING=3` constant to `handleTouchMove` — changes denominator from `fontSize` (10px) to `fontSize * 3` (30px), making scroll 3x more deliberate
- Updated `SpecialKeyBar` to accept `termRef` prop and call `termRef.current?.focus()` after each key send — prevents xterm.js losing focus after special key taps

## Task Commits

Each task was committed atomically:

1. **Task 1: Prevent iOS viewport zoom on input focus** - `163125f` (fix)
2. **Task 2: Reduce touch scroll sensitivity and fix special key focus loss** - `05d2aaa` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/index.html` - Added `maximum-scale=1` to viewport meta tag
- `client/src/pages/GSD.tsx` - Added SCROLL_DAMPING constant, updated lines calculation, updated SpecialKeyBar signature and send function, updated usage site

## Decisions Made
- Used `maximum-scale=1` not `user-scalable=no` — the former stops auto-zoom on focus while still allowing intentional pinch-to-zoom for accessibility
- `SCROLL_DAMPING=3` selected as a comfortable default (30px per scroll line at mobile fontSize=10). The constant is named and documented so it can be easily tuned
- Passed `termRef` explicitly to `SpecialKeyBar` rather than relying solely on `onTouchStart e.preventDefault()` — belt-and-suspenders for edge cases where xterm.js might still lose focus

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing 2-test failure in `Sidebar.test.tsx` (checking for "v1.0.0" version text) confirmed unrelated to this plan — identical failure count before and after changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three mobile terminal bugs fixed — terminal overlay should now be comfortable to use on iOS/touch devices
- No blockers or concerns

---
*Phase: 22-mobile-terminal-fixes*
*Completed: 2026-03-30*
