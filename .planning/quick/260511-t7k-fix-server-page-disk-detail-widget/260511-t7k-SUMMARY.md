---
phase: quick-260511-t7k
plan: 01
subsystem: server-monitor
tags: [bug-fix, server-page, disk-monitoring, websocket]
key-files:
  modified:
    - client/src/lib/api.ts
    - client/src/lib/types.ts
    - client/src/pages/ServerPage.tsx
    - server/routes/system.js
    - server/index.js
decisions:
  - "Added feed_event to WSMessage type union to fix pre-existing TS overlap errors surfaced by making union exhaustive"
  - "Used Vite build (client npm run build) since top-level build script only echoes — client dist needed explicit rebuild"
metrics:
  duration: ~18 minutes
  completed: "2026-05-11"
  tasks: 2
  files: 5
---

# Quick Task 260511-t7k: Fix Server Page Crash + Disk Detail Widget

**One-liner:** Fixed `api.get is not a function` crash in ServerPage, added `/api/system/disk-detail` directory breakdown endpoint, and wired WebSocket `system:disk-warning` broadcast + banner UI.

## What Was Built

### Task 1 — Fix api.get bug and add api.system namespace (cfa868d)

**Root cause:** `ServerPage.tsx` called `api.get<SystemStats>("/api/system")` but the `api` object has no top-level `.get()` — it only has namespaced sub-objects. Minified as "ye.get is not a function" in production.

**Changes:**
- `client/src/lib/api.ts`: Added `system: { get, diskDetail }` namespace; imported `SystemStats` and `DiskDetailEntry` from types.
- `client/src/lib/types.ts`: Added `SystemStats`, `SystemCpuStats`, `SystemMemStats`, `SystemDiskEntry`, `SystemProcessEntry`, `DiskDetailEntry`, `DiskWarningEvent` interfaces. Extended `WSMessage.type` union with `"system:disk-warning"` and `"feed_event"`. Added `DiskWarningEvent` and `FeedEntry` to `WSMessage.data` union.
- `client/src/pages/ServerPage.tsx`: Replaced `api.get<SystemStats>("/api/system")` with `api.system.get()`. Added `diskDetail` + `diskWarning` state. Added `eventBus.subscribe` for `system:disk-warning` messages. Added disk warning banner (orange/red) and Directory Breakdown widget at page bottom.

### Task 2 — disk-detail endpoint + WS disk-warning broadcast (161df3f)

**Changes:**
- `server/routes/system.js`: Added `GET /disk-detail` route running `du -sh` on 5 hardcoded directories with 5s timeout and per-dir error handling.
- `server/index.js`: Added `broadcast("system:disk-warning", ...)` calls in existing maintenance loop — at critical (>=95%), warning (>=85%), and clear (<80%) threshold transitions.

## Verification

- `npm run test:client`: 144 tests passed (18 test files)
- `client npm run build`: Vite compiled 2034 modules, no TS errors in changed files
- `curl /api/system/disk-detail`: Returns 5 dirs (`/var/log`, `/home/services`, `/home/claude/.pm2/logs`, `/home/services/gsddashboard/data`, `/home/services/gsddashboard/logs`)
- Playwright E2E (localhost with auth cookie): "CPU Load Average appeared", "Directory Breakdown appeared", no JS errors, PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Type Coverage] Added feed_event to WSMessage union**
- **Found during:** Task 1 TypeScript check
- **Issue:** Adding `system:disk-warning` to `WSMessage.type` union surfaced pre-existing TS errors in `Dashboard.tsx` and `FeedPage.tsx` comparing against `"feed_event"` which was never in the union.
- **Fix:** Added `"feed_event"` to `WSMessage.type` union and `FeedEntry` to `WSMessage.data` union.
- **Files modified:** `client/src/lib/types.ts`
- **Commit:** cfa868d

**2. [Rule 3 - Blocking] Ran Vite build explicitly**
- **Found during:** Playwright verification
- **Issue:** Top-level `npm run build` only echoes "client/dist pre-built and committed" — it does not actually rebuild. The old bundle was served, so new code wasn't live.
- **Fix:** Ran `cd client && npm run build` (Vite) before pm2 restart.
- **Files modified:** `client/dist/` (built artifacts)

## Known Stubs

None — all five directories return real `du -sh` sizes. `/var/log` returns "unavailable" due to permission denied, which is correct behavior handled by the error field.

## Self-Check

- [x] `client/src/lib/api.ts` — modified, committed in cfa868d
- [x] `client/src/lib/types.ts` — modified, committed in cfa868d
- [x] `client/src/pages/ServerPage.tsx` — modified, committed in cfa868d
- [x] `server/routes/system.js` — modified, committed in 161df3f
- [x] `server/index.js` — modified, committed in 161df3f
- [x] Playwright: PASS (CPU Load Average, Directory Breakdown, no crash)
- [x] pm2 gsd-dashboard: online

## Self-Check: PASSED
