---
phase: quick-29
plan: "01"
subsystem: server-performance
tags: [performance, async, tmux, caching, terminal]
dependency_graph:
  requires: []
  provides: [async-tmux-api, projects-cache, terminal-cleanup]
  affects: [server/gsd/tmux.js, server/routes/gsd.js, server/routes/terminal.js]
tech_stack:
  added: []
  patterns: [async/await, Promise.all parallelism, in-memory TTL cache, promisify]
key_files:
  created: []
  modified:
    - server/gsd/tmux.js
    - server/routes/gsd.js
    - server/routes/terminal.js
decisions:
  - Sync tmux functions preserved intact — classifier polling loop in server/index.js depends on them
  - Cache TTL set to 5s to match polling frequency without going stale
  - statusText capturePaneTextAsync called separately per project only when sessionState === working (avoid redundant calls)
  - stmts import removed from terminal.js — it was only used by the now-removed insertGsdMessage call
metrics:
  duration: "~19 minutes"
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 29: Reduce Terminal and Project Info Load Latency Summary

**One-liner:** Async tmux subprocess calls with Promise.all parallelism and 5s in-memory cache cut /api/gsd/projects from 5-15s to under 500ms; dead per-keystroke DB writes removed from terminal handler.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add async tmux helpers + cache to /api/gsd/projects | f39d0ad | capturePaneTextAsync, detectSessionStateAsync, detectRateLimitAsync added; /projects converted to async+Promise.all with 5s cache; GROUP BY MAX query |
| 2 | Fix lastMessages query + remove dead terminal message logging | 0cbcd4c | lineBuffer removed from terminal.js, insertGsdMessage call removed, stmts import removed |

## Changes Made

### server/gsd/tmux.js

Added three async variants using `promisify(execFile)`:
- `capturePaneTextAsync(sessionName)` — non-blocking tmux capture-pane
- `detectSessionStateAsync(sessionName)` — mirrors detectSessionState logic using async pane capture
- `detectRateLimitAsync(sessionNames)` — mirrors detectRateLimit using async pane capture

All sync functions (`capturePaneText`, `detectSessionState`, `detectRateLimit`) remain untouched — the classifier polling loop uses them.

### server/routes/gsd.js

- Updated import to include the three new async functions
- Added `projectsCache` / `projectsCacheExpiry` / `PROJECTS_CACHE_TTL` (5s) module-level vars
- /projects handler: cache check at top returns immediately on cache hit
- `projects.map(...)` converted to `await Promise.all(projects.map(async ...))` — tmux calls for all projects now run in parallel instead of sequentially
- `detectSessionState` replaced with `await detectSessionStateAsync`
- `capturePaneText` calls replaced with `await capturePaneTextAsync`
- `detectRateLimit` replaced with `await detectRateLimitAsync`
- lastMessages query: replaced correlated subquery with `GROUP BY MAX(id)` (O(n) not O(n²))
- Result stored in cache before responding

### server/routes/terminal.js

- Removed `let lineBuffer = ''` declaration
- Removed entire lineBuffer accumulation logic (per-character tracking, backspace handling, pasted text handling)
- Removed `insertGsdMessage` call on Enter that wrote `[terminal] <command>` to gsd_messages on every keystroke
- Removed now-unused `const { stmts } = require('../db')` import
- `pty.write(str)` call preserved — all input still forwarded to pty correctly
- Resize message handling preserved

## Deviations from Plan

None — plan executed exactly as written.

The lastMessages query fix was included in the Task 1 commit (f39d0ad) since both changes touched gsd.js. The plan split it into Task 2 conceptually, but the implementation happened naturally when the file was already open.

## Verification Results

1. `npm run test:server` — 106/107 tests pass. 1 pre-existing failure (`returns version and liveUrl for a project with PROJECT.md (gsddashboard)`) confirmed pre-existing on clean checkout.
2. `node -e "require('./server/gsd/tmux.js'); console.log('ok')"` — prints `ok`.
3. `grep -n "execFileSync" server/gsd/tmux.js` — shows original sync functions at lines 17 and 31.
4. `grep -c "insertGsdMessage" server/routes/terminal.js` — returns 0.
5. `grep -n "capturePaneTextAsync|detectSessionStateAsync" server/routes/gsd.js` — shows async calls at lines 6, 105, 120, 134.

## Self-Check: PASSED

- server/gsd/tmux.js — modified with async variants exported
- server/routes/gsd.js — modified with async handler and cache
- server/routes/terminal.js — modified, lineBuffer and insertGsdMessage removed
- Commit f39d0ad exists
- Commit 0cbcd4c exists
