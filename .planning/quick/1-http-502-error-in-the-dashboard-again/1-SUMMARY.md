# Quick Task 1: HTTP 502 Error Fix

**Date:** 2026-03-28
**Status:** Complete

## Root Cause

Node v24's `--watch` mode forks a supervised child process to run the actual server. When the child process hangs (event loop blocked, OOM), it stays alive but stops serving requests. The watch supervisor only restarts on file changes or process exit, not on health degradation — so the server becomes permanently unresponsive until manually restarted.

## Changes Made

### 1. Scoped watch path (`package.json`)
- Changed `node --watch` to `node --watch-path=server`
- Prevents unnecessary restarts from non-server file changes
- More predictable watch behavior

### 2. EADDRINUSE error handler (`server/index.js`)
- Added `server.on('error')` handler in `startServer()`
- If port is already bound, process exits cleanly instead of hanging with an unresolved Promise

### 3. Event loop liveness watchdog (`server/index.js`)
- Added a heartbeat timer that ticks every 10s
- A separate check timer detects if the heartbeat hasn't ticked in 30s
- If the event loop is blocked for >30s, the process exits with code 1
- Node `--watch` mode auto-restarts the process on exit, recovering from hangs

## Files Modified

- `package.json` — `dev:server` script
- `server/index.js` — `startServer()` error handling + watchdog timer

## Verification

- Server starts and responds HTTP 200 on `/api/health`
- 96/100 server tests pass (4 pre-existing failures unrelated to changes)
