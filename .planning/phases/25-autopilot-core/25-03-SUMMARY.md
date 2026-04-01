---
phase: 25-autopilot-core
plan: 03
subsystem: ui
tags: [react, typescript, websocket, autopilot, eventbus, tailwind]

# Dependency graph
requires:
  - phase: 25-02
    provides: "Autopilot REST API endpoints (start/pause/resume/status/plan-all) and AutopilotManager.getStatus()"
provides:
  - "AutopilotRun and AutopilotProgressEvent types in client/src/lib/types.ts"
  - "api.autopilot.{start,pause,resume,status,planAll} methods in client/src/lib/api.ts"
  - "AutopilotControls component with full idle/running/paused/halted state display"
  - "Per-card autopilot progress via autopilotRuns Map + eventBus WS subscription"
  - "WSMessage union extended with autopilot_progress type"
affects: [27-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "eventBus.subscribe() pattern for WS message consumption in page components (consistent with existing App.tsx → eventBus.publish() pattern)"
    - "autopilotRuns Map<projectName, AutopilotRun> for per-project autopilot state derived from WS events"

key-files:
  created: []
  modified:
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/pages/GSD.tsx

key-decisions:
  - "Used eventBus.subscribe() in GSD.tsx instead of direct useWebSocket — consistent with existing architecture where App.tsx handles the WS connection and publishes to eventBus; GSD components consume via subscribe"
  - "AutopilotControls placed before the Archive button in non-archived cards — logical grouping of project-action controls"
  - "WS autopilot_progress 'planning'/'executing' statuses mapped to 'running' in the client state (server sends fine-grained progress, UI collapses to simpler states)"

patterns-established:
  - "AutopilotControls: self-contained component with local busy state; parent GSD() owns autopilotRuns map updated from WS"

requirements-completed: [AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-07]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 25 Plan 03: Autopilot UI Controls Summary

**Autopilot controls on project cards — Plan All + Run/Pause/Resume buttons with real-time phase progress via WebSocket eventBus integration**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-01T14:00:00Z
- **Completed:** 2026-04-01T14:15:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `AutopilotRunStatus`, `AutopilotRun`, `AutopilotProgressEvent` types and extended `WSMessage` union to include `autopilot_progress`
- Added all 5 `api.autopilot.*` methods (start, pause, resume, status, planAll) to api.ts
- Built `AutopilotControls` component with full lifecycle: idle shows Plan All + Run Autopilot, running shows Pause + phase progress, paused shows Resume + "Paused" label, halted shows "Circuit open"
- Wired `eventBus.subscribe()` in GSD() to update per-project `autopilotRuns` Map on incoming `autopilot_progress` WS messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AutopilotStatus types and api.autopilot methods** - `6e03a9c` (feat)
2. **Task 2: Add AutopilotControls to ProjectCard and wire WebSocket progress** - `8ea70be` (feat)

## Files Created/Modified
- `client/src/lib/types.ts` - Added AutopilotRunStatus, AutopilotRun, AutopilotProgressEvent; extended WSMessage union
- `client/src/lib/api.ts` - Added api.autopilot.{start,pause,resume,status,planAll} methods
- `client/src/pages/GSD.tsx` - Added AutopilotControls component, autopilotRuns state, eventBus subscription, autopilotRun prop on ProjectCard

## Decisions Made
- Used `eventBus.subscribe()` in GSD.tsx instead of a direct `useWebSocket` hook — the plan mentioned `useWebSocket` but GSD.tsx doesn't own the WS connection; App.tsx does and publishes via eventBus. Following existing architecture.
- WS `planning`/`executing` progress event statuses mapped to `running` client state — the server sends fine-grained progress but the UI uses simpler states for button visibility logic.

## Deviations from Plan

**1. [Rule 1 - Bug] Used eventBus.subscribe instead of direct useWebSocket**
- **Found during:** Task 2 (wiring WS progress)
- **Issue:** Plan specified `useWebSocket(useCallback((msg) => {...}))` pattern in GSD.tsx, but GSD.tsx doesn't use `useWebSocket` — the hook is used only in App.tsx which publishes to eventBus. Adding a second WS connection from GSD.tsx would create a duplicate connection.
- **Fix:** Used `eventBus.subscribe()` consistent with how other page components would consume WS events
- **Files modified:** client/src/pages/GSD.tsx (also added `import { eventBus }`)
- **Verification:** Build passes, pattern consistent with existing App.tsx architecture
- **Committed in:** 8ea70be (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - architectural alignment)
**Impact on plan:** Fix necessary for correctness — prevents duplicate WS connections. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `GSD.tsx` (unused imports, ref readonly assignments, touchevent overloads) and `GsdProject.test.ts` (missing tmuxSession field) were present before this plan — confirmed via git stash test. Scope boundary observed; not fixed.
- Pre-existing Sidebar test failures (2 tests) confirmed pre-existing; not caused by this plan.

## Next Phase Readiness
- Autopilot UI controls are complete; the full end-to-end loop (Phase 25-01 manager + Phase 25-02 API + Phase 25-03 UI) is now wired together
- Phase 27 (UX polish) can build on the autopilot pause card state
- No blockers

---
*Phase: 25-autopilot-core*
*Completed: 2026-04-01*
