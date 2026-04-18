---
phase: 49-idle-detector-busy-work-awareness-prevent-auto-close-of-clau
plan: 03
subsystem: idle-detector/busy-markers/ui
tags: [api, websocket, ui, disk-prune, busy-markers]
requires:
  - busyMarkers.getMarkers
  - busyMarkers.sweepExpired
provides:
  - /api/gsd/projects busy_markers field (omitted when count=0)
  - project_state_change WS busy_markers field (omitted when count=0)
  - waiting · bg sub-state badge on project cards + ChatListView
  - server/gsd/busyMarkers-sweep.cjs CLI entrypoint
  - disk-prune.sh idle-skip.log + busy-marker sweep
affects:
  - /data/home/.local/bin/disk-prune.sh (system file — outside repo; manually maintained)
tech_stack:
  added: []
  patterns: [optional-field-omit-for-backcompat, absence-as-clear-ws, same-state-broadcast-on-aux-change, sweep-cli-wrapper]
key_files:
  created:
    - server/gsd/busyMarkers-sweep.cjs
  modified:
    - server/gsd/stateBroadcaster.js
    - server/routes/gsd.js
    - server/__tests__/stateBroadcaster.test.js
    - client/src/lib/types.ts
    - client/src/pages/GSD.tsx
    - client/src/components/ChatListView.tsx
    - /data/home/.local/bin/disk-prune.sh
decisions:
  - Use absence-as-clear in WS: server omits `busy_markers` when count=0; client treats absence as clear
  - Broadcast on busy_markers change within same sessionState (otherwise UI lags 60s+ while idle)
  - Preserve stateEnteredAt on marker-only change (only sessionState transitions reset it)
  - Live dashboard path is GSD.tsx (ProjectCard defined inline) + ChatListView.tsx — NOT a standalone ProjectCard.tsx file (which does not exist)
  - Badge uses title-attribute tooltip (no shadcn Tooltip dependency needed)
metrics:
  duration_minutes: 35
  completed_date: 2026-04-18
  tasks_completed: 3  # plus checkpoint task 4 pending user verification
  tests_added: 5
---

# Phase 49 Plan 03: Surface busy markers to UI + disk-prune extension — Summary

Threads `busy_markers: {count, kinds}` from the Plan 01 subsystem through the
state broadcaster → `/api/gsd/projects` → WebSocket → client UI, renders a
`waiting · bg` badge on waiting cards with an in-flight-work tooltip, and
wires the weekly `disk-prune.sh` to sweep expired marker files + rotate
idle-skip audit logs.

## What Was Built

### Server

**`server/gsd/stateBroadcaster.js`** — injectable `getBusyMarkersFn`
(defaults to `busyMarkers.getMarkers`); each poll computes
`markersInfo = getBusyMarkersFn(tmux_session)` and stores `busy_markers`
in the snapshot only when `count > 0`. Three broadcast branches updated:

- **Initial seed** — silent (no broadcast), busy_markers stored if present.
- **Transition (state changed)** — broadcast includes
  `...(busy_markers ? { busy_markers } : {})` so the key is omitted when
  empty; response is byte-identical to pre-phase for common path.
- **Same-state tick** — shallow-compare `JSON.stringify(prev.busy_markers)`
  vs current; when different, broadcast a `project_state_change` with
  `stateEnteredAt: prev.stateEnteredAt` (NOT reset). This is how the UI
  learns about marker appearance/clearance within ~2s while the session
  stays in `waiting`.

**`server/routes/gsd.js`** — imports `busyMarkers`, adds to the local-mode
`Promise.all` assembly:

```js
const bm = snapshotEntry?.busy_markers
  ?? (tmux_session ? busyMarkers.getMarkers(tmux_session) : { count: 0, kinds: [] });
// ... spread into return: ...(bm && bm.count > 0 ? { busy_markers: bm } : {})
```

Proxy-mode branch is untouched — upstream JSON already carries the field.

**`server/gsd/busyMarkers-sweep.cjs`** — one-shot executable CLI that calls
`busyMarkers.sweepExpired()` inside a `try`; on error, logs to stderr and
exits 0 so the cron never breaks.

### Client

**`client/src/lib/types.ts`** — new `BusyMarkers` type; optional field
added to `GsdProject` and `ProjectStateChangeEvent` (backward-compatible).

**`client/src/pages/GSD.tsx`**:
- `patchProjectsOnStateChange` implements **absence-as-clear**: when the
  incoming event lacks `busy_markers`, `delete patched.busy_markers`;
  when present, assign. This keeps the wire format minimal.
- New exported helper `humanizeBusyMarkers(bm)` produces tooltip text:
  `"N background task[s]"` for single kinds; `"N items: background task,
  running agent, scheduled wakeup"` for multi-kind.
- `ProjectCard` renders a `waiting · bg` badge (blue-tinted pill, same
  row as the sessionState label) only when
  `sessionState==='waiting' && busy_markers.count > 0`. Badge is additive —
  the primary `Working / Waiting / Paused` label is unchanged.

**`client/src/components/ChatListView.tsx`** — live dashboard list path.
Appends ` · bg (N)` to the list row info text and sets a `title` tooltip
listing kinds when markers are present and sessionState is waiting.

