---
phase: 35-feedback-ui-send-experience
plan: 01
subsystem: ui
tags: [radix, context-menu, react, websocket, feedback]

requires:
  - phase: 34-feedback-pipeline
    provides: POST /api/gsd/messages/:id/feedback endpoint and gsd_message_updated WebSocket broadcast

provides:
  - Radix context menu on all inbound chat messages for type reclassification
  - api.gsd.feedback() client method
  - gsd_message_updated WSMessage type and real-time handler
  - Optimistic UI updates with error rollback

affects: [35-feedback-ui-send-experience]

tech-stack:
  added: ["@radix-ui/react-context-menu"]
  patterns: ["Radix context menu wrapping message components", "optimistic update with refetch rollback"]

key-files:
  created: []
  modified:
    - client/src/components/ChatMessageRenderer.tsx
    - client/src/components/ChatWindow.tsx
    - client/src/lib/api.ts
    - client/src/lib/types.ts
    - client/package.json

key-decisions:
  - "Used Radix ContextMenu (not custom) for accessibility and mobile long-press support"
  - "Outbound messages excluded from context menu since they are user-sent"
  - "Optimistic update with full refetch rollback on error"

patterns-established:
  - "MessageContextMenu wrapper: reusable pattern for any message-level action menus"

requirements-completed: [FBK-04]

duration: 6min
completed: 2026-04-04
---

# Phase 35 Plan 01: Feedback UI - Context Menu Summary

**Radix right-click/long-press context menu on chat messages for type reclassification via Phase 34 feedback API**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-04T23:35:11Z
- **Completed:** 2026-04-04T23:41:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Right-click (desktop) or long-press (mobile) opens a context menu on any inbound chat message
- Context menu shows all 6 message types with current type disabled
- Selecting a type optimistically updates the UI, then calls the feedback API
- WebSocket gsd_message_updated events update messages across tabs in real-time
- Messages reclassified as "hidden" disappear from chat view

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Radix, add API client + types, wire WebSocket handler** - `ab49d42` (feat)
2. **Task 2: Build Radix context menu on chat messages** - `74f75fd` (feat)

## Files Created/Modified
- `client/src/lib/types.ts` - Added gsd_message_updated to WSMessage type union
- `client/src/lib/api.ts` - Added api.gsd.feedback() method
- `client/src/components/ChatWindow.tsx` - WebSocket handler for gsd_message_updated, optimistic feedback callback
- `client/src/components/ChatMessageRenderer.tsx` - Radix ContextMenu wrapping all inbound message types
- `client/package.json` - Added @radix-ui/react-context-menu dependency

## Decisions Made
- Used Radix ContextMenu for accessibility and built-in mobile long-press support
- Excluded outbound messages from context menu (user-sent messages don't need reclassification)
- Optimistic update with full message refetch on API error (simple rollback strategy)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type mismatch in optimistic update**
- **Found during:** Task 1 (ChatWindow feedback handler)
- **Issue:** `correctType` parameter typed as `string` caused spread to widen `message_type` beyond `MessageType` union
- **Fix:** Cast `correctType as MessageType` in the optimistic setMessages callback
- **Files modified:** client/src/components/ChatWindow.tsx
- **Verification:** `npx tsc --noEmit` passes for all modified files
- **Committed in:** ab49d42 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Context menu is fully wired to Phase 34 feedback API
- Ready for Phase 35 Plan 02 (send experience improvements)

---
*Phase: 35-feedback-ui-send-experience*
*Completed: 2026-04-04*
