---
phase: 14-telegram-integration
plan: 01
subsystem: server/gsd
tags: [telegram, bot-api, notifications, reply-poller]
dependency-graph:
  requires: [gsd_messages table from Phase 13.1, tmux.js isTmuxSessionActive]
  provides: [sendNotification, startReplyPoller, stopReplyPoller, ENABLED]
  affects: [server/index.js startup/shutdown]
tech-stack:
  added: [Telegram Bot API via native fetch]
  patterns: [lazy-loaded db stmts, AbortController for poller lifecycle, long-polling]
key-files:
  created: [server/gsd/telegram.js]
  modified: [server/index.js]
decisions:
  - Used native fetch (Node 18+) instead of adding an HTTP dependency
  - Lazy-load db stmts to avoid circular dependency with db.js
  - AbortController for clean poller shutdown on SIGTERM
  - Security: only process messages from configured CHAT_ID
metrics:
  duration: 3m 31s
  completed: 2026-03-27T19:57:44Z
  tasks: 2/2
  files-created: 1
  files-modified: 1
---

# Phase 14 Plan 01: Telegram Bot API Wrapper Summary

Telegram Bot API wrapper module with sendNotification(), long-polling reply poller, and inbound message logging to gsd_messages -- all no-op when env vars unset.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create server/gsd/telegram.js module | d8922d1 | server/gsd/telegram.js |
| 2 | Start reply poller on server boot | 11d198a | server/index.js |

## Implementation Details

### Task 1: Telegram Module (server/gsd/telegram.js)

Created a single-file module that wraps the Telegram Bot API with:

- **apiCall(method, payload)**: Generic Bot API caller using native fetch with 10s timeout
- **sendNotification(projectName, text, options?)**: Sends `[projectName] text` messages with optional inline keyboard buttons, truncates at 3800 chars
- **extractProject(text)**: Parses `[name]` prefix from message text to route replies
- **injectTmux(sessionName, text)**: Sends text to tmux session via `send-keys`, logs inbound message to gsd_messages
- **startReplyPoller()**: Long-polls `getUpdates` (30s timeout), handles both callback_query (button presses) and free-text message replies, routes to correct tmux session
- **stopReplyPoller()**: Aborts the polling loop via AbortController
- **ENABLED**: Boolean export, true only when both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set

### Task 2: Server Integration (server/index.js)

- Added import of telegram module at top of file
- Starts reply poller after server.listen() resolves (only when ENABLED)
- Added SIGTERM handler that stops the poller before exit

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `node -c server/gsd/telegram.js` passes
- Module loads correctly with all 4 exports (sendNotification, startReplyPoller, stopReplyPoller, ENABLED)
- ENABLED is false when env vars are unset (no-op behavior confirmed)
- `node -c server/index.js` passes
- `npm run test:server` passes 98/100 (2 pre-existing failures unrelated to this change)