### disk-prune.sh (system file, outside repo)

`/data/home/.local/bin/disk-prune.sh` extended with two blocks inserted
immediately before the `after=$(df -P /data ...)` footer:

```bash
# Phase 49: idle-skip audit log retention (30 days)
find /data/home/gsddashboard/data/logs -type f -name 'idle-skip.log*' -mtime +30 -delete 2>>"$LOG" || true

# Phase 49: sweep expired busy markers (file-level cleanup)
if [ -f /data/home/gsddashboard/server/gsd/busyMarkers-sweep.cjs ]; then
  node /data/home/gsddashboard/server/gsd/busyMarkers-sweep.cjs >>"$LOG" 2>&1 || true
fi
```

Both guards use `|| true` so a sweep failure never breaks the weekly cron.
Verified end-to-end: `bash -n` passes, `bash disk-prune.sh` runs cleanly
(`=== prune done` written to `~/.cache/disk-prune.log`).

## Tests

- **`server/__tests__/stateBroadcaster.test.js`** — 5 new tests (13 total
  in the file; all pass). Coverage:
  1. Transition WITH markers → payload includes `busy_markers`
  2. Transition WITHOUT markers → key omitted from payload
  3. Same-state tick, markers newly appear → broadcast fires, `stateEnteredAt` preserved
  4. Same-state tick, markers unchanged → no broadcast
  5. Same-state tick, markers clear → broadcast fires, key omitted

All 5 use injected `getBusyMarkersFn` (no disk I/O).

Full `npm run test:server` exits 0 (30/30 relevant tests green across
busy-markers + idle-detector + stateBroadcaster suites).

Client `vitest` run: 133/135 tests pass — same as main repo, 2 pre-existing
sidebar/hooks failures unrelated to this plan. Reducer test
`patchProjectsOnStateChange.test.ts` (2/2) green.

TypeScript: worktree `npx tsc --noEmit` reports 30 errors, identical to
main repo pre-existing count (no new errors from this plan).

## Deviations from Plan

- **Plan specified `client/src/components/ProjectCard.tsx`** as a target
  file, but that file does not exist in the repo. The `ProjectCard` React
  component lives inline in `client/src/pages/GSD.tsx`. Applied all badge
  + helper changes there; also extended `ChatListView.tsx` (the current
  live list path per CONTEXT.md Phase 43 precedent). This is a Rule 3
  blocker — missing file turned out to not exist; used the real host file.
- **Plan's example uses `stateSnapshot?.get?.(name)`** — but
  `getProjectStateSnapshot()` returns an object, not a Map. Used
  `stateSnapshot[name]` via the existing `snap` local variable.

No architectural changes (Rule 4 was not triggered).

## Commits

- `ec0f74b` — feat(49-03): thread busy_markers through stateBroadcaster + /api/gsd/projects
- `76c4c7d` — feat(49-03): render waiting · bg badge + absence-as-clear WS reducer
- disk-prune.sh — edited in place at `/data/home/.local/bin/disk-prune.sh`
  (outside repo; no commit — manual file maintained by user).

## Deferred Issues

None introduced. Pre-existing unrelated TS/test failures tracked in
`deferred-items.md` from earlier plans.

## Checkpoint Status

**Resolved 2026-04-18.** Verified by orchestrator against live Railway URL:
- `busy_markers: {count, kinds}` threads through API when present (confirmed for `gsddashboard` organic markers and `prc` test marker).
- Key OMITTED from API response when count=0 (confirmed `has("busy_markers") === false` for projects without markers).
- Sweep CLI (`busyMarkers-sweep.cjs`) exits 0 cleanly.
- Hook PreToolUse fired organically on Agent spawns during this very session — end-to-end system working.

**Follow-up tweaks deferred to a quick task (not blockers):**
1. Pivot state semantics — when markers present, report `state='working'` (not `'waiting · bg'`). User's mental model: waiting means "needs human input".
2. Remove 6h force-kill branch from `idleDetector.js` — user prefers manual intervention over auto-kill.
3. Fix SubagentStop clear path — `agent` markers for background Agent calls aren't being cleared on completion (TTL purges after 2h, but eager clear should fire).

## Self-Check: PASSED

- server/gsd/busyMarkers-sweep.cjs — FOUND (executable, exits 0)
- server/gsd/stateBroadcaster.js — MODIFIED (busy_markers threaded through 3 branches)
- server/routes/gsd.js — MODIFIED (busy_markers spread into response)
- server/__tests__/stateBroadcaster.test.js — MODIFIED (+5 tests, 13/13 pass)
- client/src/lib/types.ts — MODIFIED (BusyMarkers + optional field)
- client/src/pages/GSD.tsx — MODIFIED (reducer, humanizeBusyMarkers, badge)
- client/src/components/ChatListView.tsx — MODIFIED (bg hint + tooltip)
- /data/home/.local/bin/disk-prune.sh — MODIFIED (2 new Phase 49 blocks, bash -n valid, e2e run green)
- Commit ec0f74b — FOUND in git log
- Commit 76c4c7d — FOUND in git log
