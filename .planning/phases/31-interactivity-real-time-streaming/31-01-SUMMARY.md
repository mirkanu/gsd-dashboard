---
phase: 31-interactivity-real-time-streaming
plan: 01
subsystem: ui
tags: [react, chatscope, websocket, eventbus, unread-badges]

requires:
  - phase: 30-chat-interaction-layer
    provides: ChatWindow with handleChipSelect, ChatMessageRenderer with onAction, eventBus infrastructure
provides:
  - Checkpoint buttons insert into textarea instead of auto-sending (ACT-02 fix)
  - Per-project unread badge counts via eventBus subscription (ACT-03)
  - ChatListView unreadCounts prop wiring
affects: [32-project-detail-panel]

tech-stack:
  added: []
  patterns: [activeProjectRef pattern for stale closure avoidance in eventBus subscriptions]

key-files:
  created: []
  modified:
    - client/src/components/ChatWindow.tsx
    - client/src/pages/GSD.tsx
    - client/src/components/ChatListView.tsx

key-decisions:
  - "Checkpoint buttons insert choice number into textarea (not auto-send) matching command chip behavior"
  - "Unread counts tracked via eventBus subscription with activeProjectRef to avoid stale closures"

patterns-established:
  - "activeProjectRef pattern: use useRef to track current project in eventBus callbacks to avoid stale closure"

requirements-completed: [ACT-01, ACT-02, ACT-03, INF-03]

duration: 14min
completed: 2026-04-04
---

# Phase 31 Plan 01: Interactivity and Real-Time Streaming Summary

**Fixed checkpoint auto-send bug and added per-project unread badge counts via eventBus subscription**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-04T15:57:52Z
- **Completed:** 2026-04-04T16:11:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fixed ACT-02 bug: checkpoint option buttons now insert choice number into textarea instead of auto-sending
- Implemented ACT-03: per-project unread badge counts that increment for non-active projects and reset on select
- Wired unreadCounts through ChatListView to chatscope Conversation component's unreadCnt prop

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ACT-02 bug and add unread count state to GSD.tsx** - `0066a6f` (feat)
2. **Task 2: Wire unreadCounts into ChatListView component** - `436dd22` (feat)

## Files Created/Modified
- `client/src/components/ChatWindow.tsx` - Changed onAction from handleSend to handleChipSelect for ChatMessageRenderer
- `client/src/pages/GSD.tsx` - Added unreadCounts state, activeProjectRef, eventBus subscription, reset on select, prop passing
- `client/src/components/ChatListView.tsx` - Added unreadCounts prop to interface and wired to Conversation unreadCnt

## Decisions Made
- Checkpoint buttons insert choice number into textarea (matching command chip behavior) rather than auto-sending
- Used activeProjectRef (useRef) to track current project in eventBus callback, avoiding stale closure issues

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All interactivity features (ACT-01, ACT-02, ACT-03) and real-time streaming (INF-03) verified
- Ready for any remaining phase 31 plans or continuation of phase 32

---
*Phase: 31-interactivity-real-time-streaming*
*Completed: 2026-04-04*
