---
phase: quick-30
plan: 30
subsystem: server+client
tags: [cleanup, dead-code, chat, classifier, types]
key-files:
  modified:
    - server/index.js
    - server/routes/gsd.js
    - server/db.js
    - server/gsd/telegram.js
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/components/ChatListView.tsx
    - client/src/components/GsdDrawer.tsx
    - client/src/pages/__tests__/GSD.filter.test.ts
    - .planning/STATE.md
  deleted:
    - server/gsd/classifier.js
    - server/gsd/patternManager.js
    - server/gsd/classifierPatterns.js
    - server/__tests__/chatMessages.test.js
    - server/__tests__/classifier.test.js
    - client/src/components/StageBanner.tsx
    - client/src/components/ErrorCard.tsx
    - client/src/components/CompletionCard.tsx
    - client/src/components/CheckpointPrompt.tsx
    - client/src/components/WorkingIndicator.tsx
    - client/src/components/NextUpCard.tsx
decisions:
  - Removed all v4.1 chat infrastructure — superseded by terminal-first approach
  - ChatListView now shows statusText (tmux task) or sessionState instead of lastMessage
  - GsdDrawer Messages tab removed since /projects/:name/messages route is gone
metrics:
  completed_date: "2026-04-05"
  tasks: 3
  files_deleted: 11
  files_modified: 10
---

# Quick Task 30: Remove dead v4.1 chat code, replace lastMessage with statusText

**One-liner:** Removed TmuxClassifier, gsd_messages queries, feedback routes, and 11 dead files after terminal replaced chat in quick task 27; ChatListView now shows live tmux statusText.

## What Was Done

### Task 1: Server-side cleanup

**server/index.js:**
- Removed TmuxClassifier + PatternManager instantiation block (8 lines)
- Removed `loadGsdConfig` helper function
- Removed 2.5s setInterval classifier poll loop

**server/routes/gsd.js:**
- Removed lastMessages db.prepare query and lastMsgMap population block
- Removed `lastMessage: lastMsgMap.get(name) || null` from project response
- Removed `stmts.insertGsdMessage.run()` from send route
- Removed GET `/projects/:name/messages` route handler
- Removed entire classifier feedback/overrides section (157 lines): MESSAGE_TYPES require, POST /messages/:id/feedback, GET /classifier/feedback, GET /classifier/overrides, DELETE /classifier/overrides/:id

**server/db.js:**
- Removed gsd_messages table from ensureTables
- Removed message_type migration block (Phase 28)
- Removed classifier_feedback + classifier_overrides migration block (Phase 34)
- Removed 13 dead prepared statements: insertGsdMessage, listGsdMessages, insertClassifiedMessage, listVisibleGsdMessages, countGsdMessages, getGsdMessage, updateMessageType, insertFeedback, listFeedback, listOverrides, insertOverride, disableOverride, bumpOverrideHitCount

**Deleted server files:**
- server/gsd/classifier.js
- server/gsd/patternManager.js
- server/gsd/classifierPatterns.js
- server/__tests__/chatMessages.test.js
- server/__tests__/classifier.test.js

### Task 2: Client-side cleanup

**client/src/lib/types.ts:**
- Removed `lastMessage` field from GsdProject interface
- Removed MessageType type alias
- Removed GsdMessage interface
- Removed GsdChatMessageEvent interface
- Removed `gsd_chat_message` and `gsd_message_updated` from WSMessage type union

**client/src/lib/api.ts:**
- Removed `api.gsd.messages()` function
- Removed `api.gsd.feedback()` function

**client/src/components/ChatListView.tsx:**
- Replaced `p.lastMessage ? truncate(p.lastMessage.content, 80) : "No messages yet"` with `p.statusText ? truncate(p.statusText, 80) : capitalize(p.sessionState)`

**client/src/components/GsdDrawer.tsx (deviation - Rule 1):**
- Removed MessageLog component and Messages tab (the backend route was removed)
- This was auto-fixed to prevent runtime 404 errors on tab click

**Deleted client components:**
- StageBanner.tsx, ErrorCard.tsx, CompletionCard.tsx, CheckpointPrompt.tsx, WorkingIndicator.tsx, NextUpCard.tsx

### Task 3: STATE.md update

- Added [quick-30] architectural decision record
- Removed stale blockers (classifier complexity, 2.5s poll interval)
- Added quick task 30 to completed table
- Updated last_activity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GsdDrawer Messages tab would 404 after route removal**
- **Found during:** Task 2 (client cleanup)
- **Issue:** GsdDrawer.tsx had a Messages tab that called `api.gsd.messages()` which hit the now-deleted `/api/gsd/projects/:name/messages` route
- **Fix:** Removed MessageLog component and Messages tab from GsdDrawer, removed unused `useRef` import and `GsdMessage` type import
- **Files modified:** client/src/components/GsdDrawer.tsx

**2. [Rule 1 - Bug] Dead insertGsdMessage calls in telegram.js**
- **Found during:** Final verification
- **Issue:** telegram.js had two non-blocking try/catch blocks calling `stmts?.insertGsdMessage?.run()` which would silently no-op since the statement was removed
- **Fix:** Removed the dead log calls entirely
- **Files modified:** server/gsd/telegram.js

## Verification

- `npm run test:server`: All tests pass (1 pre-existing readProjectMeta failure unrelated to changes)
- `npm run test:client`: 115/117 tests pass (2 pre-existing Sidebar version failures)
- `npx tsc --noEmit` in client: No new errors (pre-existing GSD.tsx TouchEvent errors remain)
- Client build: Successful via `vite build`

## Self-Check: PASSED

- server/index.js exists and has no classifier references
- server/routes/gsd.js exists and has no messages/classifier routes
- server/db.js exists and has no gsd_messages statements
- All 11 dead files are deleted
- ChatListView.tsx uses statusText
- Commits: f82402b, ca3dfaf, a5a5734, 30a0ad4, 6c6b985
