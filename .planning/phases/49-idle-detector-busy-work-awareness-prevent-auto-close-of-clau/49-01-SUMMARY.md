---
phase: 49-idle-detector-busy-work-awareness-prevent-auto-close-of-clau
plan: 01
subsystem: idle-detector/busy-markers
tags: [hooks, idle-detector, file-io, busy-markers]
requires: []
provides:
  - busyMarkers.writeMarker
  - busyMarkers.clearMarker
  - busyMarkers.hasBusyMarkers
  - busyMarkers.getMarkers
  - busyMarkers.sweepExpired
  - data/busy-markers/<session>.json schema
  - .claude/hooks/gsd-busy-marker.js (PreToolUse/PostToolUse/SubagentStop/Stop)
affects:
  - .claude/settings.json (hook registrations appended)
tech_stack:
  added: []
  patterns: [sync-fs-io, per-session-json, atomic-tmp-rename, ttl-purge-on-read, path-traversal-guard]
key_files:
  created:
    - server/gsd/busyMarkers.js
    - server/__tests__/busy-markers.test.js
    - .claude/hooks/gsd-busy-marker.js
    - .claude/hooks/__tests__/gsd-busy-marker.test.js
    - .planning/phases/49-idle-detector-busy-work-awareness-prevent-auto-close-of-clau/deferred-items.md
  modified:
    - .claude/settings.json
decisions:
  - TTL defaults: bash_bg=4h, agent=2h, wakeup=caller-delay+5min grace
  - Per-session JSON file at data/busy-markers/<session>.json (not single file, avoids cross-project write contention)
  - Atomic write via tmp+rename; read failures treated as empty
  - Hook resolves tmux session via gsd-projects.json walk-up (test override via GSD_PROJECTS_PATH)
  - GSD_BUSY_MARKERS_DIR env override for hook test isolation
  - All hook errors swallowed; stderr-only logging; always exit 0
metrics:
  duration_minutes: 23
  completed_date: 2026-04-18
  tasks_completed: 2
  tests_added: 20
---

# Phase 49 Plan 01: Busy-Marker Subsystem Foundation — Summary

Per-session busy-marker store + Claude Code hook handler that writes/clears markers
on PreToolUse(Bash run_in_background), PreToolUse(Agent|Task), PostToolUse(Bash),
SubagentStop, and Stop(scheduled_wakeup). Establishes the signal source Plans 02
and 03 will consume.

## What Was Built

### `server/gsd/busyMarkers.js` (helper)

Stable public API — Plan 02 and Plan 03 depend on these signatures:

```js
module.exports = {
  writeMarker(sessionName, { id, kind, ttlMs, toolName, note }),
  clearMarker(sessionName, id),
  hasBusyMarkers(sessionName),        // → boolean
  getMarkers(sessionName),            // → { count, kinds: string[] }
  sweepExpired(),
  _setBaseDir(dir),                   // test hook
};
```

Storage: `data/busy-markers/<session>.json` with schema
`{ markers: [{ id, kind, started_at, ttl_ms, tool_name, note }] }`.

Implementation highlights:
- Sync `fs` throughout (idle-detector tick + hook one-shots — no async win)
- Atomic writes via `.tmp` + `fs.renameSync`
- Expiry purged on read (`hasBusyMarkers`, `getMarkers`) as a side effect;
  file deleted when last marker is removed or all expire
