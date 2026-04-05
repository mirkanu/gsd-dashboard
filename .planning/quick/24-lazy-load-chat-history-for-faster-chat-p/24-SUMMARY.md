---
phase: quick
plan: 24
subsystem: client/chat
tags: [pagination, performance, ux]
dependency_graph:
  requires: []
  provides: [lazy-chat-history]
  affects: [ChatWindow.tsx]
tech_stack:
  added: []
  patterns: [offset-pagination, scroll-position-preservation, requestAnimationFrame]
key_files:
  created: []
  modified:
    - client/src/components/ChatWindow.tsx
decisions:
  - hasMore derived from total > messages.length (real-time appended messages may inflate slightly, acceptable)
  - Scroll restoration via requestAnimationFrame after setMessages to let React flush DOM first
  - Feedback error-revert also resets offset/total to 0 to stay consistent with fresh 50-message view
metrics:
  duration: 8min
  completed: 2026-04-05
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 24: Lazy-Load Chat History Summary

**One-liner:** Paginated chat history loading — initial 50 messages with "Load older messages" button that prepends batches without scroll jump.

## What Was Done

Implemented offset-based lazy loading in ChatWindow.tsx. Chat windows now fetch only the 50 most recent messages on open (down from 100), with a "Load older messages" button at the top that loads the next 50 older messages on each click. Scroll position is preserved using `requestAnimationFrame` to measure the scroll height delta after React re-renders.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add paginated message loading to ChatWindow | aff5525 |

## Key Changes

**State added:**
- `offset` — how many messages have been loaded beyond the initial batch
- `total` — total message count returned by the API
- `loadingMore` — loading state for the load-more button

**Logic added:**
- `loadMore` callback: fetches next 50 at `offset + 50`, reverses (API returns DESC), prepends to messages, updates offset, restores scroll
- `hasMore` derived value: `total > messages.length`
- "Load older messages" button at top of message list, visible when `hasMore`

**Reset on project switch:** The project-change useEffect now also resets `offset` and `total` to 0.

**Feedback revert:** Error case now refetches 50 messages and resets `offset`/`total`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run test:client`: 115/117 tests pass. The 2 failing tests (Sidebar brand name and version) are pre-existing failures unrelated to this task (sidebar was renamed from "Agent Dashboard" to "GSD Dashboard" in a previous task). Confirmed by running tests on baseline before applying changes.
- TypeScript check: no errors introduced in ChatWindow.tsx. Pre-existing errors in GSD.tsx, CheckpointPrompt.tsx, and GsdProject.test.ts are out of scope.

## Self-Check

- [x] `client/src/components/ChatWindow.tsx` modified with paginated loading
- [x] Commit aff5525 exists
