---
phase: 37-auth-terminal-reliability
plan: 02
subsystem: infra
tags: [websocket, terminal, xterm, keepalive, reconnect, node-pty]

requires: []
provides:
  - Terminal WebSocket ping/pong keepalive (20s interval) to prevent Railway proxy idle kills
  - Auto-reconnect in TerminalOverlay with retry counter and user-visible status messages
affects: [terminal, GSD.tsx, TerminalOverlay]

tech-stack:
  added: []
  patterns:
    - "ws.isAlive flag reset on pong, terminated on missed pong — same pattern as server/websocket.js heartbeat"
    - "connectWs() inner function for WebSocket lifecycle allowing reconnect without xterm re-init"
    - "wsRef.current routing for all ws.send() calls so reconnected socket is used automatically"

key-files:
  created: []
  modified:
    - server/routes/terminal.js
    - client/src/pages/GSD.tsx

key-decisions:
  - "20s keepalive interval (more aggressive than 30s main WS) — terminal proxies are less tolerant of idle"
  - "Reconnect reuses existing xterm Terminal instance to preserve scrollback and avoid re-init flicker"
  - "Clean close codes (1000, 4004, 4005) bypass reconnect loop to prevent spurious retries"
  - "Cap retries at 10 with visible attempt count in terminal output"

patterns-established:
  - "All ws.send() calls inside TerminalOverlay route through wsRef.current (not closed-over ws) to work after reconnect"

requirements-completed: [TERM-01, TERM-02]

duration: 15min
completed: 2026-04-07
---

# Phase 37 Plan 02: Terminal Keepalive & Auto-Reconnect Summary

**WebSocket ping/pong keepalive (20s) on terminal backend + client auto-reconnect with 10-retry cap and visible status messages**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-07T00:00:00Z
- **Completed:** 2026-04-07
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Server pings each terminal WebSocket every 20 seconds — dead connections terminated, keeping Railway proxy from killing idle sessions
- Client reconnects automatically on unexpected close, retrying up to 10 times with 2s delay and showing attempt number in the terminal
- All keystroke/scroll/resize handlers now route through `wsRef.current` so they work correctly after a reconnect without recreating the xterm instance
- Interval cleanup added to both `ws.on('close')` and `pty.onExit` to prevent memory leaks

## Task Commits

1. **Task 1: Server — ping/pong keepalive** - `554a37f` (feat)
2. **Task 2: Client — auto-reconnect in TerminalOverlay** - `f934958` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `server/routes/terminal.js` — Added per-connection keepalive interval with isAlive/pong tracking; clearInterval on close and pty exit
- `client/src/pages/GSD.tsx` — Extracted `connectWs()` inner function, added retry counter, updated all ws.send() calls to use wsRef.current

## Decisions Made
- 20s ping interval chosen (vs 30s in main WS) — terminal proxies are less tolerant of idle gaps
- Reuse `termRef.current` on reconnect, not recreate — preserves terminal history and avoids flicker
- Skip reconnect for code 1000 (clean close), 4004 (session inactive), 4005 (node-pty unavailable) — these are intentional closures
- Max 10 retries — prevents infinite loops if backend is permanently down

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in GSD.tsx (TouchEvent type on generic Element queries, unused ProjectCard) — confirmed pre-existing via git stash test; not caused by these changes and out of scope
- Pre-existing `readProjectMeta` server test failure — unrelated to terminal; confirmed pre-existing

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Terminal WebSocket is now resilient to Railway proxy idle timeouts and transient network drops
- Client shows reconnect progress in the terminal itself — users see yellow "Reconnecting..." messages
- Ready to proceed to remaining 37-xx plans (auth reliability, light mode)

---
*Phase: 37-auth-terminal-reliability*
*Completed: 2026-04-07*
