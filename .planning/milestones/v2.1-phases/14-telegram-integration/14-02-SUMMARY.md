---
phase: 14-telegram-integration
plan: 02
subsystem: gsd-telegram
tags: [telegram, notifications, state-transitions, inline-keyboard]
dependency_graph:
  requires: [14-01]
  provides: [state-transition-notifications, scroll-to-select-detection]
  affects: [server/routes/gsd.js, server/gsd/telegram.js, server/gsd/tmux.js]
tech_stack:
  patterns: [module-level state map, cooldown gate, regex option parsing]
key_files:
  modified:
    - server/gsd/telegram.js
    - server/routes/gsd.js
    - server/gsd/tmux.js
decisions:
  - "1-minute cooldown per project to prevent notification spam"
  - "Last 5 lines of terminal output included in notification body for context"
  - "Options capped at 8 items to keep inline keyboard manageable"
metrics:
  duration: "4m 36s"
  completed: "2026-03-27T20:04:40Z"
---

# Phase 14 Plan 02: State Transition Detection and Notification Summary

Session state transition detection during GET /projects polling cycle, with parseOptions for scroll-to-select prompts and 1-minute cooldown per project.

## What Was Done

### Task 1: parseOptions and cooldown logic in telegram.js

- Added `parseOptions(text)` function ported from Python logic:
  - Pattern 1: detects "select: A / B / C" format, splits on `/`
  - Pattern 2: detects trailing numbered lists (`1. Option`, `1) Option`), returns up to 8 items
- Added `shouldNotify(projectName)` cooldown gate using module-level Map with 60-second window
- Added outbound notification logging to `gsd_messages` via `getStmts()?.insertGsdMessage`
- Exported `parseOptions` and `shouldNotify` from module

### Task 2: State transition detection in GET /projects

- Added `capturePaneText` to tmux.js exports (was defined but not exported)
- Imported `sendNotification`, `parseOptions`, `shouldNotify`, `ENABLED` from telegram.js into gsd.js
- Imported `capturePaneText` from tmux.js
- Added module-level `previousStates` Map to track per-project session state across polling cycles
- Added transition detection block after sessionState computation:
  - Fires when state changes from `working` to `waiting` or `paused`
  - Passes through cooldown gate before sending
  - Captures pane text, parses options for inline keyboard buttons
  - Includes last 5 lines of terminal output in notification body (capped at 500 chars)
  - Sends notification asynchronously (fire-and-forget with `.catch(() => {})`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] capturePaneText not exported from tmux.js**
- **Found during:** Task 2
- **Issue:** `capturePaneText` was defined in tmux.js but not included in `module.exports`
- **Fix:** Added to exports: `{ isTmuxSessionActive, capturePaneText, detectSessionState, detectRateLimit }`
- **Files modified:** server/gsd/tmux.js
- **Commit:** 912e64d

## Verification

- `node -c` syntax check passed for all three modified files
- `parseOptions` correctly detects both "select: A/B/C" and numbered list patterns
- Server tests: pre-existing failures in `resolveFile`/`plan` tests (unrelated to this change); no new failures introduced

## Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1-2  | 912e64d | Telegram notifications on session state transitions with scroll-to-select detection |

## Self-Check: PASSED
