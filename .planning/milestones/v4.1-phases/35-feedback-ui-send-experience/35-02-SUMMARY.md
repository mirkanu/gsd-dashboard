---
phase: 35-feedback-ui-send-experience
plan: 02
subsystem: ui
tags: [react, optimistic-ui, polling, tmux, working-status]

requires:
  - phase: 35-feedback-ui-send-experience
    provides: ChatWindow with message rendering and feedback context menu

provides:
  - Optimistic "Working" state immediately on send
  - Adaptive 3s/30s polling based on active project state
  - Live tmux status text updates within 3 seconds
  - onSendStateChange callback for parent notification

affects: []

tech-stack:
  added: []
  patterns: ["optimistic state override with effectiveState pattern", "adaptive polling interval based on session state"]

key-files:
  created: []
  modified:
    - client/src/components/ChatWindow.tsx
    - client/src/pages/GSD.tsx

key-decisions:
  - "Used effectiveState pattern to merge optimistic and real state without modifying parent"
  - "10-second timeout safety for optimistic working state in case server never reports working"
  - "3-second polling for working projects balances responsiveness with server load"

patterns-established:
  - "effectiveState: local optimistic override that clears when real state catches up or times out"
  - "Adaptive polling: useEffect with sessionState dependency to switch between fast and slow intervals"

requirements-completed: [SEND-01, SEND-02, WORK-01, WORK-02]

duration: 5min
completed: 2026-04-04
---

# Phase 35 Plan 02: Send + Working Status Experience Summary

**Optimistic working badge on send with adaptive 3s polling for live tmux status text updates**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04T23:48:03Z
- **Completed:** 2026-04-04T23:53:04Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Sending a message instantly shows "Working" badge and WorkingIndicator without waiting for server
- Projects poll every 3 seconds when the selected project is working, ensuring near-real-time status text
- Polling drops to 30 seconds when no project is actively working (bandwidth efficiency)
- SEND-01 (optimistic outbound message) preserved as-is from prior implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Optimistic working state on send + faster active polling** - `afa52e5` (feat)

## Files Created/Modified
- `client/src/components/ChatWindow.tsx` - Added optimisticWorking state, effectiveState computation, onSendStateChange prop
- `client/src/pages/GSD.tsx` - Replaced fixed 30s polling with adaptive 3s/30s based on selectedProj.sessionState, wired onSendStateChange

## Decisions Made
- Used effectiveState pattern (local computed value) rather than modifying parent state, keeping ChatWindow self-contained
- 10-second timeout safety net for optimistic working state prevents stuck UI if server never transitions
- 3-second poll interval chosen to meet WORK-02 requirement while keeping server load reasonable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All SEND and WORK requirements fulfilled
- Phase 35 complete (both plans done)
- Ready for next milestone phase

---
*Phase: 35-feedback-ui-send-experience*
*Completed: 2026-04-04*