- Path-traversal guard rejects `/`, `\`, `..` in sessionName
- TTL defaults keyed by kind: `bash_bg=14_400_000`, `agent=7_200_000`,
  `wakeup=300_000` (wakeup callers should pass explicit delay + 5min grace)

### `.claude/hooks/gsd-busy-marker.js` (hook handler)

Fail-safe Claude Code hook (5s stdin timeout, `try/catch` around all logic,
always exits 0, stderr-only logging). Event matrix:

| Event | Condition | Action |
|-------|-----------|--------|
| PreToolUse | `tool_name=Bash` AND `tool_input.run_in_background===true` | `writeMarker({ kind:'bash_bg' })` |
| PreToolUse | `/^(Agent\|Task)$/.test(tool_name)` | `writeMarker({ kind:'agent' })` |
| PostToolUse | `tool_name=Bash` | `clearMarker(tool_use_id)` |
| SubagentStop | — | `clearMarker(tool_use_id)` |
| Stop | `scheduled_wakeup_at` / `stop_reason==='schedule_wakeup'` / `wakeup_delay_ms>0` | `writeMarker({ kind:'wakeup', ttlMs: delay+300_000 })` |

tmux session resolved from cwd via `gsd-projects.json` (walk-up search; override
via `GSD_PROJECTS_PATH` for tests). Path-traversal guard on resolved
`tmux_session`. Busy-markers base dir overridable via `GSD_BUSY_MARKERS_DIR` for
test isolation.

### `.claude/settings.json` wiring

Appended (existing entries preserved byte-for-byte):
- PreToolUse: `Bash` matcher → busy-marker hook (5s timeout)
- PreToolUse: `Agent|Task` matcher → busy-marker hook
- PostToolUse: `Bash` matcher → busy-marker hook
- Top-level `SubagentStop` and `Stop` arrays with single hook entry each

Final shape: PreToolUse=6 entries, PostToolUse=3 entries, SubagentStop=1, Stop=1.

## Tests

**25 tests pass** across three test files:

- `server/__tests__/busy-markers.test.js` — 12 unit tests (write/upsert/clear/TTL/
  has/sweep/getMarkers/invalid-name). Uses `fs.mkdtempSync(os.tmpdir())` + `_setBaseDir`
  so no writes escape the temp dir.
- `.claude/hooks/__tests__/gsd-busy-marker.test.js` — 8 smoke tests via
  `child_process.spawnSync`: every event branch, malformed JSON fail-safe,
  out-of-project cwd, and a path-traversal attack (`tmux_session='../pwned'`
  produces no file anywhere).
- `server/__tests__/idle-detector.test.js` — 5 unchanged tests still pass
  (no regression on adjacent subsystem).

Verification commands:
```bash
npx node --test server/__tests__/busy-markers.test.js
npx node --test .claude/hooks/__tests__/gsd-busy-marker.test.js
```

## Deviations from Plan

None — plan executed as written. All acceptance criteria satisfied.

## Downstream Contract (for Plan 02 / Plan 03)

- Plan 02 (idle-detector integration): call `busyMarkers.hasBusyMarkers(project.tmux_session)`
  inside `_testCheckAndCloseSession` after idle threshold; return
  `{ action: 'skipped', reason: 'busy-markers-present', markers }` when true. The
  read is cheap (single small JSON file per project) and self-prunes expired.
- Plan 03 (UI surface): call `busyMarkers.getMarkers(tmux_session)` → pass
  `busy_markers: { count, kinds }` through `stateBroadcaster.js` to the projects
  WS message. Kinds are already deduped + sorted.

## Commits

- `933945a` — `feat(49-01): add busyMarkers helper with TTL fallback + unit tests`
- `fe2ea3f` — `feat(49-01): add gsd-busy-marker hook handler + settings wiring + smoke tests`

## Deferred Issues

Pre-existing failures in `npm run test:server` unrelated to this plan; logged
to `deferred-items.md`:

- `app-settings-route.test.js:151` — DB state leak from Phase 48
- `autopilotManager.test.js:275` + open-handle leak — unrelated
- `tmux.test.js:136` — STAT-02 heuristic regression from Phase 43

## Self-Check: PASSED

- server/gsd/busyMarkers.js — FOUND
- server/__tests__/busy-markers.test.js — FOUND
- .claude/hooks/gsd-busy-marker.js — FOUND (executable, `#!/usr/bin/env node`)
- .claude/hooks/__tests__/gsd-busy-marker.test.js — FOUND
- .claude/settings.json — FOUND (SubagentStop=1, Stop=1, Bash/Agent|Task PreToolUse entries present)
- Commit 933945a — FOUND in git log
- Commit fe2ea3f — FOUND in git log
- 20 new tests added; 25/25 total relevant tests pass
