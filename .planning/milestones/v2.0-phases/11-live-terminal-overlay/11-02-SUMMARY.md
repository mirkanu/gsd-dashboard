---
phase: 11-live-terminal-overlay
plan: "02"
subsystem: frontend
tags: [xterm, websocket, terminal, overlay, react]

# Dependency graph
requires:
  - phase: 11-01
    provides: /ws/terminal/:name WebSocket bridge and node-pty backend
provides:
  - TerminalOverlay component in client/src/pages/GSD.tsx
  - "Open terminal" button in ProjectCard gated on tmuxActive
  - /api/gsd/ws-base endpoint for tunnel-aware WebSocket URL resolution
affects:
  - End users: full-screen interactive terminal access from dashboard

# Tech tracking
tech-stack:
  added: ["@xterm/xterm@^5", "@xterm/addon-fit@^0.10"]
  patterns:
    - xterm.js v5 Terminal + FitAddon for full-screen terminal rendering
    - /api/gsd/ws-base REST endpoint returns correct ws(s):// base URL for Railway/tunnel routing
    - useEffect cleanup closes WebSocket and disposes terminal on unmount
    - Escape keydown + close button both call onClose()

key-files:
  modified:
    - client/package.json
    - client/src/pages/GSD.tsx
    - client/src/components/__tests__/GsdProject.test.ts
    - server/routes/gsd.js
    - server/__tests__/api.test.js

key-decisions:
  - "TerminalOverlay fetches /api/gsd/ws-base before connecting — in Railway proxy mode this returns the Cloudflare tunnel URL so the browser connects directly to the local machine where tmux/node-pty live"
  - "server/routes/gsd.js ws-base endpoint returns wss://GSD_DATA_URL host when GSD_DATA_URL is set, otherwise derives from request Host header"
  - "websocket.js switched to noServer:true after ws library was calling abortHandshake(400) on /ws/terminal/* upgrade requests before our handler ran"
  - "node-pty installed as optionalDependencies — Railway builds succeed even if native compilation fails"
  - "tmuxActive enrichment left entirely to the upstream proxy response — local isTmuxSessionActive() is authoritative"

patterns-established:
  - "Railway WS routing: use /api/gsd/ws-base to get the correct ws host; browser must connect to tunnel directly, not Railway"

requirements-completed: [TERM-01, TERM-02, TERM-03, TERM-04]

# Metrics
duration: ~2h (including post-plan Railway routing fixes)
completed: 2026-03-25
---

# Phase 11 Plan 02: Frontend Terminal Overlay Summary

**xterm.js TerminalOverlay component wired to the backend WebSocket bridge, with Railway-aware WebSocket URL routing via /api/gsd/ws-base**

## Performance

- **Duration:** ~2h (including 4 post-plan Railway routing fix commits)
- **Started:** 2026-03-24T22:38Z
- **Completed:** 2026-03-25
- **Tasks:** 4 (3 auto + 1 human verify)
- **Files modified:** 5 + post-plan server fixes

## Accomplishments

- Installed @xterm/xterm and @xterm/addon-fit in client
- Added TerminalOverlay component to GSD.tsx: full-screen overlay with xterm.js terminal, FitAddon, WebSocket connection, bidirectional I/O, resize forwarding, Escape/close-button dismiss
- Added "Open terminal" button to ProjectCard, visible only when `project.tmuxActive` is true
- Added tmuxActive terminal button type-contract tests to GsdProject.test.ts
- Fixed Railway WebSocket routing: added /api/gsd/ws-base endpoint that returns the Cloudflare tunnel URL so the browser connects directly to the local machine
- Fixed websocket.js to use `noServer: true` after ws library was aborting /ws/terminal/ upgrades with 400

## Task Commits

1. **Task 1: Install @xterm/xterm + @xterm/addon-fit** — `e6b4329`
2. **Task 2: Add TerminalOverlay component and Open terminal button** — `0de8b3c`
3. **Task 3: Add tmuxActive terminal button contract tests** — `48c7bb5`
4. **Post-plan Railway routing fixes** — `d2f765b` (reverted), `9f60bf7` (revert), `698161e` (ws-base endpoint), `b709b0a` (noServer fix)
5. **Task 4: Human visual verification** — Approved 2026-03-25

## Files Created/Modified

- `client/package.json` — @xterm/xterm + @xterm/addon-fit added to dependencies
- `client/src/pages/GSD.tsx` — TerminalOverlay component, terminalProject state, "Open terminal" button in ProjectCard
- `client/src/components/__tests__/GsdProject.test.ts` — tmuxActive terminal button contract describe block
- `server/routes/gsd.js` — /api/gsd/ws-base endpoint
- `server/__tests__/api.test.js` — ws-base endpoint test

## Decisions Made

- /api/gsd/ws-base REST endpoint resolves correct WebSocket host at runtime — essential because in Railway mode the browser must connect to the Cloudflare tunnel (local machine), not to Railway which has no tmux
- `noServer: true` in websocket.js — the ws library's built-in upgrade handling called `abortHandshake(400)` before our route-specific handler ran; noServer mode gives us full control
- TerminalOverlay does not persist state between opens — each open creates a fresh terminal and WebSocket connection; tmux session preserves actual state

## Deviations from Plan

- Plan specified wsUrl built from `window.location.host` — Railway architecture required fetching /api/gsd/ws-base first instead; implemented via async fetch in useEffect before WebSocket creation
- Additional server-side changes (ws-base endpoint, noServer fix) not in original plan scope — required to make Railway deployment work

## Issues Encountered

- tmuxActive showing false on Railway: root cause was GSD_DATA_URL proxy correctly returning upstream value (no fix needed); bad enrichment attempt reverted
- WebSocket upgrade returning 400: ws library's default upgrade handler was intercepting /ws/terminal/ requests before our handler could claim them — fixed by switching to noServer:true
- ws-base endpoint needed for Railway: browser on railway.app cannot connect to ws://railway.app/ws/terminal/ because Railway has no tmux — must go through Cloudflare tunnel to local machine

## User Setup Required

None — no configuration changes needed. Works automatically when GSD_DATA_URL is set.

---
*Phase: 11-live-terminal-overlay*
*Completed: 2026-03-25*
