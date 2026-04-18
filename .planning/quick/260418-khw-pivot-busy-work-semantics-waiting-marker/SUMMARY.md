---
quick_id: 260418-khw
slug: pivot-busy-work-semantics-waiting-marker
status: complete
completed: 2026-04-18
---

# Summary — 260418-khw Pivot Busy-Work Semantics

Follow-up to Phase 49. User corrected the semantic model: "waiting" means
waiting for *human input*, not "Claude is at a prompt". A session with
in-flight background work is logically "Working".

## Changes

1. **`server/gsd/stateBroadcaster.js`** — when `hasBusyMarkers && detectedState==='waiting'`,
   emit `sessionState='working'` in both the tracked snapshot and the broadcast payload.
   Pane-hash tracking and `stateEnteredAt` semantics unchanged. (commit `1a97d44`)

2. **`server/gsd/idleDetector.js`** — removed the 6h force-kill branch entirely
   (`_isStuckWorking`, `FORCE_KILL_WORKING_THRESHOLD_MS`, `forceKillIfOverdue`,
   `_forceKill`). `working` state now short-circuits to `null` (no auto-close).
   User prefers manual intervention over auto-kill. (commit `46f687d`)

3. **`client/src/pages/GSD.tsx` + `client/src/components/ChatListView.tsx`** —
   removed the `· bg` / `· bg (N)` suffix from the state badge/row info.
   State now reads "Working" directly (thanks to change #1). Tooltip
   (`humanizeBusyMarkers`) preserved on the state pill so users can still
   inspect kind/count. (commit `601a7cf`)

4. **`.claude/hooks/gsd-busy-marker.js`** — fixed the PostToolUse(Agent|Task)
   clear path. Root cause: the hook matched by `tool_use_id` on PostToolUse
   but the Agent PreToolUse event stores the id as the marker's `id`. Hook
   now matches against both `tool_use_id` and `id` fields when clearing
   agent/task markers. (commit `1e6bf92`)

## Tests

- `server/__tests__/stateBroadcaster.test.js` — 4 new `khw.pivot` tests pass
- `server/__tests__/idle-detector.test.js` — stuck-working tests removed; all
  remaining tests + busy-marker skip tests pass
- `.claude/hooks/__tests__/gsd-busy-marker.test.js` — clear-path test pass
- Full targeted suite: 38/38 server tests pass + 10/10 hook tests pass
- Client test failures (55/135) are pre-existing, unrelated (AgentCard,
  EmptyState, PricingEditor, etc.) — same failures on master without this change

## Live Verification

- Pushed to GitHub, deployed to Railway, restarted local PM2 gsd-dashboard
- Stale `agent` markers in `data/busy-markers/gsddashboard.json` cleaned up
- Test marker on PRC (waiting pane) → API `state='working'` ✓
- Remove marker → API `state='waiting'` ✓
- gsddashboard (live Claude session) shows `state='working'` via organic markers ✓

## Files Changed

- server/gsd/stateBroadcaster.js
- server/gsd/idleDetector.js
- server/__tests__/stateBroadcaster.test.js
- server/__tests__/idle-detector.test.js
- client/src/pages/GSD.tsx
- client/src/components/ChatListView.tsx
- .claude/hooks/gsd-busy-marker.js
- .claude/hooks/__tests__/gsd-busy-marker.test.js
